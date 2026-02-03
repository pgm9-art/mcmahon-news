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
const PORT = process.env.PORT || 3000;

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
    { handle: 'shellenberger', name: 'Michael Shellenberger' },
    { handle: 'Judgenap', name: 'Judge Napolitano' },
    { handle: 'AFpost', name: 'AF Post' },
    { handle: 'BreakingPoints', name: 'Breaking Points' },
    { handle: 'DropsiteNews', name: 'Drop Site News' },
    { handle: 'ComicDaveSmith', name: 'Dave Smith' },
    { handle: 'BretWeinstein', name: 'Bret Weinstein' },
    { handle: 'TheGrayzoneNews', name: 'The Grayzone' },
    { handle: 'VigilantFox', name: 'Vigilant Fox' },
    { handle: 'MarioNawfal', name: 'Mario Nawfal' },
    { handle: 'jimmy_dore', name: 'Jimmy Dore' }
];

// === VIDEO FEEDS - VERIFIED YOUTUBE CHANNEL IDs ===
const VIDEO_FEEDS = [
    { name: 'Tucker Carlson', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCjjBjVc0b1cIpNGEeZtS2lg' },
    { name: 'Judge Napolitano', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCDkEYb-TXJVWLvOokshtlsw' },
    { name: 'Breaking Points', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCDRIjKy6eZOvKtOELtTdeUA' },
    { name: 'Jimmy Dore', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC3M7l8ved_rYQ45AVzS0RGA' },
    { name: 'Bret Weinstein', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCi5N_uAqApEUIlg32QzkPlg' },
    { name: 'Dave Smith', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCEfe80CP2cs1eLRNQazffZw' },
    { name: 'The Grayzone', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCEXR8pRTkE2vFeJePNe9UcQ' },
    { name: 'Glenn Greenwald', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UChzVhAwzGR7hV-4O8ZmBLHg' },
    { name: 'The Young Turks', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1yBKRuGpC1tSM73A0ZjYjQ' },
    { name: 'Owen Shroyer', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC-hW9CchHhAEZNfPgkMpysg' },
    { name: 'Nick Fuentes', url: 'https://openrss.org/rumble.com/c/NickJFuentes', platform: 'rumble' }
];

const MAX_PER_SOURCE = 2;

const NON_NEWS_FILTERS = ['subscribe', 'join us', 'live stream starting', 'going live', 'trailer', 'preview'];

let cachedTweets = [];
let cachedVideos = [];
let lastFetch = null;
let fetchErrors = [];

function isNewsContent(headline) {
    if (!headline) return false;
    const lower = headline.toLowerCase();
    return !NON_NEWS_FILTERS.some(filter => lower.includes(filter));
}

function getVideoThumbnail(item, feed) {
    if (item.link) {
        const match = item.link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
        if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }
    
    if (item.mediaGroup && item.mediaGroup['media:thumbnail']) {
        const thumb = item.mediaGroup['media:thumbnail'];
        if (Array.isArray(thumb) && thumb[0] && thumb[0].$.url) {
            return thumb[0].$.url;
        }
        if (thumb && thumb.$ && thumb.$.url) {
            return thumb.$.url;
        }
    }
    
    if (item.enclosure?.url) return item.enclosure.url;
    
    if (item.content) {
        const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) return imgMatch[1];
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

async function fetchXPosts() {
    if (!X_BEARER_TOKEN) {
        console.log('No X Bearer Token configured');
        fetchErrors.push('No X Bearer Token');
        return [];
    }

    const stories = [];
    const successfulAccounts = [];
    const failedAccounts = [];

    for (const account of X_ACCOUNTS) {
        try {
            const userResponse = await fetch(
                `https://api.twitter.com/2/users/by/username/${account.handle}`,
                { headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` } }
            );

            if (!userResponse.ok) {
                const errorText = await userResponse.text();
                failedAccounts.push(`${account.handle}: User lookup failed (${userResponse.status}) - ${errorText.substring(0, 100)}`);
                continue;
            }

            const userData = await userResponse.json();
            if (!userData.data) {
                failedAccounts.push(`${account.handle}: No user data returned`);
                continue;
            }

            const userId = userData.data.id;

            const tweetsResponse = await fetch(
                `https://api.twitter.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at,public_metrics&exclude=retweets,replies`,
                { headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` } }
            );

            if (!tweetsResponse.ok) {
                const errorText = await tweetsResponse.text();
                failedAccounts.push(`${account.handle}: Tweets fetch failed (${tweetsResponse.status}) - ${errorText.substring(0, 100)}`);
                continue;
            }

            const tweetsData = await tweetsResponse.json();

            if (tweetsData.data && tweetsData.data.length > 0) {
                successfulAccounts.push(account.handle);
                
                for (const tweet of tweetsData.data) {
                    if (!isNewsContent(tweet.text)) continue;
                    if (tweet.text.length < 30) continue;

                    let headline = tweet.text.split('\n')[0];
                    if (headline.length > 200) {
                        headline = headline.substring(0, 197) + '...';
                    }

                    const engagement = tweet.public_metrics ? 
                        (tweet.public_metrics.like_count + tweet.public_metrics.retweet_count * 2 + tweet.public_metrics.reply_count) : 0;

                    stories.push({
                        headline,
                        url: `https://x.com/${account.handle}/status/${tweet.id}`,
                        source: account.name,
                        sourceHandle: account.handle,
                        pubDate: tweet.created_at,
                        timeAgo: timeAgo(tweet.created_at),
                        type: 'tweet',
                        engagement,
                        trending: engagement > 500
                    });
                }
            } else {
                failedAccounts.push(`${account.handle}: No tweets returned`);
            }

            await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error) {
            failedAccounts.push(`${account.handle}: ${error.message}`);
        }
    }

    console.log(`X API: ${successfulAccounts.length}/15 accounts succeeded`);
    console.log(`Successful: ${successfulAccounts.join(', ')}`);
    if (failedAccounts.length > 0) {
        console.log(`Failed: ${failedAccounts.length} accounts`);
        failedAccounts.forEach(f => console.log(`- ${f}`));
        fetchErrors.push(...failedAccounts);
    }

    return stories;
}

async function fetchVideoFeeds() {
    const videos = [];
    const successfulFeeds = [];
    const failedFeeds = [];

    for (const feed of VIDEO_FEEDS) {
        try {
            const parsed = await parser.parseURL(feed.url);

            if (parsed.items && parsed.items.length > 0) {
                successfulFeeds.push(feed.name);
                
                for (const item of parsed.items.slice(0, 3)) {
                    if (!isNewsContent(item.title)) continue;

                    const thumbnail = getVideoThumbnail(item, feed);
                    const pubDate = item.pubDate || item.isoDate || new Date().toISOString();

                    videos.push({
                        headline: item.title,
                        url: item.link,
                        source: feed.name,
                        pubDate,
                        timeAgo: timeAgo(pubDate),
                        imageUrl: thumbnail,
                        type: 'video',
                        platform: feed.platform || 'youtube'
                    });
                }
            } else {
                failedFeeds.push(`${feed.name}: No items in feed`);
            }
        } catch (error) {
            failedFeeds.push(`${feed.name}: ${error.message}`);
        }
    }

    console.log(`Video feeds: ${successfulFeeds.length}/${VIDEO_FEEDS.length} succeeded`);
    console.log(`Successful: ${successfulFeeds.join(', ')}`);
    if (failedFeeds.length > 0) {
        console.log(`Failed: ${failedFeeds.length} feeds`);
        failedFeeds.forEach(f => console.log(`- ${f}`));
        fetchErrors.push(...failedFeeds);
    }

    return videos;
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

async function refreshStories() {
    console.log('========================================');
    console.log('REFRESHING STORIES - ' + new Date().toISOString());
    console.log('========================================');
    fetchErrors = [];

    try {
        const [xPosts, videos] = await Promise.all([
            fetchXPosts(),
            fetchVideoFeeds()
        ]);

        const sortedTweets = sortByRecency(xPosts);
        const sortedVideos = sortByRecency(videos);

        cachedTweets = limitPerSource(sortedTweets, MAX_PER_SOURCE);
        cachedVideos = limitPerSource(sortedVideos, MAX_PER_SOURCE);

        lastFetch = new Date();

        console.log('========================================');
        console.log(`FINAL CACHE: ${cachedTweets.length} tweets, ${cachedVideos.length} videos`);
        console.log(`Tweet sources: ${[...new Set(cachedTweets.map(t => t.source))].join(', ')}`);
        console.log(`Video sources: ${[...new Set(cachedVideos.map(v => v.source))].join(', ')}`);
        console.log('========================================');

    } catch (error) {
        console.error('Fatal refresh error:', error);
        fetchErrors.push(`Fatal: ${error.message}`);
    }
}

app.get('/api/tweets', (req, res) => {
    const limit = parseInt(req.query.limit) || 30;
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
        tweetSources: [...new Set(cachedTweets.map(t => t.source))],
        videos: cachedVideos.length,
        videoSources: [...new Set(cachedVideos.map(v => v.source))],
        lastFetch,
        errors: fetchErrors.slice(0, 30),
        uptime: process.uptime() 
    });
});

app.get('/api/refresh', async (req, res) => {
    await refreshStories();
    res.json({ 
        success: true, 
        tweets: cachedTweets.length,
        tweetSources: [...new Set(cachedTweets.map(t => t.source))],
        videos: cachedVideos.length,
        videoSources: [...new Set(cachedVideos.map(v => v.source))],
        errors: fetchErrors.slice(0, 30)
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

refreshStories().then(() => {
    app.listen(PORT, () => { 
        console.log(`McMahon.News running on port ${PORT}`); 
    });
});

setInterval(refreshStories, 15 * 60 * 1000);
