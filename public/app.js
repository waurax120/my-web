let DATA = null;
let currentChannel = "";
let period = "今日";
let rankingMode = "comments";

let minuteChart = null;
let pieChart = null;

/* =========================
   HTMLエスケープ
========================= */

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c];
    }
  );
}

/* =========================
   数字
========================= */

function number(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

/* =========================
   初期化
========================= */

document.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  setupPeriodButtons();
  setupRankingTabs();
});

/* =========================
   イベント
========================= */

function setupEvents() {
  const buttons = document.querySelectorAll("button");

  buttons.forEach(button => {
    const text = button.textContent.trim();

    if (
      text.includes("分析する") ||
      text.includes("分析")
    ) {
      button.addEventListener("click", analyze);
    }
  });

  const inputs =
    document.querySelectorAll("input");

  inputs.forEach(input => {
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        analyze();
      }
    });
  });
}

/* =========================
   期間ボタン
========================= */

function setupPeriodButtons() {
  const buttons =
    document.querySelectorAll(".filter");

  buttons.forEach(button => {
    button.addEventListener("click", async () => {
      period = button.textContent.trim();

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
   ランキングタブ
========================= */

function setupRankingTabs() {
  const tabs =
    document.querySelectorAll(
      ".ranking-tab, .rank-tab, [data-ranking]"
    );

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const value =
        tab.dataset.ranking ||
        tab.textContent.trim();

      if (value.includes("連投")) {
        rankingMode = "consecutive";
      } else if (value.includes("ユーザー")) {
        rankingMode = "users";
      } else {
        rankingMode = "comments";
      }

      tabs.forEach(t =>
        t.classList.remove("active")
      );

      tab.classList.add("active");

      renderRanking();
    });
  });
}

/* =========================
   入力欄
========================= */

function getSearchValue() {
  const input =
    document.querySelector(
      'input[type="text"]'
    );

  if (!input) return "";

  return input.value.trim();
}

/* =========================
   分析
========================= */

async function analyze() {
  const query = getSearchValue();

  if (!query) {
    alert("チャンネル名を入力してください。");
    return;
  }

  currentChannel = query;

  showLoading();

  try {
    const url =
      "/api/analyze?q=" +
      encodeURIComponent(query) +
      "&period=" +
      encodeURIComponent(period);

    const response =
      await fetch(url);

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "分析に失敗しました。"
      );
    }

    DATA = data;

    renderAll();

  } catch (error) {
    console.error(error);

    showError(
      error.message ||
      "分析中にエラーが発生しました。"
    );
  }
}

/* =========================
   ローディング
========================= */

function showLoading() {
  const areas = [
    "#analysis",
    "#result",
    ".analysis",
    ".results"
  ];

  for (const selector of areas) {
    const element =
      document.querySelector(selector);

    if (element) {
      element.style.display = "block";
    }
  }

  const loading =
    document.querySelector(
      "#loading"
    );

  if (loading) {
    loading.style.display = "block";
    loading.textContent =
      "🔄 分析中...";
  }
}

/* =========================
   エラー
========================= */

function showError(message) {
  const loading =
    document.querySelector(
      "#loading"
    );

  if (loading) {
    loading.style.display = "block";
    loading.textContent =
      "❌ " + message;
  }

  alert("分析エラー\n\n" + message);
}

/* =========================
   全体描画
========================= */

function renderAll() {
  if (!DATA) return;

  renderChannel();
  renderScore();
  renderStats();
  renderCharts();
  renderUsers();
  renderRanking();

  hideLoading();
}

/* =========================
   ローディング終了
========================= */

function hideLoading() {
  const loading =
    document.querySelector(
      "#loading"
    );

  if (loading) {
    loading.style.display = "none";
  }
}

/* =========================
   チャンネル情報
========================= */

function renderChannel() {
  const channel =
    DATA.channel;

  const image =
    document.querySelector(
      "#channelThumbnail"
    );

  if (image) {
    image.src =
      channel.thumbnail || "";
  }

  const title =
    document.querySelector(
      "#channelTitle"
    );

  if (title) {
    title.textContent =
      channel.title || "";
  }

  const subscribers =
    document.querySelector(
      "#subscribers"
    );

  if (subscribers) {
    subscribers.textContent =
      number(channel.subscribers);
  }

  const views =
    document.querySelector(
      "#channelViews"
    );

  if (views) {
    views.textContent =
      number(channel.views);
  }

  const videos =
    document.querySelector(
      "#videoCount"
    );

  if (videos) {
    videos.textContent =
      number(channel.videoCount);
  }

  const live =
    document.querySelector(
      "#liveBadge"
    );

  if (live) {
    if (DATA.live) {
      live.textContent = "🔴 LIVE中";
      live.style.display = "inline-block";
    } else {
      live.textContent = "";
      live.style.display = "none";
    }
  }

  const link =
    document.querySelector(
      "#youtubeLink"
    );

  if (link) {
    link.href =
      "https://www.youtube.com/channel/" +
      channel.id;

    link.target = "_blank";
  }
}

/* =========================
   チャット稼ぎ度
========================= */

function renderScore() {
  const score =
    DATA.analysis?.score || 0;

  const elements = [
    "#score",
    "#kasegiScore",
    "#chatScore"
  ];

  elements.forEach(selector => {
    const element =
      document.querySelector(selector);

    if (element) {
      element.textContent =
        score + " / 100";
    }
  });

  const bars =
    document.querySelectorAll(
      ".score-bar-fill"
    );

  bars.forEach(bar => {
    bar.style.width =
      score + "%";
  });
}

/* =========================
   統計
========================= */

function renderStats() {
  const analysis =
    DATA.analysis || {};

  const total =
    DATA.totalComments || 0;

  const consecutive =
    analysis.consecutiveCount || 0;

  const normal =
    analysis.normalCount || 0;

  const rate =
    analysis.consecutiveRate || 0;

  setText(
    "#totalComments",
    number(total)
  );

  setText(
    "#consecutiveCount",
    number(consecutive)
  );

  setText(
    "#normalCount",
    number(normal)
  );

  setText(
    "#consecutiveRate",
    rate + "%"
  );

  const minute =
    DATA.minute || {};

  setText(
    "#averagePerMinute",
    minute.average + "件/分"
  );

  setText(
    "#peakPerMinute",
    minute.peak + "件/分"
  );

  let peakTime = "";

  if (
    minute.labels &&
    minute.peakIndex >= 0
  ) {
    peakTime =
      minute.labels[
        minute.peakIndex
      ];
  }

  setText(
    "#peakTime",
    peakTime || "-"
  );

  /* LIVE */

  if (DATA.live) {
    setText(
      "#liveViews",
      number(DATA.live.views)
    );

    setText(
      "#liveLikes",
      number(DATA.live.likes)
    );

    setText(
      "#liveComments",
      number(DATA.live.comments)
    );
  }
}

/* =========================
   テキスト設定
========================= */

function setText(
  selector,
  value
) {
  const element =
    document.querySelector(selector);

  if (element) {
    element.textContent =
      value;
  }
}

/* =========================
   グラフ
========================= */

function renderCharts() {
  if (
    typeof Chart ===
    "undefined"
  ) {
    console.warn(
      "Chart.jsが読み込まれていません。"
    );

    return;
  }

  renderPieChart();
  renderMinuteChart();
}

/* =========================
   円グラフ
========================= */

function renderPieChart() {
  const canvas =
    document.querySelector(
      "#pieChart"
    );

  if (!canvas) return;

  if (pieChart) {
    pieChart.destroy();
  }

  const normal =
    DATA.analysis?.normalCount || 0;

  const consecutive =
    DATA.analysis?.consecutiveCount || 0;

  pieChart =
    new Chart(
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
                normal,
                consecutive
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
   1分ごとのグラフ
========================= */

function renderMinuteChart() {
  const canvas =
    document.querySelector(
      "#minuteChart"
    );

  if (!canvas) return;

  if (minuteChart) {
    minuteChart.destroy();
  }

  const minute =
    DATA.minute || {};

  minuteChart =
    new Chart(
      canvas.getContext("2d"),
      {
        type: "line",

        data: {
          labels:
            minute.labels || [],

          datasets: [
            {
              label:
                "コメント数/分",

              data:
                minute.values || [],

              tension: 0.25,

              fill: false
            }
          ]
        },

        options: {
          responsive: true,

          interaction: {
            intersect: false,
            mode: "index"
          },

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
   急上昇検出
========================= */

function detectSpikes() {
  const minute =
    DATA.minute || {};

  const values =
    minute.values || [];

  const labels =
    minute.labels || [];

  if (!values.length) {
    return [];
  }

  const average =
    minute.average || 0;

  const spikes = [];

  values.forEach(
    (value, index) => {
      if (
        value >=
        Math.max(
          average * 3,
          10
        )
      ) {
        spikes.push({
          time:
            labels[index] || "",
          count:
            value
        });
      }
    }
  );

  return spikes;
}

/* =========================
   ユーザー
========================= */

function renderUsers() {
  const users =
    DATA.analysis?.users || [];

  const container =
    document.querySelector(
      "#users"
    );

  if (!container) return;

  container.innerHTML = "";

  users
    .slice(0, 10)
    .forEach((user, index) => {
      const div =
        document.createElement(
          "div"
        );

      div.className =
        "user-row";

      div.innerHTML = `
        <span class="rank">
          ${index + 1}
        </span>

        <span class="user-name">
          ${esc(user.name)}
        </span>

        <span class="user-count">
          ${number(user.count)}コメント
        </span>
      `;

      container.appendChild(div);
    });
}

/* =========================
   ランキング
========================= */

function renderRanking() {
  const users =
    DATA?.analysis?.users || [];

  const container =
    document.querySelector(
      "#ranking"
    );

  if (!container) return;

  let list = [...users];

  if (
    rankingMode ===
    "consecutive"
  ) {
    list.sort(
      (a, b) =>
        (b.maxStreak || 0) -
        (a.maxStreak || 0)
    );
  } else {
    list.sort(
      (a, b) =>
        (b.count || 0) -
        (a.count || 0)
    );
  }

  container.innerHTML = "";

  list
    .slice(0, 100)
    .forEach((user, index) => {
      const row =
        document.createElement(
          "div"
        );

      row.className =
        "ranking-row";

      row.innerHTML = `
        <span class="ranking-number">
          ${index + 1}
        </span>

        <span class="ranking-name">
          ${esc(user.name)}
        </span>

        <span class="ranking-count">
          ${
            rankingMode ===
            "consecutive"
              ? number(user.maxStreak || 0) +
                "連投"
              : number(user.count) +
                "コメント"
          }
        </span>
      `;

      container.appendChild(row);
    });
}

/* =========================
   ランキング検索
========================= */

function searchRanking(keyword) {
  if (!DATA) return;

  const users =
    DATA.analysis?.users || [];

  const container =
    document.querySelector(
      "#ranking"
    );

  if (!container) return;

  const q =
    String(keyword || "")
      .toLowerCase()
      .trim();

  const filtered =
    users.filter(user =>
      user.name
        .toLowerCase()
        .includes(q)
    );

  container.innerHTML = "";

  filtered
    .slice(0, 100)
    .forEach((user, index) => {
      const row =
        document.createElement(
          "div"
        );

      row.className =
        "ranking-row";

      row.innerHTML = `
        <span class="ranking-number">
          ${index + 1}
        </span>

        <span class="ranking-name">
          ${esc(user.name)}
        </span>

        <span class="ranking-count">
          ${number(user.count)}コメント
        </span>
      `;

      container.appendChild(row);
    });
}

/* =========================
   検索ボックス
========================= */

function setupRankingSearch() {
  const input =
    document.querySelector(
      "#rankingSearch"
    );

  if (!input) return;

  input.addEventListener(
    "input",
    () => {
      searchRanking(
        input.value
      );
    }
  );
}

/* =========================
   自動更新
========================= */

let autoRefreshTimer = null;

function startAutoRefresh(
  minutes = 1
) {
  stopAutoRefresh();

  autoRefreshTimer =
    setInterval(
      () => {
        if (currentChannel) {
          analyze();
        }
      },
      minutes * 60 * 1000
    );
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(
      autoRefreshTimer
    );

    autoRefreshTimer = null;
  }
}

/* =========================
   コンソール確認
========================= */

console.log(
  "💬 チャット稼ぎチェッカー app.js loaded!"
);
