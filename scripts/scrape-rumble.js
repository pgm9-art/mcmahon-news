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

    // Wait for video listings to load
    await page.waitForSelector('.video-listing-entry, .videostream, article', { timeout: 30000 });

    // Extract the most recent video
    const video = await page.evaluate(() => {
      // Try multiple selectors Rumble might use
      const selectors = [
        '.video-listing-entry',
        '.videostream',
        'article.video-item',
        'li.video-listing-entry'
      ];

      let entry = null;
      for (const sel of selectors) {
        entry = document.querySelector(sel);
        if (entry) break;
      }
      if (!entry) return null;

      // Extract title
      const titleEl = entry.querySelector('h3 a, .video-item--title a, .title__link, a.video-item--a');
      const title = titleEl ? titleEl.textContent.trim() : '';
      const href = titleEl ? titleEl.getAttribute('href') : '';

      // Extract thumbnail
      const imgEl = entry.querySelector('img.video-thumbnail-img, img[src*="video"], img');
      const thumbnail = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '') : '';

      // Extract date
      const timeEl = entry.querySelector('time, .video-item--meta, .videostream__data--date');
      const dateStr = timeEl ? (timeEl.getAttribute('datetime') || timeEl.textContent.trim()) : '';

      return { title, href, thumbnail, dateStr };
    });

    await page.close();

    if (!video || !video.title) {
      console.log(`No video found for ${channel.name}`);
      return null;
    }

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
