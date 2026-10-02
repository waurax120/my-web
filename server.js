require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   YouTube API
========================= */

async function youtube(endpoint, params = {}) {
  const url = new URL(
    "https://www.googleapis.com/youtube/v3/" + endpoint
  );

  url.searchParams.set("key", API_KEY);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "YouTube APIエラー"
    );
  }

  return data;
}

/* =========================
   チャンネル検索
========================= */

async function findChannel(query) {
  const data = await youtube("search", {
    part: "snippet",
    q: query,
    type: "channel",
    maxResults: 1
  });

  if (!data.items?.length) {
    throw new Error("チャンネルが見つかりませんでした。");
  }

  const item = data.items[0];

  return {
    id: item.snippet.channelId,
    title: item.snippet.channelTitle,
    thumbnail:
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.default?.url ||
      ""
  };
}

/* =========================
   チャンネル情報
========================= */

async function getChannel(channelId) {
  const data = await youtube("channels", {
    part: "snippet,contentDetails,statistics",
    id: channelId
  });

  if (!data.items?.length) {
    throw new Error("チャンネル情報を取得できませんでした。");
  }

  const c = data.items[0];

  return {
    id: c.id,
    title: c.snippet?.title || "",
    thumbnail:
      c.snippet?.thumbnails?.high?.url ||
      c.snippet?.thumbnails?.default?.url ||
      "",
    uploadsPlaylistId:
      c.contentDetails?.relatedPlaylists?.uploads || "",
    subscribers: Number(c.statistics?.subscriberCount || 0),
    views: Number(c.statistics?.viewCount || 0),
    videoCount: Number(c.statistics?.videoCount || 0)
  };
}

/* =========================
   期間
========================= */

function getCutoffDate(period) {
  const now = new Date();

  if (period === "今日") {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  if (period === "7日") {
    return new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    );
  }

  if (period === "30日") {
    return new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    );
  }

  return null;
}

/* =========================
   動画一覧
========================= */

async function getVideos(uploadsPlaylistId, period) {
  const videos = [];
  let pageToken = "";

  const cutoff = getCutoffDate(period);

  const maxPages =
    period === "今日"
      ? 3
      : period === "7日"
        ? 5
        : period === "30日"
          ? 10
          : 30;

  for (let page = 0; page < maxPages; page++) {
    const data = await youtube("playlistItems", {
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken
    });

    for (const item of data.items || []) {
      const publishedAt = item.snippet?.publishedAt;

      if (!publishedAt) continue;

      const date = new Date(publishedAt);

      if (cutoff && date < cutoff) {
        return videos;
      }

      videos.push({
        id: item.contentDetails?.videoId,
        title: item.snippet?.title || "",
        thumbnail:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          "",
        publishedAt,
        url:
          "https://www.youtube.com/watch?v=" +
          item.contentDetails?.videoId
      });
    }

    pageToken = data.nextPageToken || "";

    if (!pageToken) break;
  }

  return videos;
}

/* =========================
   コメント取得
========================= */

async function getComments(videoId, cutoff) {
  const comments = [];
  let pageToken = "";

  for (let page = 0; page < 10; page++) {
    const data = await youtube("commentThreads", {
      part: "snippet",
      videoId,
      maxResults: 100,
      order: "time",
      textFormat: "plainText",
      pageToken
    });

    for (const item of data.items || []) {
      const top = item.snippet?.topLevelComment;
      const snippet = top?.snippet;

      if (!snippet) continue;

      const publishedAt = snippet.publishedAt;

      if (!publishedAt) continue;

      const date = new Date(publishedAt);

      if (cutoff && date < cutoff) {
        return comments;
      }

      comments.push({
        id: top.id,
        videoId,

        author:
          snippet.authorDisplayName || "Unknown",

        authorChannelId:
          snippet.authorChannelId?.value || "",

        text:
          snippet.textDisplay || "",

        publishedAt,

        likeCount:
          Number(snippet.likeCount || 0),

        updatedAt:
          snippet.updatedAt || publishedAt
      });
    }

    pageToken = data.nextPageToken || "";

    if (!pageToken) break;
  }

  return comments;
}

/* =========================
   コメント分析
========================= */

function analyzeComments(comments) {
  const users = new Map();

  let consecutiveCount = 0;
  let previous = null;

  const minuteMap = new Map();

  for (const comment of comments) {
    const name = comment.author || "Unknown";

    if (!users.has(name)) {
      users.set(name, {
        name,
        count: 0,
        maxStreak: 0,
        currentStreak: 0,
        totalLength: 0,
        videos: new Set(),
        history: []
      });
    }

    const user = users.get(name);

    user.count++;

    user.totalLength += comment.text.length;

    if (comment.videoId) {
      user.videos.add(comment.videoId);
    }

    user.history.push({
      text: comment.text,
      videoId: comment.videoId,
      publishedAt: comment.publishedAt,
      likeCount: comment.likeCount
    });

    const currentTime =
      new Date(comment.publishedAt).getTime();

    if (
      previous &&
      previous.author === name &&
      currentTime - previous.time <= 10 * 1000
    ) {
      consecutiveCount++;

      user.currentStreak++;

      user.maxStreak = Math.max(
        user.maxStreak,
        user.currentStreak
      );
    } else {
      user.currentStreak = 1;
    }

    previous = {
      author: name,
      time: currentTime
    };

    const minute = new Date(comment.publishedAt);

    minute.setSeconds(0, 0);

    const key = minute.toISOString();

    minuteMap.set(
      key,
      (minuteMap.get(key) || 0) + 1
    );
  }

  const userList = [...users.values()]
    .map(user => ({
      name: user.name,
      count: user.count,
      maxStreak: user.maxStreak,

      averageLength: user.count
        ? Math.round(
            user.totalLength / user.count
          )
        : 0,

      videoCount: user.videos.size,

      history: user.history
    }))
    .sort(
      (a, b) => b.count - a.count
    );

  const normalCount = Math.max(
    0,
    comments.length - consecutiveCount
  );

  const consecutiveRate =
    comments.length
      ? Math.round(
          (consecutiveCount /
            comments.length) *
            100
        )
      : 0;

  /*
    チャット稼ぎ度
    ※このサイト独自の指標
  */

  const score = Math.min(
    100,

    Math.round(
      consecutiveRate * 0.7 +
        Math.min(
          30,
          consecutiveCount / 10
        )
    )
  );

  const minuteEntries =
    [...minuteMap.entries()]
      .sort(
        (a, b) =>
          new Date(a[0]) -
          new Date(b[0])
      );

  const minuteLabels =
    minuteEntries.map(([key]) => {
      const d = new Date(key);

      return d.toLocaleTimeString(
        "ja-JP",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );
    });

  const minuteValues =
    minuteEntries.map(
      ([, value]) => value
    );

  const average =
    minuteValues.length
      ? Math.round(
          (minuteValues.reduce(
            (a, b) => a + b,
            0
          ) /
            minuteValues.length) *
            10
        ) / 10
      : 0;

  const peak =
    minuteValues.length
      ? Math.max(...minuteValues)
      : 0;

  const peakIndex =
    minuteValues.length
      ? minuteValues.indexOf(peak)
      : -1;

  return {
    users: userList,

    consecutiveCount,

    normalCount,

    consecutiveRate,

    score,

    minute: {
      labels: minuteLabels,
      values: minuteValues,
      average,
      peak,
      peakIndex
    }
  };
}

/* =========================
   LIVEチャット取得
========================= */

async function getLiveChat(liveChatId) {
  const comments = [];

  let pageToken = "";

  for (let page = 0; page < 10; page++) {
    const data = await youtube(
      "liveChat/messages",
      {
        liveChatId,

        part:
          "snippet,authorDetails",

        maxResults: 2000,

        pageToken
      }
    );

    for (const item of data.items || []) {
      const snippet =
        item.snippet || {};

      const author =
        item.authorDetails || {};

      comments.push({
        id: item.id,

        videoId: "",

        author:
          author.displayName ||
          "Unknown",

        authorChannelId:
          author.channelId || "",

        text:
          snippet.displayMessage ||
          "",

        publishedAt:
          snippet.publishedAt ||
          new Date().toISOString(),

        likeCount: 0
      });
    }

    pageToken =
      data.nextPageToken || "";

    if (!pageToken) break;
  }

  return comments;
}

/* =========================
   現在LIVE中か確認
========================= */

async function getCurrentLive(channelId) {
  const data = await youtube("search", {
    part: "snippet",

    channelId,

    eventType: "live",

    type: "video",

    maxResults: 1
  });

  if (!data.items?.length) {
    return null;
  }

  const item = data.items[0];

  const videoId =
    item.id?.videoId;

  if (!videoId) {
    return null;
  }

  const videoData =
    await youtube("videos", {
      part:
        "snippet,statistics,liveStreamingDetails",

      id: videoId
    });

  const video =
    videoData.items?.[0];

  if (!video) {
    return null;
  }

  return {
    id: videoId,

    title:
      video.snippet?.title ||
      item.snippet?.title ||
      "",

    thumbnail:
      video.snippet?.thumbnails?.high?.url ||
      video.snippet?.thumbnails?.medium?.url ||
      "",

    url:
      "https://www.youtube.com/watch?v=" +
      videoId,

    activeLiveChatId:
      video.liveStreamingDetails
        ?.activeLiveChatId ||
      null,

    views:
      Number(
        video.statistics?.viewCount || 0
      ),

    likes:
      Number(
        video.statistics?.likeCount || 0
      ),

    comments:
      Number(
        video.statistics?.commentCount || 0
      )
  };
}

/* =========================
   分析API
========================= */

app.get(
  "/api/analyze",
  async (req, res) => {
    try {
      if (!API_KEY) {
        return res.status(500).json({
          error:
            "YOUTUBE_API_KEY が設定されていません。"
        });
      }

      const q =
        String(
          req.query.q || ""
        ).trim();

      const period =
        String(
          req.query.period ||
            "今日"
        );

      if (!q) {
        return res.status(400).json({
          error:
            "チャンネル名を入力してください。"
        });
      }

      /* チャンネル検索 */

      const channel =
        await findChannel(q);

      /* チャンネル詳細 */

      const channelInfo =
        await getChannel(
          channel.id
        );

      /* LIVE確認 */

      const currentLive =
        await getCurrentLive(
          channel.id
        );

      let source = [];

      /* =========================
         LIVE中ならライブチャット
      ========================= */

      if (
        currentLive &&
        currentLive.activeLiveChatId
      ) {
        source =
          await getLiveChat(
            currentLive.activeLiveChatId
          );
      }

      /* =========================
         通常動画コメント
      ========================= */

      else {
        const videos =
          await getVideos(
            channelInfo.uploadsPlaylistId,
            period
          );

        const targetVideos =
          videos.slice(
            0,

            period === "今日"
              ? 10
              : period === "7日"
                ? 20
                : period === "30日"
                  ? 40
                  : 80
          );

        const cutoff =
          getCutoffDate(
            period
          );

        for (
          const video of targetVideos
        ) {
          try {
            const comments =
              await getComments(
                video.id,
                cutoff
              );

            source.push(
              ...comments
            );
          } catch (error) {
            console.log(
              "コメント取得スキップ:",
              video.id,
              error.message
            );
          }
        }
      }

      /* =========================
         期間フィルター
      ========================= */

      const cutoff =
        getCutoffDate(
          period
        );

      if (cutoff) {
        source =
          source.filter(
            comment => {
              const date =
                new Date(
                  comment.publishedAt
                );

              return date >= cutoff;
            }
          );
      }

      /* 古い順 */

      source.sort(
        (a, b) =>
          new Date(a.publishedAt) -
          new Date(b.publishedAt)
      );

      /* 分析 */

      const analysis =
        analyzeComments(
          source
        );

      /* LIVE情報 */

      const live =
        currentLive
          ? {
              id:
                currentLive.id,

              title:
                currentLive.title,

              thumbnail:
                currentLive.thumbnail,

              url:
                currentLive.url,

              views:
                currentLive.views,

              likes:
                currentLive.likes,

              comments:
                currentLive.comments
            }
          : null;

      /* =========================
         JSON
      ========================= */

      res.json({
        channel: {
          id:
            channelInfo.id,

          title:
            channelInfo.title,

          thumbnail:
            channelInfo.thumbnail,

          subscribers:
            channelInfo.subscribers,

          views:
            channelInfo.views,

          videoCount:
            channelInfo.videoCount
        },

        period,

        live,

        totalComments:
          source.length,

        analysis: {
          users:
            analysis.users,

          consecutiveCount:
            analysis.consecutiveCount,

          normalCount:
            analysis.normalCount,

          consecutiveRate:
            analysis.consecutiveRate,

          score:
            analysis.score
        },

        minute:
          analysis.minute
      });

    } catch (error) {
      console.error(
        "ANALYZE ERROR:",
        error
      );

      res.status(500).json({
        error:
          error.message ||
          "分析中にエラーが発生しました。"
      });
    }
  }
);

/* =========================
   サーバー起動
========================= */

app.listen(
  PORT,
  () => {
    console.log(
      `Chat Kasegi Checker running on port ${PORT}`
    );
  }
);
