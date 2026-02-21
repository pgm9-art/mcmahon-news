// X Sources — 44 accounts
const X_ACCOUNTS = [
  { handle: 'joerogan', name: 'Joe Rogan', followers: 18000000 },
  { handle: 'TuckerCarlson', name: 'Tucker Carlson', followers: 17000000 },
  { handle: 'RealCandaceO', name: 'Candace Owens', followers: 5700000 },
  { handle: 'libsoftiktok', name: 'Libs of TikTok', followers: 3700000 },
  { handle: 'EndWokeness', name: 'End Wokeness', followers: 3200000 },
  { handle: 'CollinRugg', name: 'Collin Rugg', followers: 3200000 },
  { handle: 'JackPosobiec', name: 'Jack Posobiec', followers: 3000000 },
  { handle: 'jacksonhinklle', name: 'Jackson Hinkle', followers: 3000000 },
  { handle: 'MarioNawfal', name: 'Mario Nawfal', followers: 2800000 },
  { handle: 'DC_Draino', name: 'DC Draino', followers: 2500000 },
  { handle: 'TimDillon', name: 'Tim Dillon', followers: 2500000 },
  { handle: 'ggreenwald', name: 'Glenn Greenwald', followers: 2100000 },
  { handle: 'PrisonPlanet', name: 'Paul Joseph Watson', followers: 2000000 },
  { handle: 'mtaibbi', name: 'Matt Taibbi', followers: 2000000 },
  { handle: 'shellenberger', name: 'Michael Shellenberger', followers: 2000000 },
  { handle: 'BretWeinstein', name: 'Bret Weinstein', followers: 1800000 },
  { handle: 'VigilantFox', name: 'Vigilant Fox', followers: 1500000 },
  { handle: 'LauraLoomer', name: 'Laura Loomer', followers: 1500000 },
  { handle: 'ZubyMusic', name: 'Zuby', followers: 1500000 },
  { handle: 'LaraLogan', name: 'Lara Logan', followers: 1500000 },
  { handle: 'WallStreetApes', name: 'Wall Street Apes', followers: 1200000 },
  { handle: 'jimmy_dore', name: 'Jimmy Dore', followers: 1200000 },
  { handle: 'NickJFuentes', name: 'Nick Fuentes', followers: 1100000 },
  { handle: 'KanekoaTheGreat', name: 'Kanekoa', followers: 1000000 },
  { handle: 'PeterSchiff', name: 'Peter Schiff', followers: 1000000 },
  { handle: 'WallStreetSilv', name: 'Wall Street Silver', followers: 1000000 },
  { handle: 'DougAMacgregor', name: 'Col. Douglas Macgregor', followers: 900000 },
  { handle: 'AFpost', name: 'AF Post', followers: 800000 },
  { handle: 'OwenShroyer1776', name: 'Owen Shroyer', followers: 800000 },
  { handle: 'TracyBeanz', name: 'Tracy Beanz', followers: 700000 },
  { handle: 'realstewpeters', name: 'Stew Peters', followers: 700000 },
  { handle: 'ComicDaveSmith', name: 'Dave Smith', followers: 600000 },
  { handle: 'TheYoungTurks', name: 'The Young Turks', followers: 600000 },
  { handle: 'ScottRitter', name: 'Scott Ritter', followers: 600000 },
  { handle: 'KimIversen', name: 'Kim Iversen', followers: 500000 },
  { handle: 'TheGrayzoneNews', name: 'The Grayzone', followers: 500000 },
  { handle: 'Geopolitics_Emp', name: 'Geopolitics & Empire', followers: 500000 },
  { handle: 'lhfang', name: 'Lee Fang', followers: 500000 },
  { handle: 'aaronjmate', name: 'Aaron Maté', followers: 482000 },
  { handle: 'DropSiteNews', name: 'Drop Site News', followers: 400000 },
  { handle: 'MaxBlumenthal', name: 'Max Blumenthal', followers: 400000 },
  { handle: 'KenKlippenstein', name: 'Ken Klippenstein', followers: 400000 },
  { handle: 'RealTimBlack', name: 'Tim Black', followers: 400000 },
  { handle: 'iancarrollshow', name: 'Ian Carroll', followers: 300000 }
];

// ─── In-memory cache (persists across warm Vercel invocations) ───
const tweetCache = {};  // { handle: { data, timestamp } }
const STALE_TTL = 86400000;  // 24 hours — absolute max age before discarding

// ─── Retry with exponential backoff ───
async function fetchWithRetry(url, options, retries = 3) {
  const delays = [500, 1000, 2000];
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < retries - 1) {
        await sleep(delays[attempt]);
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        await sleep(delays[attempt]);
        continue;
      }
    }
  }
  throw lastError;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ─── Fetch a single account's tweet ───
async function fetchTweet(account, bearerToken) {
  const headers = { 'Authorization': `Bearer ${bearerToken}` };

  const userUrl = `https://api.twitter.com/2/users/by/username/${account.handle}?user.fields=profile_image_url`;
  const userResponse = await fetchWithRetry(userUrl, { headers });
  const userData = await userResponse.json();
  if (!userData.data) throw new Error('User not found');

  const userId = userData.data.id;
  const profileImage = userData.data.profile_image_url?.replace('_normal', '_200x200');

  const tweetsUrl = `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics&exclude=retweets,replies`;
  const tweetsResponse = await fetchWithRetry(tweetsUrl, { headers });
  const tweetsData = await tweetsResponse.json();
  if (!tweetsData.data || tweetsData.data.length === 0) throw new Error('No tweets found');

  // Skip "Paid partnership" posts
  const tweet = tweetsData.data.find(t =>
    !t.text.toLowerCase().startsWith('paid partnership')
  ) || tweetsData.data[0];

  return {
    id: tweet.id,
    text: tweet.text,
    url: `https://x.com/${account.handle}/status/${tweet.id}`,
    source: account.name,
    sourceHandle: account.handle,
    profileImage: profileImage,
    pubDate: tweet.created_at,
    timeAgo: timeAgo(tweet.created_at),
    metrics: tweet.public_metrics,
    followers: account.followers
  };
}

// ─── Fetch with cache fallback ───
async function fetchTweetWithCache(account, bearerToken) {
  try {
    const data = await fetchTweet(account, bearerToken);
    tweetCache[account.handle] = { data, timestamp: Date.now() };
    return { data, stale: false };
  } catch (err) {
    const cached = tweetCache[account.handle];
    if (cached && (Date.now() - cached.timestamp) < STALE_TTL) {
      cached.data.timeAgo = timeAgo(cached.data.pubDate);
      return { data: cached.data, stale: true, error: err.message };
    }
    throw err;
  }
}

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

// ─── Zigzag distribution: 1st left, 2nd right, 3rd left... ───
function distributeZigzag(sortedTweets) {
  const left = [];
  const right = [];
  sortedTweets.forEach((tweet, index) => {
    if (index % 2 === 0) {
      left.push(tweet);
    } else {
      right.push(tweet);
    }
  });
  return { left, right };
}

// ─── Parallel batch fetching (smaller batches for 44 accounts) ───
async function fetchInBatches(accounts, bearerToken, batchSize = 4) {
  const tweets = [];
  const errors = [];
  const staleHandles = [];

  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(account => fetchTweetWithCache(account, bearerToken))
    );

    results.forEach((result, idx) => {
      const account = batch[idx];
      if (result.status === 'fulfilled') {
        tweets.push(result.value.data);
        if (result.value.stale) {
          staleHandles.push(account.handle);
        }
      } else {
        errors.push(`${account.handle}: ${result.reason?.message || 'Failed'}`);
      }
    });

    // 300ms delay between batches to stay under rate limits (44 accounts = 88 calls)
    if (i + batchSize < accounts.length) {
      await sleep(300);
    }
  }

  return { tweets, errors, staleHandles };
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    return res.status(500).json({
      error: 'X_BEARER_TOKEN not configured',
      tweets: [], left: [], right: []
    });
  }

  const { tweets, errors, staleHandles } = await fetchInBatches(X_ACCOUNTS, bearerToken, 4);

  // Sort by recency
  tweets.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Distribute zigzag
  const { left, right } = distributeZigzag(tweets);

  res.status(200).json({
    tweets,
    left,
    right,
    count: tweets.length,
    errors: errors.slice(0, 5),
    stale: staleHandles,
    lastUpdated: new Date().toISOString()
  });
};
