const express = require('express');
const cors = require('cors');
const RSSParser = require('rss-parser');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const parser = new RSSParser({
    customFields: {
        item: [['media:group', 'mediaGroup']]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;

// === X ACCOUNTS - ALL 15 SOURCES ===
const X_ACCOUNTS = [
    { handle: 'TuckerCarlson', name: 'Tucker Carlson' },
    { handle: 'ggreenwald', name: 'Glenn Greenwald' },
    { handle: 'NickJFuentes', name: 'Nick Fuentes' },
    { handle: 'OwenShroyer1776', name: 'Owen Shroyer' },
    { handle: 'JudgeNap', name: 'Judge Napolitano' },
    { handle: 'BreakingPoints', name: 'Breaking Points' },
    { handle: 'jimmy_dore', name: 'Jimmy Dore' },
    { handle: 'BretWeinstein', name: 'Bret Weinstein' },
    { handle: 'ComicDaveSmith', name: 'Dave Smith' },
    { handle: 'TheGrayzoneNews', name: 'The Grayzone' },
    { handle: 'TheYoungTurks', name: 'The Young Turks' },
    { handle: 'DropSiteNews', name: 'Drop Site News' },
    { handle: 'MaxBlumenthal', name: 'Max Blumenthal' },
    { handle: 'AasaWitteveen', name: 'Aasa Witteveen' },
    { handle: 'RealAlexJones', name: 'Alex Jones' }
];

const VIDEO_FEEDS = [
    { name: 'Tucker Carlson', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCjjBjVc0b1cIpNGEeZtS2lg' },
    { name: 'Judge Napolitano', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCDkEYb-TXJVWLv0okshtlsw' },
    { name: 'Breaking Points', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCDRIjKy6eZ0vKt0ELtTdeUA' },
    { name: 'Jimmy Dore', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC3M718ved_rYQ45AVzS0RGA' },
    { name: 'Bret Weinstein', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCi5N_uAqApEUIlg32QzkPlg' },
    { name: 'Dave Smith', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCEfe80CP2cs1eLRNQazffZw' },
    { name: 'The Grayzone', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCEXR8pRTkE2vFeJePNe9UcQ' },
    { name: 'Glenn Greenwald', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UChzVhAwzGR7hV-408ZmBLHg' },
    { name: 'The Young Turks', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1yBKRuGpC1tSM73A0ZjYjQ' },
    { name: 'Owen Shroyer', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC-hW9CchHhAEZNfPgkMpysg' },
    { name: 'Nick Fuentes', url: 'https://openrss.org/rumble.com/c/NickJFuentes', platform: 'rumble' }
];

const MAX_PER_SOURCE = 3;
const NON_NEWS_FILTERS = ['subscribe', 'join us', 'live stream starting', 'going live', 'trailer', 'preview'];

function isNewsContent(headline) {
    if (!headline) return false;
    const lower = headline.toLowerCase();
    return !NON_NEWS_FILTERS.some(filter => lower.includes(filter));
}

function getVideoThumbnail(item) {
    if (item.link) {
        const match = item.link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
        if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }
    if (item.mediaGroup && item.mediaGroup['media:thumbnail']) {
        const thumb = item.mediaGroup['media:thumbnail'];
        if (Array.isArray(thumb) && thumb[0] && thumb[0].$) return thumb[0].$.url;
        if (thumb && thumb.$) return thumb.$.url;
    }
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

function sortByRecency(items) {
    return items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

function limitPerSource(items, max) {
    const counts = {};
    return items.filter(item => {
        const src = item.source.toLowerCase();
        counts[src] = (counts[src] || 0) + 1;
        return counts[src] <= max;
    });
}

// Fetch X posts on-demand
async function fetchXPosts() {
    if (!X_BEARER_TOKEN) {
        console.log('No X Bearer Token configured');
        return { tweets: [], errors: ['No X Bearer Token'] };
    }
    
    const stories = [];
    const errors = [];
    
    const results = await Promise.allSettled(
        X_ACCOUNTS.map(async (account) => {
            try {
                const userResponse = await fetch(
                    `https://api.twitter.com/2/users/by/username/${account.handle}`,
                    { headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` } }
                );
                
                if (!userResponse.ok) return { account, error: `User fetch failed (${userResponse.status})` };
                
                const userData = await userResponse.json();
                if (!userData.data?.id) return { account, error: 'No user data' };
                
                const tweetsResponse = await fetch(
                    `https://api.twitter.com/2/users/${userData.data.id}/tweets?max_results=5&tweet.fields=created_at,public_metrics&exclude=retweets,replies`,
                    { headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` } }
                );
                
                if (!tweetsResponse.ok) return { account, error: `Tweets fetch failed (${tweetsResponse.status})` };
                
                const tweetsData = await tweetsResponse.json();
                
                if (tweetsData.data?.length > 0) {
                    const accountTweets = [];
                    for (const tweet of tweetsData.data) {
                        if (!isNewsContent(tweet.text) || tweet.text.length < 30) continue;
                        
                        let headline = tweet.text.split('\n')[0];
                        if (headline.length > 200) headline = headline.substring(0, 197) + '...';
                        
                        accountTweets.push({
                            headline,
                            url: `https://x.com/${account.handle}/status/${tweet.id}`,
                            source: account.name,
                            sourceHandle: account.handle,
                            pubDate: tweet.created_at,
                            timeAgo: timeAgo(tweet.created_at),
                            type: 'tweet',
                            engagement: tweet.public_metrics ? 
                                (tweet.public_metrics.like_count + tweet.public_metrics.retweet_count * 2 + tweet.public_metrics.reply_count) : 0
                        });
                    }
                    return { account, tweets: accountTweets };
                }
                return { account, tweets: [] };
            } catch (error) {
                return { account, error: error.message };
            }
        })
    );
    
    for (const result of results) {
        if (result.status === 'fulfilled') {
            if (result.value.tweets) stories.push(...result.value.tweets);
            if (result.value.error) errors.push(`${result.value.account.handle}: ${result.value.error}`);
        }
    }
    
    const sorted = sortByRecency(stories);
    const limited = limitPerSource(sorted, MAX_PER_SOURCE);
    
    console.log(`X API: Fetched ${limited.length} tweets, ${errors.length} errors`);
    return { tweets: limited, errors };
}

// Fetch video feeds on-demand
async function fetchVideoFeeds() {
    const videos = [];
    const errors = [];
    
    const results = await Promise.allSettled(
        VIDEO_FEEDS.map(async (feed) => {
            try {
                const parsed = await parser.parseURL(feed.url);
                if (parsed.items?.length > 0) {
                    const feedVideos = [];
                    for (const item of parsed.items.slice(0, 5)) {
                        if (!isNewsContent(item.title)) continue;
                        const pubDate = item.pubDate || item.isoDate || new Date().toISOString();
                        feedVideos.push({
                            headline: item.title,
                            url: item.link,
                            source: feed.name,
                            pubDate,
                            timeAgo: timeAgo(pubDate),
                            imageUrl: getVideoThumbnail(item),
                            type: 'video',
                            platform: feed.platform || 'youtube'
                        });
                    }
                    return { feed, videos: feedVideos };
                }
                return { feed, videos: [] };
            } catch (error) {
                return { feed, error: error.message };
            }
        })
    );
    
    for (const result of results) {
        if (result.status === 'fulfilled') {
            if (result.value.videos) videos.push(...result.value.videos);
            if (result.value.error) errors.push(`${result.value.feed.name}: ${result.value.error}`);
        }
    }
    
    const sorted = sortByRecency(videos);
    const limited = limitPerSource(sorted, MAX_PER_SOURCE);
    
    console.log(`Videos: Fetched ${limited.length} videos, ${errors.length} errors`);
    return { videos: limited, errors };
}

// API endpoint for tweets - fetches on-demand
app.get('/api/tweets', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const { tweets, errors } = await fetchXPosts();
        res.json({
            tweets: tweets.slice(0, limit),
            count: tweets.length,
            errors: errors.slice(0, 10),
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Tweets API error:', error);
        res.status(500).json({ error: error.message, tweets: [] });
    }
});

// API endpoint for videos - fetches on-demand  
app.get('/api/videos', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const { videos, errors } = await fetchVideoFeeds();
        res.json({
            videos: videos.slice(0, limit),
            count: videos.length,
            errors: errors.slice(0, 10),
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Videos API error:', error);
        res.status(500).json({ error: error.message, videos: [] });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        hasXToken: !!X_BEARER_TOKEN,
        videoFeeds: VIDEO_FEEDS.length,
        xAccounts: X_ACCOUNTS.length,
        timestamp: new Date().toISOString()
    });
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// CRITICAL: Export for Vercel serverless
module.exports = app;
