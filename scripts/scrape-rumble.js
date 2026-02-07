// Rumble Scraper v4 - Puppeteer with stealth
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const CHANNELS = [
  { name: 'Nick Fuentes', handle: 'nickjfuentes', subs: 200000 },
  { name: 'Stew Peters', handle: 'StewPeters', subs: 400000 }
];

const GIST_ID = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeChannel(browser, channel) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  try {
    const url = `https://rumble.com/c/${channel.handle}`;
    console.log(`[${channel.name}] Navigating to ${url}`);
    
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log(`[${channel.name}] HTTP status: ${response.status()}`);

    // Check page title for Cloudflare
    const title = await page.title();
    console.log(`[${channel.name}] Page title: "${title}"`);

    // If Cloudflare challenge, wait for it to resolve
    if (title.includes('Just a moment') || title.includes('Attention')) {
      console.log(`[${channel.name}] Cloudflare detected, waiting 10s...`);
      await sleep(10000);
      const newTitle = await page.title();
      console.log(`[${channel.name}] After wait, title: "${newTitle}"`);
      if (newTitle.includes('Just a moment')) {
        console.log(`[${channel.name}] Still blocked by Cloudflare`);
        await page.close();
        return null;
      }
    }

    // Wait for page to fully load
    await sleep(3000);

    // Log a snippet of the HTML for debugging
    const snippet = await page.evaluate(() => document.body.innerHTML.substring(0, 1500));
    console.log(`[${channel.name}] Body snippet (first 500): ${snippet.substring(0, 500)}`);

    // Extract video data using multiple strategies
    const video = await page.evaluate(() => {
      // Strategy 1: Find links matching Rumble video URL pattern
      const allLinks = Array.from(document.querySelectorAll('a'));
      const videoLinks = allLinks.filter(a => {
        const href = a.getAttribute('href') || '';
        return /^\/v[a-z0-9]+-/.test(href);
      });

      console.log(`Found ${videoLinks.length} video links`);

      if (videoLinks.length === 0) {
        // Strategy 2: Try finding any link with rumble video pattern
        const allHrefs = allLinks.map(a => a.getAttribute('href')).filter(Boolean);
        console.log(`Total links on page: ${allHrefs.length}`);
        console.log(`Sample hrefs: ${allHrefs.slice(0, 10).join(', ')}`);
        return null;
      }

      const firstLink = videoLinks[0];
      const href = firstLink.getAttribute('href');

      // Get title - try the link text, then nearby elements
      let title = firstLink.textContent.trim();
      if (!title || title.length < 3) {
        const container = firstLink.closest('li, article, div[class*="video"], div[class*="item"]');
        if (container) {
          const h3 = container.querySelector('h3, h4, .title, [class*="title"]');
          title = h3 ? h3.textContent.trim() : '';
        }
      }
      if (!title || title.length < 3) {
        title = firstLink.getAttribute('title') || href;
      }

      // Get thumbnail
      let thumbnail = '';
      const container = firstLink.closest('li, article, div') || firstLink.parentElement;
      if (container) {
        const img = container.querySelector('img[src*="video"], img[src*="rumble"], img[src*="1a-1791"], img');
        if (img) thumbnail = img.getAttribute('src') || img.getAttribute('data-src') || '';
      }

      // Get date
      let dateStr = '';
      if (container) {
        const timeEl = container.querySelector('time');
        if (timeEl) dateStr = timeEl.getAttribute('datetime') || timeEl.textContent.trim();
      }

      return { title, href, thumbnail, dateStr, count: videoLinks.length };
    });

    await page.close();

    if (!video || !video.href) {
      console.log(`[${channel.name}] No video data extracted`);
      return null;
    }

    console.log(`[${channel.name}] Found ${video.count} videos, first: "${video.title}"`);
    const videoUrl = video.href.startsWith('http') ? video.href : `https://rumble.com${video.href}`;

    return {
      id: videoUrl,
      title: video.title,
      url: videoUrl,
      thumbnail: video.thumbnail || '',
      source: channel.name,
      sourceHandle: channel.handle,
      platform: 'rumble',
      pubDate: video.dateStr || new Date().toISOString(),
      subs: channel.subs
    };
  } catch (err) {
    console.error(`[${channel.name}] Error: ${err.message}`);
    try { await page.close(); } catch(e) {}
    return null;
  }
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
      files: { 'rumble-data.json': { content: JSON.stringify(data, null, 2) } }
    })
  });
  if (!response.ok) throw new Error(`Gist update failed: ${response.status}`);
  console.log('Gist updated successfully');
}

async function main() {
  console.log('=== Rumble Scraper v4 (Puppeteer) ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });

  const results = {};
  for (let i = 0; i < CHANNELS.length; i++) {
    const channel = CHANNELS[i];
    if (i > 0) await sleep(5000);
    const video = await scrapeChannel(browser, channel);
    if (video) {
      results[channel.handle] = video;
      console.log(`✓ ${channel.name}: ${video.title}`);
    } else {
      console.log(`✗ ${channel.name}: Failed`);
    }
  }

  await browser.close();
  const gistData = { lastUpdated: new Date().toISOString(), channels: results };
  await updateGist(gistData);
  console.log('\nDone!', JSON.stringify(gistData, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
