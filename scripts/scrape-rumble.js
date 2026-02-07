const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const CHANNELS = [
  { name: 'Nick Fuentes', handle: 'nickjfuentes', subs: 200000 },
  { name: 'Stew Peters', handle: 'StewPeters', subs: 400000 }
];

const GIST_ID = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;

async function scrapeChannel(browser, channel) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    const url = `https://rumble.com/c/${channel.handle}`;
    console.log(`Scraping ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Debug: log page title and snippet of HTML
    const title = await page.title();
    console.log(`Page title: ${title}`);

    const bodySnippet = await page.evaluate(() => {
      return document.body.innerHTML.substring(0, 2000);
    });
    console.log(`Body snippet:\n${bodySnippet}`);

    // Check if Cloudflare blocked us
    if (title.includes('Just a moment') || title.includes('Attention Required') || bodySnippet.includes('cf-challenge')) {
      console.log('BLOCKED BY CLOUDFLARE');
      await page.close();
      return null;
    }

    // Try very broad selector - just find any link with /v in the href (Rumble video URLs)
    const video = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a[href*="/v"]'));
      const videoLinks = allLinks.filter(a => {
        const href = a.getAttribute('href') || '';
        return href.match(/^\/v[a-z0-9]+-/);
      });

      if (videoLinks.length === 0) return null;

      const firstLink = videoLinks[0];
      const href = firstLink.getAttribute('href');
      const title = firstLink.textContent.trim() || firstLink.getAttribute('title') || '';

      // Look for thumbnail near this link
      const container = firstLink.closest('div, li, article') || firstLink.parentElement;
      const img = container ? container.querySelector('img') : null;
      const thumbnail = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';

      // Look for time/date near this link
      const timeEl = container ? container.querySelector('time') : null;
      const dateStr = timeEl ? (timeEl.getAttribute('datetime') || timeEl.textContent.trim()) : '';

      return { title, href, thumbnail, dateStr, linkCount: videoLinks.length };
    });

    await page.close();

    if (!video || !video.title) {
      console.log(`No video found for ${channel.name}`);
      return null;
    }

    console.log(`Found ${video.linkCount} video links`);
    const videoUrl = video.href.startsWith('http') ? video.href : `https://rumble.com${video.href}`;

    return {
      id: videoUrl,
      title: video.title,
      url: videoUrl,
      thumbnail: video.thumbnail,
      source: channel.name,
      sourceHandle: channel.handle,
      platform: 'rumble',
      pubDate: video.dateStr || new Date().toISOString(),
      subs: channel.subs
    };
  } catch (err) {
    console.error(`Error scraping ${channel.name}:`, err.message);
    await page.close();
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
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {};
  for (const channel of CHANNELS) {
    const video = await scrapeChannel(browser, channel);
    if (video) {
      results[channel.handle] = video;
      console.log(`✓ ${channel.name}: ${video.title}`);
    } else {
      console.log(`✗ ${channel.name}: No data scraped`);
    }
  }

  await browser.close();

  const gistData = {
    lastUpdated: new Date().toISOString(),
    channels: results
  };

  await updateGist(gistData);
  console.log('Done!', JSON.stringify(gistData, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
