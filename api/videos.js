const fetch = require('node-fetch');

// 13 YouTube + 2 Rumble = 15 Video Sources
const YOUTUBE_CHANNELS = [
  { id: 'UCzQUP1qoWDoEbmsQxvdjxgQ', name: 'Joe Rogan', handle: 'joerogan', subs: 19000000 },
  { id: 'UCGttrUON87gWfU6dMWm1fcA', name: 'Tucker Carlson', handle: 'tuckercarlson', subs: 14000000 },
  { id: 'UC1yBKRuGpC1tSM73A0ZjYjQ', name: 'The Young Turks', handle: 'theyoungturks', subs: 5000000 },
  { id: 'UCDRIjKy6eZOvKtOELtTdeUA', name: 'Breaking Points', handle: 'breakingpoints', subs: 2100000 },
  { id: 'UC4woSp8ITBoYDmjkukhEhxg', name: 'Tim Dillon', handle: 'timdillonshow', subs: 1800000 },
  { id: 'UCjjBjVc0b1cIpNGEeZtS2lg', name: 'TCN', handle: 'tcnetwork', subs: 1500000 },
  { id: 'UC3M7l8ved_rYQ45AVzS0RGA', name: 'Jimmy Dore', handle: 'thejimmydoreshow', subs: 1300000 },
  { id: 'UCCgpGpylCfrJIV-RwA_L7tg', name: 'Ian Carroll', handle: 'iancarrollshow', subs: 1200000 },
  { id: 'UCi5N_uAqApEUIlg32QzkPlg', name: 'Bret Weinstein', handle: 'darkhorsepod', subs: 900000 },
  { id: 'UCEfe80CP2cs1eLRNQazffZw', name: 'Dave Smith', handle: 'partoftheproblem', subs: 400000 },
  { id: 'UChzVhAwzGR7hV-4O8ZmBLHg', name: 'Glenn Greenwald', handle: 'glenngreenwald', subs: 350000 },
  { id: 'UCEXR8pRTkE2vFeJePNe9UcQ', name: 'The Grayzone', handle: 'thegrayzone7996', subs: 300000 },
  { id: 'UCcE1-IiX4fLqbbVjPx0Bnag', name: 'Owen Shroyer', handle: 'owenreport', subs: 60000 }
];

const RUMBLE_CHANNELS = [
  { handle: 'nickjfuentes', name: 'Nick Fuentes', subs: 500000 },
  { handle: 'StewPeters', name: 'Stew Peters', subs: 400000 }
];

// Gist URL - updated by local Mac script (residential IP bypasses Cloudflare)
const GIST_RAW_URL = 'https://gist.githubusercontent.com/pgm9-art/f19c5ca4e44cd8d7df677abc34a7b254/raw/rumble-data.json';

// Fallback cache: used only if Gist AND all live methods fail
const RUMBLE_FALLBACK = {
  'nickjfuentes': {
    id: 'https://rumble.com/v75eqx2-america-first.html',
    title: 'The Truth About Jeffrey Epstein: Jewish Fixer | America First Ep. 1636',
    url: 'https://rumble.com/v75eqx2-america-first.html',
    thumbnail: 'https://1a-1791.com/video/fww1/e3/s8/1/g/d/s/X/gdsXz.oq1b-small-America-First.jpg',
    source: 'Nick Fuentes',
    sourceHandle: 'nickjfuentes',
    platform: 'rumble',
    pubDate: '2026-02-06T21:28:22-04:00',
    subs: 500000
  },
  'StewPeters': {
    id: 'https://rumble.com/v75ftlg-killer-wife-the-many-lies-of-erika-kirk.html',
    title: 'KILLER WIFE: THE MANY LIES OF ERIKA KIRK',
    url: 'https://rumble.com/v75ftlg-killer-wife-the-many-lies-of-erika-kirk.html',
    thumbnail: 'https://1a-1791.com/video/fwe2/da/s8/1/u/s/E/X/usEXz.oq1b-small-KILLER-WIFE-THE-MANY-LIES-O.jpg',
    source: 'Stew Peters',
    sourceHandle: 'StewPeters',
    platform: 'rumble',
    pubDate: '2026-02-07T13:45:59-04:00',
    subs: 400000
  }
};

function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 172800) return 'yesterday';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  return Math.floor(seconds / 604800) + 'w ago';
}

async function fetchYouTubeVideo(channel) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Feed fetch failed (${response.status})`);
  }
  const xml = await response.text();
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) {
    throw new Error('No entries in feed');
  }
  const entry = entryMatch[1];
  const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
  const title = entry.match(/<title>([^<]+)<\/title>/)?.[1];
  const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
  if (!videoId || !title) {
    throw new Error('Could not parse video data');
  }
  const decodedTitle = title
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return {
    id: videoId,
    title: decodedTitle,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    source: channel.name,
    sourceHandle: channel.handle,
    platform: 'youtube',
    pubDate: published,
    timeAgo: timeAgo(published),
    subs: channel.subs
  };
}

// Method 0: Fetch from GitHub Gist (updated by local Mac script)
async function fetchRumbleViaGist(channel) {
  const response = await fetch(GIST_RAW_URL, {
    headers: { 'Accept': 'application/json' },
    timeout: 5000
  });
  if (!response.ok) {
    throw new Error(`Gist fetch failed (${response.status})`);
  }
  const data = await response.json();
  const channelData = data.channels && data.channels[channel.handle];
  if (!channelData || !channelData.title) {
    throw new Error(`No data for ${channel.handle} in Gist`);
  }
  // Check if Gist data is reasonably fresh (less than 48 hours old)
  const gistAge = Date.now() - new Date(data.lastUpdated).getTime();
  if (gistAge > 48 * 60 * 60 * 1000) {
    throw new Error('Gist data is stale (>48h old)');
  }
  return {
    ...channelData,
    timeAgo: timeAgo(channelData.pubDate),
    fromGist: true
  };
}

// Method 1: Try OpenRSS feed
async function fetchRumbleViaOpenRSS(channel) {
  const feedUrl = `https://openrss.org/feed/rumble.com/c/${channel.handle}`;
  const response = await fetch(feedUrl, {
    headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' },
    timeout: 5000
  });
  if (!response.ok) {
    throw new Error(`OpenRSS failed (${response.status})`);
  }
  const text = await response.text();
  if (text.includes('<!DOCTYPE html>') || !text.includes('<item>')) {
    throw new Error('OpenRSS returned HTML, not RSS');
  }
  const itemMatch = text.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) {
    throw new Error('No items in feed');
  }
  const item = itemMatch[1];
  const title = item.match(/<title>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/title>/)?.[1];
  const link = item.match(/<link>([^<]+)<\/link>/)?.[1];
  const pubDate = item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1];
  let thumbnail = item.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1];
  if (!thumbnail) {
    thumbnail = item.match(/<enclosure[^>]*url="([^"]+)"/)?.[1];
  }
  if (!title || !link) {
    throw new Error('Could not parse Rumble feed data');
  }
  return {
    id: link,
    title: title.trim(),
    url: link,
    thumbnail: thumbnail || null,
    source: channel.name,
    sourceHandle: channel.handle,
    platform: 'rumble',
    pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    timeAgo: pubDate ? timeAgo(pubDate) : 'recently',
    subs: channel.subs
  };
}

// Method 2: Try direct Rumble page scrape
async function fetchRumbleViaScrape(channel) {
  const channelUrl = `https://rumble.com/c/${channel.handle}`;
  const response = await fetch(channelUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    timeout: 5000
  });
  if (!response.ok) {
    throw new Error(`Rumble scrape failed (${response.status})`);
  }
  const html = await response.text();
  let videoUrl = null;
  const broadPattern = /<a[^>]*href="(\/v[a-z0-9]+-[^"]+\.html)[^"]*"/;
  const broadMatch = html.match(broadPattern);
  if (broadMatch) {
    videoUrl = 'https://rumble.com' + broadMatch[1];
  }
  if (!videoUrl) {
    throw new Error('No video found on page');
  }
  let videoTitle = null;
  const titleMatch = html.match(/<h3[^>]*>([^<]+)<\/h3>/);
  if (titleMatch) {
    videoTitle = titleMatch[1].trim();
  }
  if (!videoTitle) {
    const slug = videoUrl.match(/\/v[a-z0-9]+-(.+)\.html/);
    videoTitle = slug ? slug[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : channel.name + ' - Latest';
  }
  let videoThumb = null;
  const thumbMatch = html.match(/<img[^>]*src="(https:\/\/1a-1791\.com\/video[^"]+)"/);
  if (thumbMatch) {
    videoThumb = thumbMatch[1];
  }
  const timeMatch = html.match(/<time[^>]*datetime="([^"]+)"/);
  const videoPubDate = timeMatch ? new Date(timeMatch[1]).toISOString() : new Date().toISOString();
  videoTitle = videoTitle
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
  return {
    id: videoUrl,
    title: videoTitle,
    url: videoUrl,
    thumbnail: videoThumb || null,
    source: channel.name,
    sourceHandle: channel.handle,
    platform: 'rumble',
    pubDate: videoPubDate,
    timeAgo: timeAgo(videoPubDate),
    subs: channel.subs
  };
}

// Method 3: Hardcoded fallback
function getRumbleFallback(channel) {
  const fallback = RUMBLE_FALLBACK[channel.handle];
  if (!fallback) return null;
  return {
    ...fallback,
    timeAgo: timeAgo(fallback.pubDate),
    cached: true
  };
}

// Try all methods in order: Gist -> OpenRSS -> Direct scrape -> Fallback cache
async function fetchRumbleVideo(channel) {
  // Method 0: GitHub Gist (fed by local Mac script)
  try {
    const result = await fetchRumbleViaGist(channel);
    return result;
  } catch (e) {
    // continue to next method
  }

  // Method 1: OpenRSS
  try {
    const result = await fetchRumbleViaOpenRSS(channel);
    return result;
  } catch (e) {
    // continue to next method
  }

  // Method 2: Direct scrape
  try {
    const result = await fetchRumbleViaScrape(channel);
    return result;
  } catch (e) {
    // continue to fallback
  }

  // Method 3: Hardcoded fallback
  const fallback = getRumbleFallback(channel);
  if (fallback) {
    return fallback;
  }

  throw new Error('All Rumble fetch methods failed');
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const videos = [];
  const errors = [];

  const youtubeResults = await Promise.allSettled(
    YOUTUBE_CHANNELS.map(channel => fetchYouTubeVideo(channel))
  );

  youtubeResults.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      videos.push(result.value);
    } else {
      errors.push(`${YOUTUBE_CHANNELS[index].handle}: ${result.reason?.message || 'Failed'}`);
    }
  });

  const rumbleResults = await Promise.allSettled(
    RUMBLE_CHANNELS.map(channel => fetchRumbleVideo(channel))
  );

  rumbleResults.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      videos.push(result.value);
    } else {
      errors.push(`${RUMBLE_CHANNELS[index].handle}: ${result.reason?.message || 'Failed'}`);
    }
  });

  // Sort by recency (most recent first)
  videos.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  res.status(200).json({
    videos: videos,
    count: videos.length,
    errors: errors.slice(0, 5),
    lastUpdated: new Date().toISOString()
  });
};
