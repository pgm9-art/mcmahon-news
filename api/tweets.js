// X Sources - 18 accounts
const X_ACCOUNTS = [
    { handle: 'TuckerCarlson', name: 'Tucker Carlson', followers: 17000000 },
    { handle: 'EndWokeness', name: 'End Wokeness', followers: 3200000 },
    { handle: 'MarioNawfal', name: 'Mario Nawfal', followers: 2800000 },
    { handle: 'ggreenwald', name: 'Glenn Greenwald', followers: 2100000 },
    { handle: 'shellenberger', name: 'Michael Shellenberger', followers: 2000000 },
    { handle: 'BretWeinstein', name: 'Bret Weinstein', followers: 1800000 },
    { handle: 'VigilantFox', name: 'Vigilant Fox', followers: 1500000 },
    { handle: 'WallStreetApes', name: 'Wall Street Apes', followers: 1200000 },
    { handle: 'jimmy_dore', name: 'Jimmy Dore', followers: 1200000 },
    { handle: 'NickJFuentes', name: 'Nick Fuentes', followers: 1100000 },
    { handle: 'AFpost', name: 'AF Post', followers: 800000 },
    { handle: 'OwenShroyer1776', name: 'Owen Shroyer', followers: 800000 },
    { handle: 'realstewpeters', name: 'Stew Peters', followers: 700000 },
    { handle: 'ComicDaveSmith', name: 'Dave Smith', followers: 600000 },
    { handle: 'TheYoungTurks', name: 'The Young Turks', followers: 600000 },
    { handle: 'TheGrayzoneNews', name: 'The Grayzone', followers: 500000 },
    { handle: 'DropSiteNews', name: 'Drop Site News', followers: 400000 },
    { handle: 'iancarrollshow', name: 'Ian Carroll', followers: 300000 }
];

async function fetchTweet(account, bearerToken) {
    const userUrl = `https://api.twitter.com/2/users/by/username/${account.handle}?user.fields=profile_image_url`;
    
    const userResponse = await fetch(userUrl, {
        headers: { 'Authorization': `Bearer ${bearerToken}` }
    });
    
    if (!userResponse.ok) {
        throw new Error(`User fetch failed (${userResponse.status})`);
    }
    
    const userData = await userResponse.json();
    if (!userData.data) {
        throw new Error('User not found');
    }
    
    const userId = userData.data.id;
    const profileImage = userData.data.profile_image_url?.replace('_normal', '_200x200');
    
    // Fetch more tweets so we can filter out ads
    const tweetsUrl = `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics&exclude=retweets,replies`;
    
    const tweetsResponse = await fetch(tweetsUrl, {
        headers: { 'Authorization': `Bearer ${bearerToken}` }
    });
    
    if (!tweetsResponse.ok) {
        throw new Error(`Tweets fetch failed (${tweetsResponse.status})`);
    }
    
    const tweetsData = await tweetsResponse.json();
    if (!tweetsData.data || tweetsData.data.length === 0) {
        throw new Error('No tweets found');
    }
    
    // Find first non-ad tweet (skip "Paid partnership" posts)
    const tweet = tweetsData.data.find(t => 
        !t.text.toLowerCase().startsWith('paid partnership')
    ) || tweetsData.data[0]; // fallback to first if all are ads
    
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

// Distribute tweets zigzag: 1st goes left, 2nd goes right, 3rd left, 4th right, etc.
function distributeZigzag(sortedTweets) {
    const left = [];
    const right = [];
    
    sortedTweets.forEach((tweet, index) => {
        if (index % 2 === 0) {
            left.push(tweet);  // 1st, 3rd, 5th... go left
        } else {
            right.push(tweet); // 2nd, 4th, 6th... go right
        }
    });
    
    return { left, right };
}

module.exports = async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    
    const bearerToken = process.env.X_BEARER_TOKEN;
    
    if (!bearerToken) {
        return res.status(500).json({ 
            error: 'X_BEARER_TOKEN not configured',
            tweets: [],
            left: [],
            right: []
        });
    }
    
    const tweets = [];
    const errors = [];
    
    // Fetch tweets sequentially with delay to avoid rate limits
    for (const account of X_ACCOUNTS) {
        try {
            const tweet = await fetchTweet(account, bearerToken);
            tweets.push(tweet);
        } catch (error) {
            errors.push(`${account.handle}: ${error.message}`);
        }
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Sort by recency (most recent first)
    tweets.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    
    // Distribute zigzag for left/right columns (based on recency order)
    const { left, right } = distributeZigzag(tweets);
    
    res.status(200).json({
        tweets: tweets,
        left: left,
        right: right,
        count: tweets.length,
        errors: errors.slice(0, 5),
        lastUpdated: new Date().toISOString()
    });
};
