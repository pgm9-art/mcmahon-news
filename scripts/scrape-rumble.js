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
      // Method 1: Find all links that look like Rumble video URLs
      const allLinks = Array.from(document.querySelectorAll('a[href*="/v"]'));
      const videoLinks = allLinks.filter(a => {
        const href = a.getAttribute('href') || '';
        return href.match(/^\/v[a-z0-9]+-/);
      });

      if (videoLinks.length === 0) return null;

      // Get the first video link's parent container for metadata
      const firstLink = videoLinks[0];
      const href = firstLink.getAttribute('href');
      const title = firstLink.textContent.trim() || firstLi
