// 16 YouTube Video Sources
const YOUTUBE_CHANNELS = [
  { id: 'UCzQUP1qoWDoEbmsQxvdjxgQ', name: 'Joe Rogan', handle: 'joerogan', subs: 19000000 },
  { id: 'UCGttrUON87gWfU6dMWm1fcA', name: 'Tucker Carlson', handle: 'tuckercarlson', subs: 14000000 },
  { id: 'UC1yBKRuGpC1tSM73A0ZjYjQ', name: 'The Young Turks', handle: 'theyoungturks', subs: 5000000 },
  { id: 'UCoJhK5kMc4LjBKdiYrDtzlA', name: 'Redacted', handle: 'redactednews', subs: 2840000 },
  { id: 'UCDRIjKy6eZOvKtOELtTdeUA', name: 'Breaking Points', handle: 'breakingpoints', subs: 2100000 },
  { id: 'UC4woSp8ITBoYDmjkukhEhxg', name: 'Tim Dillon', handle: 'timdillonshow', subs: 1800000 },
  { id: 'UCL0u5uz7KZ9q-pe-VC8TY-w', name: 'Candace Owens', handle: 'CandaceOwens', subs: 1760000 },
  { id: 'UCjjBjVc0b1cIpNGEeZtS2lg', name: 'TCN', handle: 'tcnetwork', subs: 1500000 },
  { id: 'UC3M7l8ved_rYQ45AVzS0RGA', name: 'Jimmy Dore', handle: 'thejimmydoreshow', subs: 1300000 },
  { id: 'UCCgpGpylCfrJIV-RwA_L7tg', name: 'Ian Carroll', handle: 'iancarrollshow', subs: 1200000 },
  { id: 'UCi5N_uAqApEUIlg32QzkPlg', name: 'Bret Weinstein', handle: 'darkhorsepod', subs: 900000 },
  { id: 'UCoJTOwZxbvq8Al8Qat2zgTA', name: 'Kim Iversen', handle: 'kimiversen', subs: 722000 },
  { id: 'UCEfe80CP2cs1eLRNQazffZw', name: 'Dave Smith', handle: 'partoftheproblem', subs: 400000 },
  { id: 'UChzVhAwzGR7hV-4O8ZmBLHg', name: 'Glenn Greenwald', handle: 'glenngreenwald', subs: 350000 },
  { id: 'UCEXR8pRTkE2vFeJePNe9UcQ', name: 'The Grayzone', handle: 'thegrayzone7996', subs: 300000 },
  { id: 'UCcE1-IiX4fLqbbVjPx0Bnag', name: 'Owen Shroyer', handle: 'owenreport', subs: 60000 }
];

// Rumble data fetched from GitHub Gist (updated every 30 min by Mac script)
const GIST_RAW_URL = 'https://gist.githubusercontent.com/pgm9-art/0dc8ef1986b468b13482180ff382f538/raw/rumble-data.json';

// In-memory cache
const videoCache = {};
const STALE_TTL = 6 * 60 * 60 * 1000;

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
  if (!response.ok) throw new Error(`Feed fetch failed (${response.status})`);

  const xml = await response.text();
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) throw new Error('No entries in feed');

  const entry = entryMatch[1];
  const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
  const title = entry.match(/<title>([^<]+)<\/title>/)?.[1];
  const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
  if (!videoId || !title) throw new Error('Could not parse video data');

  return {
    id: videoId,
    title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
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

async function fetchRumbleFromGist() {
  const response = await fetch(GIST_RAW_URL + '?t=' + Date.now());
  if (!response.ok) throw new Error(`Gist fetch failed (${response.status})`);
  const data = await response.json();

  // Handle both formats: { videos: [...] } or { channels: { handle: videoObj } }
  let videos = [];
  if (data.videos && Array.isArray(data.videos)) {
    videos = data.videos;
  } else if (data.channels && typeof data.channels === 'object') {
    videos = Object.values(data.channels).filter(v => v && v.url);
  }

  if (videos.length === 0) {
    throw new Error('No Rumble videos in Gist');
  }

  return videos.map(v => ({
    ...v,
    timeAgo: timeAgo(v.pubDate)
  }));
}

async function fetchVideoWithCache(fetchFn, cacheKey) {
  try {
    const data = await fetchFn();
    videoCache[cacheKey] = { data, timestamp: Date.now() };
    return { data, stale: false };
  } catch (err) {
    const cached = videoCache[cacheKey];
    if (cached && (Date.now() - cached.timestamp) < STALE_TTL) {
      if (Array.isArray(cached.data)) {
        cached.data.forEach(v => { v.timeAgo = timeAgo(v.pubDate); });
      } else {
        cached.data.timeAgo = timeAgo(cached.data.pubDate);
      }
      return { data: cached.data, stale: true, error: err.message };
    }
    throw err;
  }
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const videos = [];
  const errors = [];
  const staleHandles = [];

  // YouTube: fetch in parallel
  const ytResults = await Promise.allSettled(
    YOUTUBE_CHANNELS.map(channel =>
      fetchVideoWithCache(() => fetchYouTubeVideo(channel), `yt-${channel.id}`)
    )
  );

  ytResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      videos.push(result.value.data);
      if (result.value.stale) staleHandles.push(YOUTUBE_CHANNELS[index].handle);
    } else {
      errors.push(`yt/${YOUTUBE_CHANNELS[index].handle}: ${result.reason?.message || 'Failed'}`);
    }
  });

  // Rumble: fetch from Gist
  try {
    const rumbleResult = await fetchVideoWithCache(fetchRumbleFromGist, 'rumble-gist');
    if (Array.isArray(rumbleResult.data)) {
      rumbleResult.data.forEach(v => videos.push(v));
    }
    if (rumbleResult.stale) staleHandles.push('rumble-gist');
  } catch (err) {
    errors.push(`rumble/gist: ${err.message || 'Failed'}`);
  }

  videos.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  res.status(200).json({
    videos,
    count: videos.length,
    errors: errors.slice(0, 5),
    stale: staleHandles,
    lastUpdated: new Date().toISOString()
  });
};
