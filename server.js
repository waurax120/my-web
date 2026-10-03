require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


/* =========================================================
   YouTube API
========================================================= */

async function youtube(endpoint, params = {}) {
  if (!API_KEY) {
    throw new Error("YOUTUBE_API_KEY が設定されていません。");
  }

  const url = new URL(
    `https://www.googleapis.com/youtube/v3/${endpoint}`
  );

  const allParams = {
    ...params,
    key: API_KEY
  };

  for (const [key, value] of Object.entries(allParams)) {
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
      data?.error?.message || "YouTube API error"
    );
  }

  return data;
}


/* =========================================================
   共通関数
========================================================= */

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}


function cutoffFor(period) {
  const now = Date.now();

  if (period === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  if (period === "7d") {
    return now - 7 * 24 * 60 * 60 * 1000;
  }

  if (period === "30d") {
    return now - 30 * 24 * 60 * 60 * 1000;
  }

  return 0;
}


/* =========================================================
   チャンネル検索
========================================================= */

async function searchChannel(query) {
  const data = await youtube("search", {
    part: "snippet",
    q: query,
    type: "channel",
    maxResults: 1
  });

  const item = data.items?.[0];

  if (!item) {
    return null;
  }

  return item.snippet.channelId;
}


/* =========================================================
   チャンネル情報
========================================================= */

async function getChannel(channelId) {
  const data = await youtube("channels", {
    part: "snippet,statistics,contentDetails",
    id: channelId
  });

  const item = data.items?.[0];

  if (!item) {
    return null;
  }

  return {
    id: item.id,

    title:
      item.snippet?.title || "Unknown",

    thumbnail:
      item.snippet?.thumbnails?.high?.url ||
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url ||
      "",

    subscribers:
      number(item.statistics?.subscriberCount),

    views:
      number(item.statistics?.viewCount),

    videoCount:
      number(item.statistics?.videoCount),

    uploadsPlaylistId:
      item.contentDetails?.relatedPlaylists?.uploads ||
      null
  };
}


/* =========================================================
   チャンネル動画一覧
========================================================= */

async function getChannelVideos(playlistId, period) {
  if (!playlistId) {
    return [];
  }

  const cutoff = cutoffFor(period);

  const videos = [];

  let pageToken = "";

  let maxPages = 1;

  if (period === "today") {
    maxPages = 2;
  } else if (period === "7d") {
    maxPages = 3;
  } else if (period === "30d") {
    maxPages = 5;
  } else {
    maxPages = 10;
  }

  for (let page = 0; page < maxPages; page++) {
    const data = await youtube("playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: 50,
      pageToken
    });

    for (const item of data.items || []) {
      const snippet = item.snippet || {};

      const publishedAt =
        snippet.publishedAt ||
        item.contentDetails?.videoPublishedAt ||
        "";

      const time = new Date(publishedAt).getTime();

      if (
        cutoff > 0 &&
        Number.isFinite(time) &&
        time < cutoff
      ) {
        continue;
      }

      const videoId =
        item.contentDetails?.videoId;

      if (!videoId) {
        continue;
      }

      videos.push({
        id: videoId,

        title:
          snippet.title || "Untitled",

        thumbnail:
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          "",

        publishedAt,

        url:
          `https://www.youtube.com/watch?v=${videoId}`
      });
    }

    pageToken =
      data.nextPageToken || "";

    if (!pageToken) {
      break;
    }
  }

  return videos;
}


/* =========================================================
   動画詳細
========================================================= */

async function getVideos(ids) {
  const result = [];

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);

    if (!chunk.length) {
      continue;
    }

    const data = await youtube("videos", {
      part:
        "snippet,statistics,liveStreamingDetails",

      id:
        chunk.join(",")
    });

    for (const item of data.items || []) {
      result.push({
        id: item.id,

        title:
          item.snippet?.title || "Untitled",

        thumbnail:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          "",

        publishedAt:
          item.snippet?.publishedAt || "",

        views:
          number(item.statistics?.viewCount),

        likes:
          number(item.statistics?.likeCount),

        comments:
          number(item.statistics?.commentCount),

        liveBroadcastContent:
          item.snippet?.liveBroadcastContent ||
          "none",

        activeLiveChatId:
          item.liveStreamingDetails
            ?.activeLiveChatId ||
          null,

        concurrentViewers:
          number(
            item.liveStreamingDetails
              ?.concurrentViewers
          )
      });
    }
  }

  return result;
}


/* =========================================================
   通常動画のコメント取得
========================================================= */

async function getComments(videoId) {
  const comments = [];

  let pageToken = "";

  for (let page = 0; page < 10; page++) {
    const data = await youtube(
      "commentThreads",
      {
        part: "snippet",
        videoId,
        maxResults: 100,
        order: "time",
        textFormat: "plainText",
        pageToken
      }
    );

    for (const item of data.items || []) {
      const snippet =
        item.snippet?.topLevelComment?.snippet;

      if (!snippet) {
        continue;
      }

      comments.push({
        id:
          item.snippet?.topLevelComment?.id ||
          item.id,

        videoId,

        author:
          snippet.authorDisplayName ||
          "Unknown",

        authorChannelId:
          snippet.authorChannelId?.value ||
          "",

        text:
          snippet.textDisplay ||
          "",

        publishedAt:
          snippet.publishedAt ||
          new Date().toISOString(),

        likeCount:
          number(snippet.likeCount)
      });
    }

    pageToken =
      data.nextPageToken || "";

    if (!pageToken) {
      break;
    }
  }

  return comments;
}


/* =========================================================
   通常コメント分析
========================================================= */

function analyzeComments(comments) {
  const users = new Map();
  const minuteMap = new Map();

  let consecutiveCount = 0;
  let previous = null;

  for (const comment of comments) {
    const name =
      comment.author || "Unknown";

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

    user.totalLength +=
      String(comment.text || "").length;

    user.videos.add(
      comment.videoId
    );

    user.history.push({
      text:
        comment.text || "",

      publishedAt:
        comment.publishedAt,

      videoId:
        comment.videoId
    });

    const currentTime =
      new Date(
        comment.publishedAt
      ).getTime();

    if (
      previous &&
      previous.author === name &&
      currentTime - previous.time <= 10000
    ) {
      consecutiveCount++;

      user.currentStreak++;

      user.maxStreak =
        Math.max(
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

    const minute =
      new Date(comment.publishedAt);

    minute.setSeconds(0, 0);

    const key =
      minute.toISOString();

    minuteMap.set(
      key,
      (minuteMap.get(key) || 0) + 1
    );
  }

  const usersRanking =
    [...users.values()]
      .map(user => ({
        name:
          user.name,

        count:
          user.count,

        maxStreak:
          user.maxStreak,

        averageLength:
          user.count
            ? Math.round(
                user.totalLength /
                user.count
              )
            : 0,

        videoCount:
          user.videos.size,

        history:
          user.history
      }))
      .sort(
        (a, b) =>
          b.count - a.count
      );

  const consecutiveRate =
    comments.length
      ? Math.round(
          consecutiveCount /
          comments.length *
          100
        )
      : 0;

  const minuteEntries =
    [...minuteMap.entries()]
      .sort(
        (a, b) =>
          new Date(a[0]) -
          new Date(b[0])
      );

  const minuteLabels =
    minuteEntries.map(
      ([key]) => {
        const d =
          new Date(key);

        return d.toLocaleTimeString(
          "ja-JP",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        );
      }
    );

  const minuteValues =
    minuteEntries.map(
      ([, value]) =>
        value
    );

  const average =
    minuteValues.length
      ? Math.round(
          minuteValues.reduce(
            (a, b) => a + b,
            0
          ) /
          minuteValues.length *
          10
        ) / 10
      : 0;

  const peak =
    minuteValues.length
      ? Math.max(
          ...minuteValues
        )
      : 0;

  const peakIndex =
    minuteValues.length
      ? minuteValues.indexOf(peak)
      : -1;

  const peakTime =
    peakIndex >= 0
      ? minuteLabels[peakIndex]
      : null;

  const spikes = [];

  for (
    let i = 1;
    i < minuteValues.length;
    i++
  ) {
    const before =
      minuteValues[i - 1];

    const current =
      minuteValues[i];

    if (
      current >= 10 &&
      current >= before * 2
    ) {
      spikes.push({
        time:
          minuteLabels[i],

        count:
          current,

        previous:
          before
      });
    }
  }

  const volumeScore =
    Math.min(
      50,
      Math.round(
        comments.length / 10
      )
    );

  const streakScore =
    Math.min(
      50,
      Math.round(
        consecutiveRate / 2
      )
    );

  const score =
    Math.min(
      100,
      volumeScore + streakScore
    );

  return {
    users:
      usersRanking,

    total:
      comments.length,

    consecutiveCount,

    normalCount:
      Math.max(
        0,
        comments.length -
        consecutiveCount
      ),

    consecutiveRate,

    score,

    minute: {
      labels:
        minuteLabels,

      values:
        minuteValues,

      average,

      peak,

      peakTime,

      peakIndex
    },

    spikes
  };
}


/* =========================================================
   現在LIVE中か確認
========================================================= */

async function getCurrentLive(channelId) {
  const data = await youtube(
    "search",
    {
      part: "snippet",

      channelId,

      eventType: "live",

      type: "video",

      maxResults: 1
    }
  );

  const item =
    data.items?.[0];

  if (!item) {
    return null;
  }

  const videoId =
    item.id?.videoId;

  if (!videoId) {
    return null;
  }

  const videos =
    await getVideos([
      videoId
    ]);

  const video =
    videos[0];

  if (!video) {
    return null;
  }

  return {
    id:
      video.id,

    title:
      video.title,

    thumbnail:
      video.thumbnail,

    url:
      `https://www.youtube.com/watch?v=${video.id}`,

    views:
      video.views,

    likes:
      video.likes,

    comments:
      video.comments,

    activeLiveChatId:
      video.activeLiveChatId,

    concurrentViewers:
      video.concurrentViewers
  };
}


/* =========================================================
   LIVEチャット取得
========================================================= */

async function getLiveChat(liveChatId) {
  const messages = [];

  let pageToken = "";

  for (let page = 0; page < 10; page++) {
    const data = await youtube(
      "liveChat/messages",
      {
        liveChatId,

        part:
          "snippet,authorDetails",

        maxResults:
          2000,

        pageToken
      }
    );

    for (const item of data.items || []) {
      const snippet =
        item.snippet || {};

      const author =
        item.authorDetails || {};

      const text =
        snippet.displayMessage ||
        snippet.textMessageDetails
          ?.messageText ||
        "";

      if (!text) {
        continue;
      }

      messages.push({
        id:
          item.id,

        author:
          author.displayName ||
          "Unknown",

        authorChannelId:
          author.channelId ||
          "",

        text,

        publishedAt:
          snippet.publishedAt ||
          new Date().toISOString()
      });
    }

    pageToken =
      data.nextPageToken || "";

    if (!pageToken) {
      break;
    }
  }

  return messages;
}


/* =========================================================
   LIVEチャット分析
========================================================= */

function analyzeLiveChat(messages) {
  const users = new Map();
  const words = new Map();
  const minuteMap = new Map();

  let consecutiveCount = 0;
  let previous = null;

  for (const message of messages) {
    const name =
      message.author ||
      "Unknown";

    if (!users.has(name)) {
      users.set(name, {
        name,
        count: 0,
        maxStreak: 0,
        currentStreak: 0,
        totalLength: 0,
        history: []
      });
    }

    const user =
      users.get(name);

    user.count++;

    user.totalLength +=
      String(
        message.text || ""
      ).length;

    user.history.push({
      text:
        message.text || "",

      publishedAt:
        message.publishedAt
    });

    const currentTime =
      new Date(
        message.publishedAt
      ).getTime();

    if (
      previous &&
      previous.author === name &&
      currentTime -
        previous.time <=
        10000
    ) {
      consecutiveCount++;

      user.currentStreak++;

      user.maxStreak =
        Math.max(
          user.maxStreak,
          user.currentStreak
        );
    } else {
      user.currentStreak = 1;
    }

    previous = {
      author:
        name,

      time:
        currentTime
    };

    const minute =
      new Date(
        message.publishedAt
      );

    minute.setSeconds(0, 0);

    const key =
      minute.toISOString();

    minuteMap.set(
      key,
      (minuteMap.get(key) || 0) + 1
    );

    const cleanText =
      String(
        message.text || ""
      )
        .toLowerCase()
        .replace(
          /[「」『』！？。、,.!?()[\]{}<>:;'"`]/g,
          " "
        );

    const wordsInMessage =
      cleanText
        .split(/\s+/)
        .filter(
          word =>
            word.length >= 2 &&
            word.length <= 20
        );

    for (
      const word of wordsInMessage
    ) {
      words.set(
        word,
        (words.get(word) || 0) + 1
      );
    }
  }

  const usersRanking =
    [...users.values()]
      .map(user => ({
        name:
          user.name,

        count:
          user.count,

        maxStreak:
          user.maxStreak,

        averageLength:
          user.count
            ? Math.round(
                user.totalLength /
                user.count
              )
            : 0,

        history:
          user.history
      }))
      .sort(
        (a, b) =>
          b.count - a.count
      );

  const wordRanking =
    [...words.entries()]
      .map(
        ([word, count]) => ({
          word,
          count
        })
      )
      .sort(
        (a, b) =>
          b.count - a.count
      )
      .slice(0, 50);

  const consecutiveRate =
    messages.length
      ? Math.round(
          consecutiveCount /
          messages.length *
          100
        )
      : 0;

  const minuteEntries =
    [...minuteMap.entries()]
      .sort(
        (a, b) =>
          new Date(a[0]) -
          new Date(b[0])
      );

  const minuteLabels =
    minuteEntries.map(
      ([key]) => {
        const d =
          new Date(key);

        return d.toLocaleTimeString(
          "ja-JP",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        );
      }
    );

  const minuteValues =
    minuteEntries.map(
      ([, value]) =>
        value
    );

  const average =
    minuteValues.length
      ? Math.round(
          minuteValues.reduce(
            (a, b) => a + b,
            0
          ) /
          minuteValues.length *
          10
        ) / 10
      : 0;

  const peak =
    minuteValues.length
      ? Math.max(
          ...minuteValues
        )
      : 0;

  const peakIndex =
    minuteValues.length
      ? minuteValues.indexOf(peak)
      : -1;

  const peakTime =
    peakIndex >= 0
      ? minuteLabels[peakIndex]
      : null;

  const spikes = [];

  for (
    let i = 1;
    i < minuteValues.length;
    i++
  ) {
    const before =
      minuteValues[i - 1];

    const current =
      minuteValues[i];

    if (
      current >= 10 &&
      current >= before * 2
    ) {
      spikes.push({
        time:
          minuteLabels[i],

        count:
          current,

        previous:
          before
      });
    }
  }

  return {
    total:
      messages.length,

    consecutiveCount,

    consecutiveRate,

    users:
      usersRanking,

    wordRanking,

    minute: {
      labels:
        minuteLabels,

      values:
        minuteValues,

      average,

      peak,

      peakTime,

      peakIndex
    },

    spikes
  };
}


/* =========================================================
   メイン分析API
========================================================= */

app.get(
  "/api/analyze",
  async (req, res) => {
    try {
      const query =
        String(
          req.query.q || ""
        ).trim();

      const period =
        String(
          req.query.period || "all"
        );

      if (!query) {
        return res.status(400).json({
          error:
            "チャンネル名を入力してください。"
        });
      }

      if (!API_KEY) {
        return res.status(500).json({
          error:
            "YOUTUBE_API_KEY が設定されていません。"
        });
      }

      const channelId =
        await searchChannel(query);

      if (!channelId) {
        return res.status(404).json({
          error:
            "チャンネルが見つかりませんでした。"
        });
      }

      const channel =
        await getChannel(channelId);

      if (!channel) {
        return res.status(404).json({
          error:
            "チャンネル情報を取得できませんでした。"
        });
      }


      /* =====================================================
         LIVE分析
      ===================================================== */

      const live =
        await getCurrentLive(
          channelId
        );

      if (
        live &&
        live.active
