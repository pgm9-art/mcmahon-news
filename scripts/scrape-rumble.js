const CHANNELS = [
  { name: 'Nick Fuentes', handle: 'nickjfuentes', subs: 200000 },
  { name: 'Stew Peters', handle: 'StewPeters', subs: 400000 }
];

const GIST_ID = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;

async function fetchOpenRSS(channel) {
  const url = `https://openrss.org/feed/rumble.com/c/${channel.handle}`;
  console.log(`[${channel.name}] Trying OpenRSS: ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregator/1.0)' }
  });
  if (!res.ok) {
    console.log(`[${channel.name}] OpenRSS returned ${res.status}`);
    return null;
  }
  const xml = await res.text();
  console.log(`[${channel.name}] OpenRSS response length: ${xml.length}`);
  console.log(`[${channel.name}] OpenRSS first 500 chars: ${xml.substring(0, 500)}`);

  // Parse the most recent item from RSS XML
  const itemMatch = xml.match(/<item[\s>]([\s\S]*?)<\/item>/);
  if (!itemMatch) {
    console.log(`[${channel.name}] No <item> found in RSS`);
    return null;
  }
  const item = itemMatch[1];

  const getTag = (tag) => {
    // Handle CDATA wrapped content
    const cdataMatch = item.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`));
    if (cdataMatch) return cdataMatch[1].trim();
    const simpleMatch = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return simpleMatch ? simpleMatch[1].trim() : '';
  };

  const title = getTag('title');
  const link = getTag('link');
  const pubDate = getTag('pubDate');

  // Try to get thumbnail from media:thumbnail or enclosure
  let thumbnail = '';
  const thumbMatch = item.match(/url=["']([^"']*(?:\.jpg|\.png|\.webp)[^"']*)/i);
  if (thumbMatch) thumbnail = thumbMatch[1];

  if (!title || !link) {
    console.log(`[${channel.name}] Missing title or link in RSS item`);
    return null;
  }

  console.log(`[${channel.name}] Found: ${title}`);
  return {
    id: link,
    title: title,
    url: link,
    thumbnail: thumbnail,
    source: channel.name,
    sourceHandle: channel.handle,
    platform: 'rumble',
    pubDate: pubDate || new Date().toISOString(),
    subs: channel.subs
  };
}

async function fetchRumbleEmbed(channel) {
  // Try Rumble's oembed API
  const url = `https://rumble.com/api/Media/oembed.json?url=https://rumble.com/c/${channel.handle}`;
  console.log(`[${channel.name}] Trying oembed: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregator/1.0)' }
    });
    console.log(`[${channel.name}] oembed status: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`[${channel.name}] oembed data:`, JSON.stringify(data).substring(0, 500));
    }
  } catch (e) {
    console.log(`[${channel.name}] oembed error: ${e.message}`);
  }
  return null;
}

async function fetchRumbleFeed(channel) {
  // Try direct Rumble RSS
  const url = `https://rumble.com/c/${channel.handle}/feed`;
  console.log(`[${channel.name}] Trying direct feed: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregator/1.0)' },
      redirect: 'follow'
    });
    console.log(`[${channel.name}] Direct feed status: ${res.status}`);
    if (res.ok) {
      const text = await res.text();
      console.log(`[${channel.name}] Direct feed first 500: ${text.substring(0, 500)}`);
    }
  } catch (e) {
    console.log(`[${channel.name}] Direct feed error: ${e.message}`);
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
  if (!response.ok) {
    throw new Error(`Gist update failed: ${response.status} ${response.statusText}`);
  }
  console.log('Gist updated successfully');
}

async function main() {
  console.log('=== Rumble Scraper v2 (no Puppeteer) ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const results = {};

  for (const channel of CHANNELS) {
    console.log(`\n--- ${channel.name} (${channel.handle}) ---`);

    // Try OpenRSS first
    let video = await fetchOpenRSS(channel);

    // If OpenRSS fails, try oembed (for debugging)
    if (!video) await fetchRumbleEmbed(channel);

    // Try direct feed (for debugging)
    if (!video) await fetchRumbleFeed(channel);

    if (video) {
      results[channel.handle] = video;
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
