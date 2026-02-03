const express = require('express');
const cors = require('cors');
const RSSParser = require('rss-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const parser = new RSSParser();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// X Bearer Token
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;

// === X ACCOUNTS ===
const X_ACCOUNTS = [
    { handle: 'TuckerCarlson', name: 'Tucker Carlson', weight: 1.0 },
    { handle: 'ggreenwald', name: 'Glenn Greenwald', weight: 1.0 },
    { handle: 'NickJFuentes', name: 'Nick Fuentes', weight: 1.0 },
    { handle: 'OwenShroyer', name: 'Owen Shroyer', weight: 1.0 },
    { handle: 'shellenberger', name: 'Michael Shellenberger', weight: 1.0 },
    { handle: 'Judgenap', name: 'Judge Napolitano', weight: 1.0 },
    { handle: 'AFpost', name: 'AF Post', weight: 1.0 },
    { handle: 'BreakingPoints', name: 'Breaking Points', weight: 1.0 },
    { handle: 'DropsiteNews', name: 'Drop Site News', weight: 1.0 },
    { handle: 'ComicDaveSmith', name: 'Dave Smith', weight: 1.0 },
    { handle: 'BretWeinstein', name: 'Bret Weinstein', weight: 1.0 },
    { handle: 'TheGrayzoneNews', name: 'The Grayzone', weight: 1.0 },
    { handle: 'VigilantFox', name: 'Vigilant Fox', weight: 1.0 },
    { handle: 'MarioNawfal', name: 'Mario Nawfal', weight: 1.0 },
    { handle: 'jimmy_dore', name: 'Jimmy Dore', weight: 1.0 }
];

// === VIDEO FEEDS ===
const VIDEO_FEEDS = [
    { name: 'Tucker Carlson', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsox8LQ1disc39gKMO7SBDg', weight: 1.0 },
    { name: 'Judge Napolitano', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC7MpzwYC_T_V1HvxSWu9f0g', weight: 1.0 },
    { name: 'Breaking Points', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCULvqbr5KVJqa5cMGvfgx7A', weight: 1.0 },
    { name: 'Jimmy Dore', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC3M7l8ved_rYQ45AVzS0RGA', weight: 1.0 },
    { name: 'Bret Weinstein', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCi5N_uAqApEUIlg32QzkPlg', weight: 1.0 },
    { name: 'Dave Smith', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC6gH70EPp8QQjRfEcW2t4uA', weight: 1.0 },
    { name: 'The Grayzone', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCEXR8pRTkE2vFeJePNe9UcQ', weight: 1.0 },
    { name: 'Owen Shroyer', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCVt4pCBSXMqmNbIpvx1Rary', weight: 1.0 },
    { name: 'Glenn Greenwald', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_IjKSS2HjhjBrC3Xb-qSdg', weight: 1.0 },
    { name: 'The Young Turks', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1yBKRuGpC1tSM73A0ZjYjQ', weight: 1.0 },
    { name: 'Nick Fuentes', url: 'https://rumble.com/c/NickJFuentes/feed', weight: 1.0, platform: 'rumble' }
];

const MAX_PER_SOURCE_PER_SECTION = 1;

const NON_NEWS_FILTERS = [
    'episode', 'ep.', 'ep ', 'podcast', 'full show', 'full episode',
    'compilation', 'best of', 'highlights', 'preview', 'trailer',
    'subscribe', 'join us', 'live stream starting', 'going live'
];

let cachedTweets = [];
let cachedVideos = [];
let lastFetch = null;

function isNewsContent(headline) {
    const lower = headline.toLowerCase();
    return !NON_NEWS_FILTERS.some(filter => lower.includes(filter));
}

function getVideoThumbnail(item, feed) {
    if (feed.url.includes('youtube.com') && item.link) {
        const match = item.link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
        if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }
    if (item.enclosure?.url) return item.enclosure.url;
    if (item.content) {
        const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) return imgMatch[1];
    }
    if (item['media:thumbnail']?.$.url) return item['media:thumbnail'].$.url;
    return null;
}

function timeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 172800) return 'yesterday';
    return Math.floor(seconds / 86400) + 'd ago';
}

async function fetchXPosts() {
    if (!X_BEARER_TOKEN) {
        console.log('No X Bearer Token - skipping X API');
        return [];
    }

    const stories = [];

    for (const account of X_ACCOUNTS) {
        try {
            const userResponse = await fetch(
                `https://api.twitter.com/2/users/by/username/${account.handle}`,
                { headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` } }
            );

            if (!userResponse.ok) continue;

            const userData = await userResponse.json();
            if (!userData.data) continue;

            const userId = userData.data.id;

            const tweetsResponse = await fetch(
                `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics&exclude=retweets,replies`,
                { headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` } }
            );

            if (!tweetsResponse.ok) continue;

            const tweetsData = await tweetsResponse.json();

            if (tweetsData.data) {
                for (const tweet of tweetsData.data) {
                    if (!isNewsContent(tweet.text)) continue;
                    if (tweet.text.length < 50) continue;

                    let headline = tweet.text.split('\n')[0];
                    if (headline.length > 150) {
                        headline = headline.substring(0, 147) + '...';
                    }

                    const engagement = tweet.public_metrics ? 
                        (tweet.public_metrics.like_count + tweet.public_metrics.retweet_count * 2 + tweet.public_metrics.reply_count) : 0;

                    stories.push({
                        headline: headline,
                        url: `https://x.com/${account.handle}/status/${tweet.id}`,
                        source: account.name,
                        sourceHandle: account.handle,
                        pubDate: tweet.created_at,
                        timeAgo: timeAgo(tweet.created_at),
                        type: 'tweet',
                        engagement: engagement,
                        trending: engagement > 1000,
                        sourceWeight: account.weight
                    });
                }
            }

            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.error(`Error fetching X posts for ${account.handle}:`, error.message);
        }
    }

    return stories;
}

async function fetchVideoFeeds() {
    const videos = [];

    for (const feed of VIDEO_FEEDS) {
        try {
            const parsed = await parser.parseURL(feed.url);

            for (const item of parsed.items.slice(0, 5)) {
                if (!isNewsContent(item.title)) continue;

                const thumbnail = getVideoThumbnail(item, feed);
                const pubDate = item.pubDate || item.isoDate || new Date().toISOString();

                videos.push({
                    headline: item.title,
                    url: item.link,
                    source: feed.name,
                    pubDate: pubDate,
                    timeAgo: timeAgo(pubDate),
                    imageUrl: thumbnail,
                    type: 'video',
                    platform: feed.platform || 'youtube',
                    engagement: 0,
                    sourceWeight: feed.weight
                });
            }
        } catch (error) {
            console.error(`Error fetching videos from ${feed.name}:`, error.message);
        }
    }

    return videos;
}

function calculateScore(story) {
    const now = Date.now();
    const storyDate = new Date(story.pubDate).getTime();
    const ageHours = (now - storyDate) / (1000 * 60 * 60);

    let recencyScore = 0;
    if (ageHours < 3) recencyScore = 30;
    else if (ageHours < 6) recencyScore = 25;
    else if (ageHours < 12) recencyScore = 20;
    else if (ageHours < 24) recencyScore = 15;
    else if (ageHours < 48) recencyScore = 10;
    else recencyScore = Math.max(0, 5 - (ageHours / 24));

    const sourceScore = (story.sourceWeight || 0.5) * 20;

    let engagementScore = 5;
    if (story.type === 'tweet' && story.engagement) {
        engagementScore = Math.min(50, 5 + Math.log10(story.engagement + 1) * 10);
    }

    return recencyScore + sourceScore + engagementScore;
}

function getTopPostPerSource(stories, maxPerSource = 1) {
    const sorted = [...stories].sort((a, b) => b.score - a.score);
    
    const sourceCounts = {};
    return sorted.filter(story => {
        const source = story.source.toLowerCase();
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        return sourceCounts[source] <= maxPerSource;
    });
}

async function refreshStories() {
    console.log('Refreshing stories...');

    try {
        const [xPosts, videos] = await Promise.all([
            fetchXPosts(),
            fetchVideoFeeds()
        ]);

        console.log(`Fetched ${xPosts.length} X posts, ${videos.length} videos`);

        const scoredXPosts = xPosts.map(story => ({ ...story, score: calculateScore(story) }));
        const scoredVideos = videos.map(story => ({ ...story, score: calculateScore(story) }));

        cachedTweets = getTopPostPerSource(scoredXPosts, MAX_PER_SOURCE_PER_SECTION);
        cachedVideos = getTopPostPerSource(scoredVideos, MAX_PER_SOURCE_PER_SECTION);

        lastFetch = new Date();

        console.log(`Cached: ${cachedTweets.length} tweets, ${cachedVideos.length} videos`);
        console.log(`Video sources: ${cachedVideos.map(v => v.source).join(', ')}`);

    } catch (error) {
        console.error('Error refreshing stories:', error);
    }
}

// === API ENDPOINTS ===

app.get('/api/tweets', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json({ 
        tweets: cachedTweets.slice(0, limit), 
        lastUpdated: lastFetch, 
        count: cachedTweets.length 
    });
});

app.get('/api/videos', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json({ 
        videos: cachedVideos.slice(0, limit), 
        lastUpdated: lastFetch, 
        count: cachedVideos.length 
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        tweets: cachedTweets.length,
        videos: cachedVideos.length,
        lastFetch: lastFetch, 
        uptime: process.uptime() 
    });
});

app.get('/api/refresh', async (req, res) => {
    await refreshStories();
    res.json({ 
        success: true, 
        tweets: cachedTweets.length,
        videos: cachedVideos.length
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

refreshStories().then(() => {
    app.listen(PORT, () => { 
        console.log(`McMahon.News server running on port ${PORT}`); 
    });
});

setInterval(refreshStories, 15 * 60 * 1000);
