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

// Scrape Rumble channel page directly (openrss.org returns 429)
async function fetchRumbleVideo(channel) {
    const channelUrl = `https://rumble.com/c/${channel.handle}`;
    const response = await fetch(channelUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Rumble page fetch failed (${response.status})`);
    }
    
    const html = await response.text();
    
    // Extract first video link and title from the channel page HTML
    let videoUrl = null;
    let videoTitle = null;
    let videoThumb = null;
    let videoPubDate = null;
    
    // Try videostream link class first
    const videoPattern = /<a[^>]*class="[^"]*videostream__link[^"]*"[^>]*href="([^"]+)"[^>]*>/;
    const linkMatch = html.match(videoPattern);
    
    if (linkMatch) {
        videoUrl = 'https://rumble.com' + linkMatch[1];
    } else {
        // Fallback: find first /v* link that looks like a video
        const broadPattern = /<a[^>]*href="(\/v[a-z0-9]+-[^"]+\.html[^"]*)"/;
        const broadMatch = html.match(broadPattern);
        if (broadMatch) {
            videoUrl = 'https://rumble.com' + broadMatch[1].split('?')[0];
        }
    }
    
    if (!videoUrl) {
        throw new Error('No video found on Rumble channel page');
    }
    
    // Extract title
    const titlePatterns = [
        /<h3[^>]*class="[^"]*videostream__title[^"]*"[^>]*>([^<]+)<\/h3>/,
        /<title>([^<]+)<\/title>/
    ];
    
    for (const pattern of titlePatterns) {
        const match = html.match(pattern);
        if (match) {
            videoTitle = match[1].trim();
            break;
        }
    }
    
    // If we got the page title, it's not useful - try to get from the video area
    if (!videoTitle || videoTitle.includes('Rumble')) {
        const afterLink = html.indexOf(videoUrl.replace('https://rumble.com', ''));
        if (afterLink > -1) {
            const chunk = html.substring(afterLink, afterLink + 2000);
            const titleMatch = chunk.match(/<(?:h3|span|div)[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</);
            if (titleMatch) {
                videoTitle = titleMatch[1].trim();
            }
        }
    }
    
    // Try videostream listing title
    if (!videoTitle) {
        const listingTitleMatch = html.match(/class="videostream__title[^"]*"[^>]*>\s*<span[^>]*>([^<]+)/);
        if (listingTitleMatch) {
            videoTitle = listingTitleMatch[1].trim();
        }
    }
    
    // Last resort: extract from the video URL slug
    if (!videoTitle) {
        const slug = videoUrl.match(/\/v[a-z0-9]+-(.+)\.html/);
        if (slug) {
            videoTitle = slug[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        } else {
            videoTitle = channel.name + ' - Latest Video';
        }
    }
    
    // Extract thumbnail
    const thumbPatterns = [
        /class="videostream__image[^"]*"[^>]*src="([^"]+)"/,
        /<img[^>]*class="[^"]*thumbnail__image[^"]*"[^>]*src="([^"]+)"/,
        /<img[^>]*src="(https:\/\/[^"]*(?:sp\/|thumb)[^"]+)"/
    ];
    
    for (const pattern of thumbPatterns) {
        const match = html.match(pattern);
        if (match) {
            videoThumb = match[1];
            break;
        }
    }
    
    // Extract publish date from time element
    const timeMatch = html.match(/<time[^>]*datetime="([^"]+)"/);
    if (timeMatch) {
        videoPubDate = new Date(timeMatch[1]).toISOString();
    } else {
        videoPubDate = new Date().toISOString();
    }
    
    // Decode HTML entities in title
    videoTitle = videoTitle
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
    
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
