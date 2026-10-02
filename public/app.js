let DATA = null;
let currentChannel = "";
let period = "今日";
let rankingMode = "comments";

let minuteChart = null;
let pieChart = null;

document.addEventListener("DOMContentLoaded", () => {
  setupSearch();
  setupPeriod();
  setupNavigation();
  setupRanking();
});

/* =========================
   検索
========================= */

function setupSearch() {
  const input = document.getElementById("channelInput");
  const button = document.getElementById("analyzeBtn");

  if (!input || !button) {
    console.error("検索欄または分析ボタンがありません");
    return;
  }

  button.addEventListener("click", analyze);

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      analyze();
    }
  });
}

/* =========================
   分析
========================= */

async function analyze() {
  const input = document.getElementById("channelInput");
  const error = document.getElementById("error");

  const query = input.value.trim();

  if (!query) {
    error.textContent = "チャンネル名を入力してください。";
    return;
  }

  error.textContent = "";
  currentChannel = query;

  showScreen("analysis");

  document.getElementById("channelCard").innerHTML =
    `<div class="muted">🔄 ${esc(query)} を分析中...</div>`;

  try {
    const url =
      "/api/analyze?q=" +
      encodeURIComponent(query) +
      "&period=" +
      encodeURIComponent(period);

    console.log("API:", url);

    const response = await fetch(url);
    const data = await response.json();

    console.log("API response:", data);

    if (!response.ok) {
      throw new Error(
        data.error || "分析に失敗しました。"
      );
    }

    DATA = data;

    renderChannel();
    renderScore();
    renderCharts();
    renderStats();
    renderSpikes();
    renderUsers();
    renderRanking();
    renderLive();

  } catch (e) {
    console.error(e);

    showScreen("home");

    error.textContent =
      "❌ " + (e.message || "分析に失敗しました。");
  }
}

/* =========================
   チャンネル情報
========================= */

function renderChannel() {
  const channel = DATA.channel;

  const card = document.getElementById("channelCard");

  card.innerHTML = `
    <div class="channel-info">
      <img
        src="${esc(channel.thumbnail)}"
        class="channel-thumb"
      >

      <div>
        <h2>${esc(channel.title)}</h2>

        ${
          DATA.live
            ? `<div class="live-badge">🔴 LIVE中</div>`
            : ""
        }

        <p class="muted">
          登録者 ${number(channel.subscribers)}
          人
        </p>

        <p class="muted">
          総再生数 ${number(channel.views)}
        </p>

        <p class="muted">
          動画数 ${number(channel.videoCount)}
        </p>

        <a
          href="https://www.youtube.com/channel/${channel.id}"
          target="_blank"
        >
          YouTubeチャンネルを見る →
        </a>
      </div>
    </div>
  `;
}

/* =========================
   LIVE
========================= */

function renderLive() {
  const home = document.getElementById("liveHome");

  if (!home) return;

  if (!DATA.live) {
    home.innerHTML =
      "現在LIVEしていません。";
    return;
  }

  home.innerHTML = `
    <div>
      <img
        src="${esc(DATA.live.thumbnail)}"
        style="width:100%;border-radius:12px;"
      >

      <h3>${esc(DATA.live.title)}</h3>

      <p>👀 ${number(DATA.live.views)}</p>
      <p>👍 ${number(DATA.live.likes)}</p>
      <p>💬 ${number(DATA.live.comments)}</p>

      <a
        href="${esc(DATA.live.url)}"
        target="_blank"
      >
        LIVEを見る →
      </a>
    </div>
  `;
}

/* =========================
   スコア
========================= */

function renderScore() {
  const score =
    DATA.analysis?.score || 0;

  document.getElementById("score").textContent =
    score + " / 100";

  const scoreText =
    document.getElementById("scoreText");

  if (score >= 70) {
    scoreText.textContent = "🔥 連投が多め";
  } else if (score >= 40) {
    scoreText.textContent = "💬 やや連投あり";
  } else {
    scoreText.textContent = "✨ 通常のコメント傾向";
  }
}

/* =========================
   統計
========================= */

function renderStats() {
  const analysis = DATA.analysis || {};
  const minute = DATA.minute || {};

  const rateText =
    document.getElementById("rateText");

  rateText.innerHTML = `
    💬 通常コメント：
    <b>${number(analysis.normalCount)}</b>件<br>

    🔥 連投コメント：
    <b>${number(analysis.consecutiveCount)}</b>件<br>

    📊 連投率：
    <b>${analysis.consecutiveRate || 0}%</b>
  `;

  const minuteStats =
    document.getElementById("minuteStats");

  minuteStats.innerHTML = `
    平均：
    <b>${minute.average || 0}件/分</b>
    <br>

    🔥 ピーク：
    <b>${minute.peak || 0}件/分</b>
  `;

  let peakTime = "-";

  if (
    minute.labels &&
    minute.peakIndex >= 0
  ) {
    peakTime =
      minute.labels[minute.peakIndex];
  }

  document.getElementById("peak").innerHTML =
    `⏱️ 最もコメントが多かった時間：
    <b>${peakTime}</b>`;
}

/* =========================
   グラフ
========================= */

function renderCharts() {
  if (typeof Chart === "undefined") {
    console.error("Chart.jsがありません");
    return;
  }

  renderPie();
  renderMinute();
}

/* =========================
   円グラフ
========================= */

function renderPie() {
  const canvas =
    document.getElementById("pie");

  if (!canvas) return;

  if (pieChart) {
    pieChart.destroy();
  }

  const analysis =
    DATA.analysis || {};

  pieChart = new Chart(
    canvas.getContext("2d"),
    {
      type: "doughnut",

      data: {
        labels: [
          "通常コメント",
          "連投コメント"
        ],

        datasets: [
          {
            data: [
              analysis.normalCount || 0,
              analysis.consecutiveCount || 0
            ]
          }
        ]
      },

      options: {
        responsive: true,

        plugins: {
          legend: {
            position: "bottom"
          }
        }
      }
    }
  );
}

/* =========================
   分/グラフ
========================= */

function renderMinute() {
  const canvas =
    document.getElementById("minuteChart");

  if (!canvas) return;

  if (minuteChart) {
    minuteChart.destroy();
  }

  const minute =
    DATA.minute || {};

  minuteChart = new Chart(
    canvas.getContext("2d"),
    {
      type: "line",

      data: {
        labels:
          minute.labels || [],

        datasets: [
          {
            label: "コメント数/分",

            data:
              minute.values || [],

            tension: 0.25,

            fill: false
          }
        ]
      },

      options: {
        responsive: true,

        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    }
  );
}

/* =========================
   急増
========================= */

function renderSpikes() {
  const box =
    document.getElementById("spikes");

  const minute =
    DATA.minute || {};

  const values =
    minute.values || [];

  const labels =
    minute.labels || [];

  if (!values.length) {
    box.textContent =
      "分析データがありません。";
    return;
  }

  const average =
    minute.average || 0;

  const spikes = [];

  values.forEach((value, index) => {
    if (
      value >=
      Math.max(average * 3, 10)
    ) {
      spikes.push(
        `${labels[index]}：${value}件/分`
      );
    }
  });

  if (!spikes.length) {
    box.textContent =
      "大きなコメント急増はありませんでした。";
    return;
  }

  box.innerHTML =
    spikes
      .map(x => `🚨 ${x}`)
      .join("<br>");
}

/* =========================
   ユーザー表示
========================= */

function renderUsers() {
  const box =
    document.getElementById("userPreview");

  const users =
    DATA.analysis?.users || [];

  if (!users.length) {
    box.innerHTML =
      "ユーザーデータがありません。";
    return;
  }

  box.innerHTML =
    users
      .slice(0, 10)
      .map((user, index) => `
        <div class="user-row">
          <b>${index + 1}位</b>
          <span>${esc(user.name)}</span>
          <span>
            ${number(user.count)}コメント
          </span>
        </div>
      `)
      .join("");
}

/* =========================
   ランキング
========================= */

function setupRanking() {
  const tabs =
    document.querySelectorAll(".tab");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t =>
        t.classList.remove("active")
      );

      tab.classList.add("active");

      rankingMode =
        tab.dataset.rank;

      renderRanking();
    });
  });

  const search =
    document.getElementById("rankSearch");

  if (search) {
    search.addEventListener(
      "input",
      () => {
        renderRanking(search.value);
      }
    );
  }
}

function renderRanking(searchText = "") {
  const list =
    document.getElementById("rankingList");

  if (!list || !DATA) return;

  let users =
    [...(DATA.analysis?.users || [])];

  const keyword =
    searchText.trim().toLowerCase();

  if (keyword) {
    users = users.filter(user =>
      user.name
        .toLowerCase()
        .includes(keyword)
    );
  }

  if (rankingMode === "streak") {
    users.sort(
      (a, b) =>
        (b.maxStreak || 0) -
        (a.maxStreak || 0)
    );
  } else {
    users.sort(
      (a, b) =>
        (b.count || 0) -
        (a.count || 0)
    );
  }

  list.innerHTML =
    users
      .slice(0, 100)
      .map((user, index) => `
        <div class="ranking-row">

          <span class="ranking-number">
            ${index + 1}
          </span>

          <span class="ranking-name">
            ${esc(user.name)}
          </span>

          <span class="ranking-count">
            ${
              rankingMode === "streak"
                ? number(user.maxStreak || 0) + "連投"
                : number(user.count) + "コメント"
            }
          </span>

        </div>
      `)
      .join("");
}

/* =========================
   期間
========================= */

function setupPeriod() {
  const buttons =
    document.querySelectorAll(".filter");

  buttons.forEach(button => {
    button.addEventListener("click", async () => {

      period =
        button.textContent.trim();

      buttons.forEach(b =>
        b.classList.remove("active")
      );

      button.classList.add("active");

      if (currentChannel) {
        await analyze();
      }
    });
  });
}

/* =========================
   画面切り替え
========================= */

function setupNavigation() {
  document
    .querySelectorAll("[data-screen]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          showScreen(
            button.dataset.screen
          );
        }
      );
    });
}

function showScreen(screen) {
  document
    .querySelectorAll(".screen")
    .forEach(section => {
      section.classList.remove("active");
    });

  const target =
    document.getElementById(screen);

  if (target) {
    target.classList.add("active");
  }
}

/* =========================
   数字
========================= */

function number(value) {
  return Number(
    value || 0
  ).toLocaleString("ja-JP");
}

/* =========================
   HTMLエスケープ
========================= */

function esc(value) {
  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c])
  );
}

console.log(
  "💬 チャット稼ぎチェッカー app.js loaded"
);
