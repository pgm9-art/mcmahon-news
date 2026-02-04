const fetch = require('node-fetch');

// 13 YouTube + 2 Rumble = 15 Video Sources
const YOUTUBE_CHANNELS = [
    { id: 'UCGttrUON87gWfU6dMWm1fcA', name: 'Tucker Carlson', handle: 'tuckercarlson' },
    { id: 'UCjjBjVc0b1cIpNGEeZtS2lg', name: 'TCN', handle: 'tcnetwork' },
    { id: 'UCDkEYb-TXJVWLvOokshtlsw', name: 'Judge Napolitano', handle: 'judgingfreedom' },
    { id: 'UCDRIjKy6eZOvKtOELtTdeUA', name: 'Breaking Points', handle: 'breakingpoints' },
    { id: 'UC3M7l8ved_rYQ45AVzS0RGA', name: 'Jimmy Dore', handle: 'thejimmydoreshow' },
    { id: 'UCi5N_uAqApEUIlg32QzkPlg', name: 'Bret Weinstein', handle: 'darkhorsepod' },
    { id: 'UCEfe80CP2cs1eLRNQazffZw', name: 'Dave Smith', handle: 'partoftheproblem' },
    { id: 'UC1yBKRuGpC1tSM73A0ZjYjQ', name: 'The Young Turks', handle: 'theyoungturks' },
    { id: 'UChzVhAwzGR7hV-4O8ZmBLHg', name: 'Glenn Greenwald', handle: 'glenngreenwald' },
    { id: 'UCcE1-IiX4fLqbbVjPx0Bnag', name: 'Owen Shroyer', handle: 'owenreport' },
    { id: 'UCzQUP1qoWDoEbmsQxvdjxgQ', name: 'Joe Rogan', handle: 'joerogan' },
    { id: 'UC4woSp8ITBoYDmjkukhEhxg', name: 'Tim Dillon', handle: 'timdillonshow' },
    { id: 'UCEXR8pRTkE2vFeJePNe9UcQ', name: 'The Grayzone', handle: 'thegrayzone7996' }
];

const RUMBLE_CHANNELS = [
    { handle: 'nickjfuentes', name: 'Nick Fuentes' },
    { handle: 'StewPeters', name: 'Stew Peters' }
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
        timeAgo: timeAgo(published)
    };
}

async function fetchRumbleVideo(channel) {
    const feedUrl = `https://openrss.org/rumble.com/c/${channel.handle}`;
    const response = await fetch(feedUrl);
    
    if (!response.ok) {
        throw new Error(`Rumble feed failed (${response.status})`);
    }
    
    const xml = await response.text();
    
    const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
    if (!itemMatch) {
        throw new Error('No items in Rumble feed');
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
        throw new Error('Could not parse Rumble video data');
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
        timeAgo: pubDate ? timeAgo(pubDate) : 'recently'
    };
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
    
    videos.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    
    res.status(200).json({
        videos: videos,
        count: videos.length,
        errors: errors.slice(0, 5),
        lastUpdated: new Date().toISOString()
    });
};
