require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

async function yt(url) {
  if (!API_KEY) throw new Error("YOUTUBE_API_KEY が設定されていません。");
  const u = new URL(url);
  u.searchParams.set("key", API_KEY);
  const r = await fetch(u);
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "YouTube API error");
  return data;
}

function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }

function buildMinuteStats(messages) {
  const map = new Map();
  for (const m of messages) {
    const t = new Date(m.snippet?.publishedAt || 0);
    if (!t.getTime()) continue;
    const key = new Date(Math.floor(t.getTime() / 60000) * 60000).toISOString();
    map.set(key, (map.get(key) || 0) + 1);
  }
  const rows = [...map.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  const counts = rows.map(x => x[1]);
  return {
    labels: rows.map(x => new Date(x[0]).toLocaleTimeString("ja-JP", {hour:"2-digit", minute:"2-digit"})),
    values: counts,
    average: counts.length ? Math.round(counts.reduce((a,b)=>a+b,0) / counts.length * 10) / 10 : 0,
    peak: counts.length ? Math.max(...counts) : 0,
    peakIndex: counts.length ? counts.indexOf(Math.max(...counts)) : -1
  };
}

function analyzeMessages(messages) {
  const users = new Map();
  let consecutive = 0;
  const sorted = [...messages].sort((a,b) =>
    new Date(a.snippet?.publishedAt || 0) - new Date(b.snippet?.publishedAt || 0)
  );

  for (let i=0; i<sorted.length; i++) {
    const m = sorted[i];
    const s = m.snippet || {};
    const author = s.authorChannelId || m.authorDetails?.channelId || m.authorDetails?.displayName || "unknown";
    const name = m.authorDetails?.displayName || author;
    const text = s.displayMessage || "";
    const item = users.get(author) || {id: author, name, count:0, maxStreak:1, streak:1, totalLength:0};
    item.count++;
    item.totalLength += text.length;
    if (i > 0) {
      const prev = sorted[i-1];
      const prevId = prev.snippet?.authorChannelId || prev.authorDetails?.channelId || prev.authorDetails?.displayName;
      const gap = new Date(s.publishedAt).getTime() - new Date(prev.snippet?.publishedAt || 0).getTime();
      if (prevId === author && gap >= 0 && gap <= 10000) {
        consecutive++;
        item.streak++;
        item.maxStreak = Math.max(item.maxStreak, item.streak);
      } else item.streak = 1;
    }
    users.set(author, item);
  }

  const total = messages.length;
  const consecutiveRate = pct(consecutive, total);
  const score = Math.min(100, Math.round(consecutiveRate * 0.7 + Math.min(30, (total / 1000) * 30)));

  return {
    users: [...users.values()]
      .map(u => ({...u, averageLength: u.count ? Math.round(u.totalLength/u.count*10)/10 : 0}))
      .sort((a,b)=>b.count-a.count),
    consecutiveCount: consecutive,
    normalCount: Math.max(0, total - consecutive),
    consecutiveRate,
    score
  };
}

app.get("/api/analyze", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({error:"チャンネル名を入力してください。"});

    const channelSearch = await yt(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(q)}`
    );
    const channel = channelSearch.items?.[0];
    if (!channel) return res.status(404).json({error:"チャンネルが見つかりませんでした。"});

    const channelId = channel.id.channelId;
    const videosData = await yt(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&type=video&maxResults=20`
    );
    const ids = videosData.items.map(x => x.id.videoId).filter(Boolean);

    let videos = [];
    let allComments = [];
    let liveMessages = [];
    if (ids.length) {
      const vd = await yt(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,liveStreamingDetails&id=${ids.join(",")}`);
      videos = vd.items || [];

      for (const v of videos.slice(0, 10)) {
        try {
          const cd = await yt(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${v.id}&maxResults=100&order=relevance`);
          for (const item of (cd.items || [])) {
            const s = item.snippet?.topLevelComment?.snippet;
            if (s) allComments.push({
              id:item.id, snippet:{...s, displayMessage:s.textDisplay, publishedAt:s.publishedAt},
              authorDetails:{displayName:s.authorDisplayName, channelId:s.authorChannelId}
            });
          }
        } catch (_) {}
        if (v.liveStreamingDetails?.activeLiveChatId) {
          try {
            const lc = await yt(`https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet,authorDetails&liveChatId=${v.liveStreamingDetails.activeLiveChatId}&maxResults=200`);
            liveMessages.push(...(lc.items || []));
          } catch (_) {}
        }
      }
    }

    const source = liveMessages.length ? liveMessages : allComments;
    const analysis = analyzeMessages(source);
    const minute = buildMinuteStats(source);
    const currentLive = videos.find(v => v.liveStreamingDetails?.activeLiveChatId);

    res.json({
      channel:{id:channelId, title:channel.snippet.title, thumbnail:channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url},
      videos: videos.map(v => ({
        id:v.id, title:v.snippet?.title, publishedAt:v.snippet?.publishedAt,
        thumbnail:v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url,
        views:Number(v.statistics?.viewCount||0), likes:Number(v.statistics?.likeCount||0),
        comments:Number(v.statistics?.commentCount||0),
        live:!!v.liveStreamingDetails?.activeLiveChatId,
        url:`https://www.youtube.com/watch?v=${v.id}`
      })),
      live: currentLive ? {
        id:currentLive.id, title:currentLive.snippet?.title,
        url:`https://www.youtube.com/watch?v=${currentLive.id}`
      } : null,
      totalComments: source.length,
      analysis,
      minute
    });
  } catch (e) {
    res.status(500).json({error:e.message});
  }
});

app.listen(PORT, () => console.log(`Chat Kasegi Checker: http://localhost:${PORT}`));