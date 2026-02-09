const YOUTUBE_CHANNELS = [
  { id: 'UCzQUP1qoWDoEbmsQxvdjxgQ', name: 'Joe Rogan', handle: 'joerogan', subs: 19000000 },
  { id: 'UCTRwSFBJzBVsGOBzSAQEXBg', name: 'Tucker Carlson', handle: 'tuckercarlson', subs: 14000000 },
  { id: 'UC1yBKRuGpC1tSM73A0ZjYjQ', name: 'The Young Turks', handle: 'theyoungturks', subs: 5000000 },
  { id: 'UCoJhK5kMc4LjBKdiYrDtzlA', name: 'Redacted', handle: 'redactednews', subs: 2800000 },
  { id: 'UC_vz6SdnIGjWkai27ramfXQ', name: 'Breaking Points', handle: 'breakingpoints', subs: 2100000 },
  { id: 'UCkY4fdKOFk3Kiq7g5LLKYLw', name: 'Candace Owens', handle: 'CandaceOwensPodcast', subs: 1900000 },
  { id: 'UC4woSp8ITBoYDmjkukhEhxg', name: 'Tim Dillon', handle: 'timdillonshow', subs: 1800000 },
  { id: 'UCkNOcgdA6jGlSdi-FYXnjfQ', name: 'TCN', handle: 'tcnetwork', subs: 1500000 },
  { id: 'UC3M7l8ved_rYQ45AVzS0RGA', name: 'Jimmy Dore', handle: 'thejimmydoreshow', subs: 1300000 },
  { id: 'UCCgpGpylCfrJIV-RwA_L7tg', name: 'Ian Carroll', handle: 'iancarrollshow', subs: 1200000 },
  { id: 'UCi5N_uAqApEUIlg7ryRUUWg', name: 'Bret Weinstein', handle: 'darkhorsepod', subs: 900000 },
  { id: 'UCcM3PwIB-MCWkfCqOmgORUg', name: 'Dave Smith', handle: 'partoftheproblem', subs: 400000 },
  { id: 'UCbnBVEqsgAWeMRJ6v3ySaQQ', name: 'Glenn Greenwald', handle: 'glenngreenwald', subs: 350000 },
  { id: 'UCEXR8pRTkE2vFeJePNe9UcQ', name: 'The Grayzone', handle: 'thegrayzone7996', subs: 300000 },
  { id: 'UCwvYhFMiOGdxOMOWw0hSCmA', name: 'Owen Shroyer', handle: 'owenreport', subs: 60000 }
];

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

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const results = await Promise.allSettled(
    YOUTUBE_CHANNELS.map(channel => fetchYouTubeVideo(channel))
  );

  const videos = [];
  const errors = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      videos.push(result.value);
    } else {
      errors.push(`${YOUTUBE_CHANNELS[index].handle}: ${result.reason?.message || 'Failed'}`);
    }
  });

  videos.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  res.status(200).json({
    videos,
    count: videos.length,
    errors,
    lastUpdated: new Date().toISOString()
  });
};
