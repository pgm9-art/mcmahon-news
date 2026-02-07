const CHANNELS = [
  { name: 'Nick Fuentes', handle: 'nickjfuentes', subs: 200000 },
  { name: 'Stew Peters', handle: 'StewPeters', subs: 400000 }
];

const GIST_ID = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseRSSItem(xml) {
  const itemMatch = xml.match(/<item[\s>]([\s\S]*?)<\/item>/);
  if (!itemMatch) return null;
  const item = itemMatch[1];

  const getTag = (tag) => {
    const cdataMatch = item.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`));
    if (cdataMatch) return cdataMatch[1].trim();
    const simpleMatch = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return simpleMatch ? simpleMatch[1].trim() : '';
  };

  const title = getTag('title');
  const link = getTag('link');
  const pubDate = getTag('pubDate');
  let thumbnail = '';
  const thumbMatch = item.match(/url=["']([^"']*(?:\.jpg|\.png|\.webp)[^"']*)/i);
  if (thumbMatch) thumbnail = thumbMatch[1];

  if (!title || !link) return null;
  return { title, link, pubDate, thumbnail };
}

async function fetchWithRetry(url, headers, retries = 3) {
  for (let i = 0; i < retries; i++) {
    if (i > 0) {
      const delay = 5000 * i;
      console.log(`  Retry ${i}/${retries} after ${delay}ms...`);
      await sleep(delay);
    }
    const res = await fetch(url, { headers });
    if (res.ok) return { ok: true, text: await res.text() };
    console.log(`  Attempt ${i + 1}: HTTP ${res.status}`);
    if (res.status !== 429 && res.status !== 503) break;
  }
  return { ok: false, text: '' };
}

async function tryOpenRSS(channel) {
  const url = `https://openrss.org/feed/rumble.com/c/${channel.handle}`;
  console.log(`[${channel.name}] Trying OpenRSS...`);
  const res = await fetchWithRetry(url, {
    'User-Agent': 'McMahonNews/1.0 (news aggregator)',
    'Accept': 'application/rss+xml, application/xml, text/xml'
  });
  if (!res.ok) return null;
  console.log(`[${channel.name}] OpenRSS returned ${res.text.length} bytes`);
  return parseRSSItem(res.text);
}

async function tryRSSBridge(channel) {
  const bridges = [
    `https://rss-bridge.org/bridge01/?action=display&bridge=RumbleBridge&url=https://rumble.com/c/${channel.handle}&format=Atom`,
    `https://wtf.roflcopter.fr/rss-bridge/?action=display&bridge=RumbleBridge&url=https://rumble.com/c/${channel.handle}&format=Atom`
  ];
  for (const url of bridges) {
    console.log(`[${channel.name}] Trying RSS-Bridge...`);
    try {
      const res = await fetchWithRetry(url, {
        'User-Agent': 'McMahonNews/1.0'
      }, 1);
      if (!res.ok) continue;
      console.log(`[${channel.name}] RSS-Bridge returned ${res.text.length} bytes`);
      // Atom uses <entry> instead of <item>
      const text = res.text.replace(/<entry/g, '<item').replace(/<\/entry/g, '</item');
      const parsed = parseRSSItem(text);
      if (parsed) return parsed;
    } catch (e) {
      console.log(`[${channel.name}] RSS-Bridge error: ${e.message}`);
    }
  }
  return null;
}

async function tryRumbleUser(channel) {
  // Try Rumble's user endpoint which sometimes isn't behind Cloudflare
  const url = `https://rumble.com/user/${channel.handle}`;
  console.log(`[${channel.name}] Trying /user/ endpoint...`);
  try {
    const res = await fetchWithRetry(url, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html'
    }, 1);
    if (!res.ok) return null;
    // Look for video links in HTML
    const videoMatch = res.text.match(/href="(\/v[a-z0-9]+-[^"]+)"/);
    const titleMatch = res.text.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)/);
    if (videoMatch) {
      console.log(`[${channel.name}] Found video link: ${videoMatch[1]}`);
      return {
        title: titleMatch ? titleMatch[1].trim() : 'Unknown',
        link: `https://rumble.com${videoMatch[1]}`,
        pubDate: new Date().toISOString(),
        thumbnail: ''
      };
    }
  } catch (e) {
    console.log(`[${channel.name}] /user/ error: ${e.message}`);
  }
  return null;
}

async function updateGist(data) {
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${GIST_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: {
        'rumble-data.json': {
          content: JSON.stringify(data, null, 2)
        }
      }
    })
  });
  if (!response.ok) throw new Error(`Gist update failed: ${response.status}`);
  console.log('Gist updated successfully');
}

async function main() {
  console.log('=== Rumble Scraper v3 ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const results = {};

  for (let i = 0; i < CHANNELS.length; i++) {
    const channel = CHANNELS[i];
    if (i > 0) await sleep(3000); // Delay between channels

    console.log(`\n--- ${channel.name} (${channel.handle}) ---`);

    let video = await tryOpenRSS(channel);
    if (!video) { await sleep(2000); video = await tryRSSBridge(channel); }
    if (!video) { await sleep(2000); video = await tryRumbleUser(channel); }

    if (video) {
      results[channel.handle] = {
        id: video.link,
        title: video.title,
        url: video.link,
        thumbnail: video.thumbnail || '',
        source: channel.name,
        sourceHandle: channel.handle,
        platform: 'rumble',
        pubDate: video.pubDate || new Date().toISOString(),
        subs: channel.subs
      };
      console.log(`✓ ${channel.name}: ${video.title}`);
    } else {
      console.log(`✗ ${channel.name}: All methods failed`);
    }
  }

  const gistData = {
    lastUpdated: new Date().toISOString(),
    channels: results
  };

  await updateGist(gistData);
  console.log('\nDone!', JSON.stringify(gistData, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
