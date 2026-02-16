// 16 YouTube Video Sources
const YOUTUBE_CHANNELS = [
  { id: 'UCzQUP1qoWDoEbmsQxvdjxgQ', name: 'Joe Rogan', handle: 'joerogan', subs: 19000000 },
  { id: 'UCGttrUON87gWfU6dMWm1fcA', name: 'Tucker Carlson', handle: 'tuckercarlson', subs: 14000000 },
  { id: 'UC1yBKRuGpC1tSM73A0ZjYjQ', name: 'The Young Turks', handle: 'theyoungturks', subs: 5000000 },
  { id: 'UCoJhK5kMc4LjBKdiYrDtzlA', name: 'Redacted', handle: 'redactednews', subs: 2840000 },
  { id: 'UCDRIjKy6eZOvKtOELtTdeUA', name: 'Breaking Points', handle: 'breakingpoints', subs: 2100000 },
  { id: 'UC4woSp8ITBoYDmjkukhEhxg', name: 'Tim Dillon', handle: 'timdillonshow', subs: 1800000 },
  { id: 'UCkY4fdKOFk3Kiq7g5LLKYLw', name: 'Candace Owens Podcast', handle: 'CandaceOwensPodcast', subs: 1760000 },
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

// 2 Rumble-only Sources (fetched via OpenRSS)
const RUMBLE_CHANNELS = [
  { slug: 'StewPeters', name: 'Stew Peters', handle: 'StewPeters', subs: 0 },
  { slug: 'nickjfuentes', name: 'Nick Fuentes', handle: 'nickjfuentes', subs: 0 }
];

// ─── In-memory cache for resilience ───
const videoCache = {};
const STALE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const RUMBLE_CACHE_TTL = 30 * 60 * 1000; // 30 min — skip refetch if fresh

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── YouTube fetch ───
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

  if (!videoId || !title) throw new Error('Could not parse video data');

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

// ─── Rumble fetch via OpenRSS (tries /c/ then /user/ path) ───
async function fetchRumbleVideo(channel) {
  const paths = [
    `https://openrss.org/feed/rumble.com/c/${channel.slug}`,
    `https://openrss.org/feed/rumble.com/user/${channel.slug}`
  ];

  let lastError = null;

  for (const feedUrl of paths) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await sleep(2000 * Math.pow(2, attempt));
      }

      try {
        const response = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'McMahon.News/1.0 (+https://mcmahon.news; news aggregator)',
            'Accept': 'application/rss+xml, application/xml, text/xml'
          }
        });

        if (response.status === 429) {
          lastError = new Error(`OpenRSS rate limited (429)`);
          continue;
        }

        if (!response.ok) {
          throw new Error(`OpenRSS fetch failed (${response.status})`);
        }

        const xml = await response.text();

        if (xml.includes('<!DOCTYPE html>') || xml.includes('<html')) {
          throw new Error('OpenRSS returned HTML instead of XML');
        }

        const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
        if (!itemMatch) {
          throw new Error('No items in feed');
        }

        const item = itemMatch[1];
        const title = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
        const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
        const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim();

        let thumbnail = '';
        const enclosure = item.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/)?.[1];
        const mediaThumbnail = item.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1];
        const descImg = item.match(/<description>[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1];
        thumbnail = enclosure || mediaThumbnail || descImg || '';

        const cleanTitle = (title || 'Untitled')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");

        const cleanLink = (link || '').replace(/\s/g, '');
        const id = cleanLink.split('/').pop()?.split('.')[0] || `rumble-${channel.slug}-${Date.now()}`;

        return {
          id: id,
          title: cleanTitle,
          url: cleanLink,
          thumbnail: thumbnail,
          source: channel.name,
          sourceHandle: channel.handle,
          platform: 'rumble',
          pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          timeAgo: timeAgo(pubDate || new Date().toISOString()),
          subs: channel.subs
        };
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('Rumble fetch failed after retries');
}

// ─── Fetch with cache fallback ───
async function fetchVideoWithCache(fetchFn, cacheKey) {
  try {
    const data = await fetchFn();
    videoCache[cacheKey] = { data, timestamp: Date.now() };
    return { data, stale: false };
  } catch (err) {
    const cached = videoCache[cacheKey];
    if (cached && (Date.now() - cached.timestamp) < STALE_TTL) {
      cached.data.timeAgo = timeAgo(cached.data.pubDate);
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
      if (result.value.stale) {
        staleHandles.push(YOUTUBE_CHANNELS[index].handle);
      }
    } else {
      errors.push(`yt/${YOUTUBE_CHANNELS[index].handle}: ${result.reason?.message || 'Failed'}`);
    }
  });

  // Rumble: fetch SEQUENTIALLY with delay to respect OpenRSS rate limits
  for (const channel of RUMBLE_CHANNELS) {
    const cacheKey = `rumble-${channel.slug}`;

    const cached = videoCache[cacheKey];
    if (cached && (Date.now() - cached.timestamp) < RUMBLE_CACHE_TTL) {
      cached.data.timeAgo = timeAgo(cached.data.pubDate);
      videos.push(cached.data);
      continue;
    }

    try {
      const result = await fetchVideoWithCache(
        () => fetchRumbleVideo(channel),
        cacheKey
      );
      videos.push(result.data);
      if (result.stale) {
        staleHandles.push(channel.handle);
      }
    } catch (err) {
      errors.push(`rumble/${channel.handle}: ${err.message || 'Failed'}`);
    }

    await sleep(3000);
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
