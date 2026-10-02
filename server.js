import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function apiKey(req) {
  return req.headers["x-youtube-api-key"] || process.env.YOUTUBE_API_KEY;
}

async function yt(endpoint, params, key) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries({ ...params, key }).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "YouTube API error");
  return data;
}

app.post("/api/ranking", async (req, res) => {
  try {
    const key = apiKey(req);
    if (!key) return res.status(400).json({error:"YouTube APIキーがありません。"});

    const name = String(req.body.channel || "").trim();
    const videoLimit = Math.min(Math.max(Number(req.body.videoLimit || 10), 1), 50);
    const commentsPerVideo = Math.min(Math.max(Number(req.body.commentsPerVideo || 100), 1), 100);

    if (!name) return res.status(400).json({error:"チャンネル名を入力してください。"});

    // チャンネル名からチャンネルを検索
    const channels = await yt("search", {
      part:"snippet", q:name, type:"channel", maxResults:5
    }, key);

    if (!channels.items?.length)
      return res.status(404).json({error:"チャンネルが見つかりませんでした。"});

    const channel = channels.items[0];
    const channelId = channel.id.channelId;

    // チャンネルの動画を取得（新しい順）
    const videos = await yt("search", {
      part:"snippet", channelId, type:"video",
      order:"date", maxResults:String(videoLimit)
    }, key);

    const counts = new Map();
    let totalComments = 0;
    let scannedVideos = 0;

    for (const item of (videos.items || [])) {
      const videoId = item.id.videoId;
      try {
        const comments = await yt("commentThreads", {
          part:"snippet",
          videoId,
          maxResults:String(commentsPerVideo),
          order:"relevance",
          textFormat:"plainText"
        }, key);

        scannedVideos++;
        for (const thread of (comments.items || [])) {
          const c = thread.snippet?.topLevelComment?.snippet;
          if (!c?.textOriginal) continue;

          // 大文字小文字・前後空白を揃えて集計
          const original = c.textOriginal.trim();
          const normalized = original.toLowerCase().replace(/\s+/g, " ");
          if (!normalized) continue;

          totalComments++;
          const old = counts.get(normalized);
          if (old) old.count++;
          else counts.set(normalized, { text: original, count: 1 });
        }
      } catch {
        // コメント取得不可（コメント無効など）はスキップ
      }
    }

    const ranking = [...counts.values()]
      .sort((a,b) => b.count - a.count || a.text.localeCompare(b.text))
      .slice(0, 50);

    res.json({
      channel: {
        id: channelId,
        title: channel.snippet.title,
        thumbnail: channel.snippet.thumbnails?.default?.url
      },
      scannedVideos,
      totalComments,
      ranking
    });
  } catch (e) {
    res.status(500).json({error:e.message});
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});