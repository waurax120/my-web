require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;

if (!API_KEY) {
  console.warn("WARNING: YOUTUBE_API_KEY is not set.");
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


/* =========================================================
   YouTube API
========================================================= */

async function youtube(endpoint, params = {}) {
  const url = new URL(
    `https://www.googleapis.com/youtube/v3/${endpoint}`
  );

  Object.entries({
    ...params,
    key: API_KEY
  }).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      "YouTube API request failed";

    throw new Error(message);
  }

  return data;
}


/* =========================================================
   共通
========================================================= */

function getPeriodCutoff(period) {
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


function safeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
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
      item.snippet?.title ||
      "Unknown",

    thumbnail:
      item.snippet?.thumbnails?.high?.url ||
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url ||
      "",

    subscribers:
      safeNumber(
        item.statistics?.subscriberCount
      ),

    views:
      safeNumber(
        item.statistics?.viewCount
      ),

    videoCount:
      safeNumber(
        item.statistics?.videoCount
      ),

    uploadsPlaylistId:
      item.contentDetails?.relatedPlaylists?.uploads ||
      null
  };
}


/* =========================================================
   動画一覧
========================================================= */

async function getChannelVideos(
  uploadsPlaylistId,
  period
) {
  const cutoff = getPeriodCutoff(period);

  const result = [];

  let pageToken = "";

  /*
   * 期間に応じて取得数を調整
   */
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
    const data = await youtube(
      "playlistItems",
      {
        part: "snippet,contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken
      }
    );

    for (const item of data.items || []) {
      const snippet = item.snippet || {};

      const publishedAt =
        snippet.publishedAt ||
        item.contentDetails?.videoPublishedAt ||
        "";

      const time =
        new Date(publishedAt).getTime();

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

      result.push({
        id: videoId,

        title:
          snippet.title ||
          "Untitled",

        thumbnail:
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          "",

        publishedAt,

        url:
          `https://www.youtube.com/watch?v=${videoId}`,

        type:
          snippet.liveBroadcastContent === "live"
            ? "live"
            : "video"
      });
    }

    pageToken =
      data.nextPageToken || "";

    if (!pageToken) {
      break;
    }

    /*
     * 古い順ではないので、
     * 期間外になった後も少し取得する。
     */
  }

  return result;
}


/* =========================================================
   動画詳細
========================================================= */

async function getVideos(videoIds) {
  const result = [];

  for (
    let i = 0;
    i < videoIds.length;
    i += 50
  ) {
    const ids =
      videoIds
        .slice(i, i + 50)
        .join(",");

    if (!ids) {
      continue;
    }

    const data = await youtube(
      "videos",
      {
        part:
          "snippet,statistics,liveStreamingDetails",
        id: ids
      }
    );

    for (const item of data.items || []) {
      result.push({
        id: item.id,

        title:
          item.snippet?.title ||
          "Untitled",

        thumbnail:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          "",

        publishedAt:
          item.snippet?.publishedAt ||
          "",

        views:
          safeNumber(
            item.statistics?.viewCount
          ),

        likes:
          safeNumber(
            item.statistics?.likeCount
          ),

        comments:
          safeNumber(
            item.statistics?.commentCount
          ),

        liveBroadcastContent:
          item.snippet?.liveBroadcastContent ||
          "none",

        activeLiveChatId:
          item.liveStreamingDetails
            ?.activeLiveChatId ||
          null,

        concurrentViewers:
          safeNumber(
            item.liveStreamingDetails
              ?.concurrentViewers
          )
      });
    }
  }

  return result;
}


/* =========================================================
   コメント取得
========================================================= */

async function getVideoComments(videoId) {
  const comments = [];

  let pageToken = "";

  /*
   * 1動画につき最大10ページ
   */
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
        item.snippet?.topLevelComment
          ?.snippet;

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
          safeNumber(
            snippet.likeCount
          )
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

  let consecutiveCount = 0;

  let previous = null;

  const minuteMap = new Map();

  for (const comment of comments) {
    const name =
      comment.author ||
      "Unknown";

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

    const user =
      users.get(name);

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

    /*
     * 同じユーザーが10秒以内に
     * 続けて投稿した場合を連投扱い
     */
    if (
      previous &&
      previous.author === name &&
      currentTime - previous.time <=
        10 * 1000
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

    /*
     * 1分ごとの件数
     */
    const minute =
      new Date(
        comment.publishedAt
      );

    minute.setSeconds(0, 0);

    const minuteKey =
      minute.toISOString();

    minuteMap.set(
      minuteKey,
      (minuteMap.get(minuteKey) || 0) + 1
    );
  }

  const userRanking =
    [...users.values()]
      .map(user => ({
        name: user.name,

        count: user.count,

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
          (consecutiveCount /
            comments.length) *
            100
        )
      : 0;

  /*
   * 分ごとのグラフ
   */
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
        const date =
          new Date(key);

        return date.toLocaleTimeString(
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
      ([, value]) => value
    );

  const average =
    minuteValues.length
      ? Math.round(
          (
            minuteValues.reduce(
              (a, b) => a + b,
              0
            ) /
            minuteValues.length
          ) * 10
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

  /*
   * チャット急増
   */
  const spikes = [];

  if (minuteValues.length >= 2) {
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
  }

  /*
   * 独自チャット稼ぎ度
   *
   * 連投率とコメント数を元にした
   * サイト独自の参考値。
   */
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
      volumeScore +
      streakScore
    );

  return {
    users: userRanking,

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
   LIVE中の配信を取得
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
    id: video.id,

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

  /*
   * API仕様上 maxResults は
   * 200〜2000。
   */
  for (
    let page = 0;
    page < 10;
    page++
  ) {
    const data =
      await youtube(
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

    for (
      const item of
        data.items || []
    ) {
      const snippet =
        item.snippet || {};

      const author =
        item.authorDetails || {};

      /*
       * テキストチャット以外の
       * イベントも存在するため、
       * displayMessage があるものを
       * 主な分析対象にする。
       */
      const text =
        snippet.displayMessage ||
        snippet.textMessageDetails
          ?.messageText ||
        "";

      messages.push({
        id:
          item.id,

        videoId:
          "",

        author:
          author.displayName ||
          "Unknown",

        authorChannelId:
          author.channelId ||
          "",

        text,

        publishedAt:
          snippet.publishedAt ||
          new Date().toISOString(),

        likeCount: 0,

        type:
          snippet.type ||
          "textMessageEvent"
      });
    }

    pageToken =
      data.nextPageToken ||
      "";

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

    /*
     * 10秒以内の連続投稿
     */
    if (
      previous &&
      previous.author === name &&
      currentTime -
        previous.time <=
        10 * 1000
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

    /*
     * 1分ごとのチャット数
     */
    const minute =
      new Date(
        message.publishedAt
      );

    minute.setSeconds(0, 0);

    const minuteKey =
      minute.toISOString();

    minuteMap.set(
      minuteKey,
      (minuteMap.get(minuteKey) || 0) + 1
    );

    /*
     * 単語ランキング
     *
     * 日本語は空白区切りがないことが
     * 多いので、簡易的な文字列分割も行う。
     */
    const cleanText =
      String(
        message.text || ""
      )
        .toLowerCase()
        .replace(
          /[「」『』！？。、,.!?()[\]{}<>:;'"`]/g,
          " "
        )
        .trim();

    const splitWords =
      cleanText
        .split(/\s+/)
        .filter(
          word =>
            word.length >= 2 &&
            word.length <= 20
        );

    for (
      const word of
        splitWords
    ) {
      words.set(
        word,
        (words.get(word) || 0) + 1
      );
    }

    /*
     * 日本語など空白のない文章用
     * 2文字単位の簡易集計
     */
    const compact =
      cleanText.replace(
        /\s+/g,
        ""
      );

    if (
      compact.length >= 2 &&
      compact.length <= 100
    ) {
      for (
        let i = 0;
        i < compact.length - 1;
        i++
      ) {
        const twoChars =
          compact.slice(
            i,
            i + 2
          );

        if (
          /[^\x00-\x7F]/.test(
            twoChars
          )
        ) {
          words.set(
            twoChars,
            (words.get(twoChars) || 0) + 1
          );
        }
      }
    }
  }

  /*
   * ユーザーランキング
   */
  const userRanking =
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

  /*
   * 単語ランキング
   */
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

  /*
   * 連投率
   */
  const consecutiveRate =
    messages.length
      ? Math.round(
          (
            consecutiveCount /
            messages.length
          ) * 100
        )
      : 0;

  /*
   * 分ごとのデータ
   */
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
          (
            minuteValues.reduce(
              (a, b) =>
                a + b,
              0
            ) /
            minuteValues.length
          ) * 10
        ) / 10
      : 0;

  const peak =
    minuteValues.length
      ? Math.max(
          ...minuteValues
        )
      : 0;

  const peakI

const peakIndex =
  minuteValues.length
    ? minuteValues.indexOf(peak)
    : -1;

const peakTime =
  peakIndex >= 0
    ? minuteLabels[peakIndex]
    : null;
