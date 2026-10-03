```javascript
/* ========================================
   チャット稼ぎチェッカー
   public/app.js 完成版
======================================== */

let DATA = null;

let currentPeriod = "今日";
let currentRank = "comments";

let pieChart = null;
let minuteChart = null;


/* ========================================
   共通
======================================== */

const $ = (selector) => {
  return document.querySelector(selector);
};

const $$ = (selector) => {
  return [...document.querySelectorAll(selector)];
};


function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]
  );
}


function number(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}


/* ========================================
   画面切り替え
======================================== */

function showScreen(screenName) {
  $$(".screen").forEach((screen) => {
    screen.classList.toggle(
      "active",
      screen.id === screenName
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


$$("[data-screen]").forEach((button) => {
  button.addEventListener("click", () => {
    showScreen(button.dataset.screen);
  });
});


/* ========================================
   エラー
======================================== */

function showError(message) {
  const error = $("#error");

  if (error) {
    error.textContent = message || "";
  }
}


/* ========================================
   チャンネル情報
======================================== */

function renderChannel() {
  const target = $("#channelCard");

  if (!target || !DATA?.channel) {
    return;
  }

  const channel = DATA.channel;

  target.innerHTML = `
    <div class="channelInner">

      <img
        class="channelThumb"
        src="${esc(channel.thumbnail)}"
        alt=""
      >

      <div class="channelInfo">

        <h2>
          ${esc(channel.title)}
        </h2>

        <div class="stats">

          <span>
            登録者 ${number(channel.subscribers)}
          </span>

          <span>
            総再生 ${number(channel.views)}
          </span>

          <span>
            動画 ${number(channel.videoCount)}
          </span>

        </div>

      </div>

    </div>
  `;
}


/* ========================================
   ホームのLIVE表示
======================================== */

function renderLiveHome() {
  const target = $("#liveHome");

  if (!target) {
    return;
  }

  if (!DATA?.live) {
    target.innerHTML = `
      <div class="muted">
        現在LIVE中ではありません。
      </div>
    `;

    return;
  }

  const live = DATA.live;

  target.innerHTML = `
    <div class="liveBox">

      <div class="liveBadge">
        🔴 LIVE中
      </div>

      <img
        src="${esc(live.thumbnail)}"
        alt=""
        style="
          width:100%;
          border-radius:12px;
          margin:10px 0;
        "
      >

      <h3>
        ${esc(live.title)}
      </h3>

      <div class="stats">

        <span>
          👀 ${number(live.views)}
        </span>

        <span>
          👍 ${number(live.likes)}
        </span>

      </div>

      <a
        href="${esc(live.url)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        YouTubeで見る →
      </a>

    </div>
  `;
}


/* ========================================
   LIVEチャット専用セクション
======================================== */

function renderLiveChatSection() {
  const section = $("#liveChatSection");

  if (!section) {
    return;
  }

  /*
   * LIVE中ではない
   */
  if (!DATA?.live || !DATA?.liveChat) {
    section.style.display = "none";
    return;
  }

  /*
   * LIVE中
   */
  section.style.display = "block";

  const liveChat = DATA.liveChat;

  renderLiveChatStats(liveChat);
  renderLiveWords(liveChat);
  renderLiveRankingPreview(liveChat);
  renderLiveSpikes(liveChat);
  renderLivePeak(liveChat);
}


/* ========================================
   LIVEチャット基本統計
======================================== */

function renderLiveChatStats(liveChat) {
  const total =
    $("#liveChatTotal");

  const consecutive =
    $("#liveChatConsecutive");

  const rate =
    $("#liveChatRate");

  if (total) {
    total.textContent =
      number(liveChat.total);
  }

  if (consecutive) {
    consecutive.textContent =
      number(
        liveChat.consecutiveCount
      );
  }

  if (rate) {
    rate.textContent =
      `${number(
        liveChat.consecutiveRate
      )}%`;
  }
}


/* ========================================
   よく使われた言葉
======================================== */

function renderLiveWords(liveChat) {
  const target =
    $("#liveWordRanking");

  if (!target) {
    return;
  }

  const words =
    liveChat.wordRanking || [];

  if (!words.length) {
    target.innerHTML = `
      <div class="muted">
        まだ十分なチャットデータがありません。
      </div>
    `;

    return;
  }

  target.innerHTML = `
    <div class="wordGrid">

      ${words
        .slice(0, 20)
        .map(
          (item, index) => `
            <div class="wordItem">

              <span class="wordRank">
                ${index + 1}
              </span>

              <span class="wordText">
                ${esc(item.word)}
              </span>

              <span class="wordCount">
                ${number(item.count)}回
              </span>

            </div>
          `
        )
        .join("")}

    </div>
  `;
}


/* ========================================
   LIVEチャット ユーザーランキング
======================================== */

function renderLiveRankingPreview(liveChat) {
  const target =
    $("#liveChatRanking");

  if (!target) {
    return;
  }

  const users =
    liveChat.users || [];

  if (!users.length) {
    target.innerHTML = `
      <div class="muted">
        チャットユーザーがありません。
      </div>
    `;

    return;
  }

  const sorted =
    [...users].sort(
      (a, b) =>
        Number(b.count || 0) -
        Number(a.count || 0)
    );

  target.innerHTML = `
    <div class="liveRankingList">

      ${sorted
        .slice(0, 10)
        .map(
          (user, index) => `
            <div class="rankRow">

              <div class="rankNumber">
                ${index + 1}
              </div>

              <div class="rankMain">

                <strong>
                  ${esc(user.name)}
                </strong>

                <small>
                  💬 ${number(user.count)}
                  チャット
                  ／
                  🔥 最大
                  ${number(user.maxStreak)}
                  連投
                </small>

              </div>

            </div>
          `
        )
        .join("")}

    </div>
  `;
}


/* ========================================
   LIVEチャット急増
======================================== */

function renderLiveSpikes(liveChat) {
  const target =
    $("#liveChatSpikes");

  if (!target) {
    return;
  }

  const spikes =
    liveChat.spikes || [];

  if (!spikes.length) {
    target.innerHTML = `
      <div class="muted">
        🚨 大きなチャット急増は
        検出されていません。
      </div>
    `;

    return;
  }

  target.innerHTML = `
    <div class="spikeList">

      ${spikes
        .map(
          (item) => `
            <div class="spikeItem">

              🚨

              <strong>
                ${esc(item.time)}
              </strong>

              <span>
                ${number(item.previous)}
                →
                ${number(item.count)}
                チャット/分
              </span>

            </div>
          `
        )
        .join("")}

    </div>
  `;
}


/* ========================================
   LIVEチャット ピーク時間
======================================== */

function renderLivePeak(liveChat) {
  const target =
    $("#liveChatPeak");

  if (!target) {
    return;
  }

  const minute =
    liveChat.minute || {};

  if (!minute.peakTime) {
    target.innerHTML = `
      <div class="muted">
        まだピーク時間を計算できません。
      </div>
    `;

    return;
  }

  target.innerHTML = `
    <div>

      <div class="muted">
        ⏱️ 最もチャットが盛り上がった時間
      </div>

      <div
        style="
          font-size:1.7rem;
          font-weight:700;
          margin-top:8px;
        "
      >
        ${esc(minute.peakTime)}
      </div>

      <div class="muted">
        ${number(minute.peak)}
        チャット/分
      </div>

    </div>
  `;
}


/* ========================================
   通常コメント分析
======================================== */

function renderNormalAnalysis() {
  const analysis =
    DATA?.analysis || {};

  const minute =
    DATA?.minute || {};

  const rateText =
    $("#rateText");

  const minuteStats =
    $("#minuteStats");

  const spikes =
    $("#spikes");

  const peak =
    $("#peak");


  /*
   * 連投率
   */

  if (rateText) {
    rateText.innerHTML = `
      <div>
        通常コメント：
        <strong>
          ${number(
            analysis.normalCount
          )}
        </strong>
      </div>

      <div>
        連投コメント：
        <strong>
          ${number(
            analysis.consecutiveCount
          )}
        </strong>
      </div>

      <div>
        連投率：
        <strong>
          ${number(
            analysis.consecutiveRate
          )}%
        </strong>
      </div>
    `;
  }


  /*
   * コメント数/分
   */

  if (minuteStats) {
    minuteStats.innerHTML = `
      <div>
        📈 平均：
        <strong>
          ${number(minute.average)}
        </strong>
        コメント/分
      </div>

      <div>
        🔥 ピーク：
        <strong>
          ${number(minute.peak)}
        </strong>
        コメント/分
      </div>
    `;
  }


  /*
   * 急増
   */

  if (spikes) {
    spikes.innerHTML = `
      <div class="muted">
        通常動画コメントの急増分析
      </div>
    `;
  }


  /*
   * ピーク
   */

  if (peak) {
    if (
      minute.peakIndex >= 0 &&
      minute.labels?.length
    ) {
      peak.innerHTML = `
        <strong>
          ${esc(
            minute.labels[
              minute.peakIndex
            ]
          )}
        </strong>

        に最もコメントが集中

        （${number(
          minute.peak
        )} コメント/分）
      `;
    } else {
      peak.textContent =
        "分析データがありません。";
    }
  }
}


/* ========================================
   LIVE / 通常の統計表示
======================================== */

function renderMainStats() {
  /*
   * LIVE
   */

  if (DATA?.liveChat) {
    const liveChat =
      DATA.liveChat;

    const rateText =
      $("#rateText");

    const minuteStats =
      $("#minuteStats");

    const spikes =
      $("#spikes");

    const peak =
      $("#peak");


    if (rateText) {
      rateText.innerHTML = `
        <div>
          🔴 LIVEチャット総数：
          <strong>
            ${number(liveChat.total)}
          </strong>
        </div>

        <div>
          🔥 連投チャット：
          <strong>
            ${number(
              liveChat.consecutiveCount
            )}
          </strong>
        </div>

        <div>
          🔥 チャット連投率：
          <strong>
            ${number(
              liveChat.consecutiveRate
            )}%
          </strong>
        </div>
      `;
    }


    const minute =
      liveChat.minute || {};

    if (minuteStats) {
      minuteStats.innerHTML = `
        <div>
          📈 平均：
          <strong>
            ${number(minute.average)}
          </strong>
          チャット/分
        </div>

        <div>
          🔥 ピーク：
          <strong>
            ${number(minute.peak)}
          </strong>
          チャット/分
        </div>
      `;
    }


    if (spikes) {
      const list =
        liveChat.spikes || [];

      if (!list.length) {
        spikes.innerHTML = `
          <div class="muted">
            🚨 大きなチャット急増は
            検出されていません。
          </div>
        `;
      } else {
        spikes.innerHTML = `
          ${list
            .map(
              (item) => `
                <div class="spikeItem">

                  🚨

                  <strong>
                    ${esc(item.time)}
                  </strong>

                  <span>
                    ${number(item.previous)}
                    →
                    ${number(item.count)}
                    チャット/分
                  </span>

                </div>
              `
            )
            .join("")}
        `;
      }
    }


    if (peak) {
      if (minute.peakTime) {
        peak.innerHTML = `
          <div>
            ⏱️ 最もチャットが盛り上がった時間
          </div>

          <div
            style="
              font-size:1.6rem;
              font-weight:700;
              margin-top:8px;
            "
          >
            ${esc(minute.peakTime)}
          </div>

          <div class="muted">
            ${number(minute.peak)}
            チャット/分
          </div>
        `;
      } else {
        peak.textContent =
          "まだチャットデータがありません。";
      }
    }

    return;
  }


  /*
   * 通常動画
   */

  renderNormalAnalysis();
}


/* ========================================
   ユーザー分析
======================================== */

function renderUserPreview() {
  const target =
    $("#userPreview");

  if (!target) {
    return;
  }


  /*
   * LIVE
   */

  if (DATA?.liveChat) {
    const users =
      DATA.liveChat.users || [];

    if (!users.length) {
      target.innerHTML = `
        <div class="muted">
          チャットユーザーがありません。
        </div>
      `;

      return;
    }

    target.innerHTML = `
      <div class="liveUserRanking">

        ${users
          .slice(0, 10)
          .map(
            (user, index) => `
              <div class="userRow">

                <div>
                  <strong>
                    ${index + 1}位
                  </strong>

                  ${esc(user.name)}
                </div>

                <div>
                  💬
                  ${number(user.count)}
                </div>

              </div>
            `
          )
          .join("")}

      </div>
    `;

    return;
  }


  /*
   * 通常コメント
   */

  const users =
    DATA?.analysis?.users || [];

  if (!users.length) {
    target.innerHTML = `
      <div class="muted">
        ユーザーデータがありません。
      </div>
    `;

    return;
  }

  target.innerHTML = `
    <div class="userRanking">

      ${users
        .slice(0, 10)
        .map(
          (user, index) => `
            <div class="userRow">

              <div>
                <strong>
                  ${index + 1}位
                </strong>

                ${esc(user.name)}
              </div>

              <div>
                💬
                ${number(user.count)}
              </div>

            </div>
          `
        )
        .join("")}

    </div>
  `;
}


/* ========================================
   円グラフ
======================================== */

function renderPie() {
  const canvas =
    $("#pie");

  if (!canvas) {
    return;
  }

  if (pieChart) {
    pieChart.destroy();
    pieChart = null;
  }


  let normalCount = 0;
  let consecutiveCount = 0;

  /*
   * LIVEチャット
   */

  if (DATA?.liveChat) {
    const liveChat =
      DATA.liveChat;

    consecutiveCount =
      Number(
        liveChat.consecutiveCount || 0
      );

    normalCount =
      Math.max(
        0,
        Number(
          liveChat.total || 0
        ) - consecutiveCount
      );
  }

  /*
   * 通常コメント
   */

  else {
    normalCount =
      Number(
        DATA?.analysis?.normalCount || 0
      );

    consecutiveCount =
      Number(
        DATA?.analysis?.consecutiveCount || 0
      );
  }


  pieChart =
    new Chart(
      canvas.getContext("2d"),
      {
        type: "doughnut",

        data: {
          labels: [
            DATA?.liveChat
              ? "通常チャット"
              : "通常コメント",

            DATA?.liveChat
              ? "連投チャット"
              : "連投コメント"
          ],

          datasets: [
            {
              data: [
                normalCount,
                consecutiveCount
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


/* ========================================
   1分ごとのグラフ
======================================== */

function renderMinuteChart() {
  const canvas =
    $("#minuteChart");

  if (!canvas) {
    return;
  }

  if (minuteChart) {
    minuteChart.destroy();
    minuteChart = null;
  }


  const minute =
    DATA?.liveChat
      ? DATA.liveChat.minute
      : DATA?.minute;

  if (!minute) {
    return;
  }


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
                DATA?.liveChat
                  ? "チャット数/分"
                  : "コメント数/分",

              data:
                minute.values || [],

              tension: 0.25,

              fill: true
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


/* ========================================
   スコア
======================================== */

function renderScore() {
  const score =
    $("#score");

  const scoreText =
    $("#scoreText");

  if (score) {
    if (DATA?.liveChat) {
      /*
       * LIVEチャットの連投率と
       * 通常コメントのスコアを混同しない
       */
      score.textContent =
        "-- / 100";
    } else {
      score.textContent =
        `${number(
          DATA?.analysis?.score
        )} / 100`;
    }
  }

  if (scoreText) {
    if (DATA?.liveChat) {
      scoreText.textContent =
        "LIVEチャット分析中";
    } else {
      scoreText.textContent =
        "分析完了";
    }
  }
}


/* ========================================
   分析画面
======================================== */

function renderAnalysis() {
  renderChannel();

  renderLiveHome();

  renderMainStats();

  renderLiveChatSection();

  renderUserPreview();

  renderPie();

  renderMinuteChart();

  renderScore();
}


/* ========================================
   ランキング
======================================== */

function renderRanking() {
  const target =
    $("#rankingList");

  if (!target || !DATA) {
    return;
  }


  const search =
    String(
      $("#rankSearch")?.value || ""
    )
      .trim()
      .toLowerCase();


  /*
   * LIVEチャット
   */

  if (DATA.liveChat) {
    renderLiveFullRanking(
      target,
      search
    );

    return;
  }


  /*
   * 通常コメント
   */

  const users =
    DATA.analysis?.users || [];


  if (currentRank === "streak") {
    renderStreakRanking(
      target,
      users,
      search
    );

    return;
  }


  /*
   * users / comments
   * 現在のサーバーが返す
   * ユーザーデータを利用
   */

  renderUserRanking(
    target,
    users,
    search
  );
}


/* ========================================
   LIVE完全ランキング
======================================== */

function renderLiveFullRanking(
  target,
  search
) {
  const users =
    DATA.liveChat?.users || [];

  let list =
    [...users];


  /*
   * 連投ランキング
   */

  if (currentRank === "streak") {
    list.sort(
      (a, b) =>
        Number(b.maxStreak || 0) -
        Number(a.maxStreak || 0)
    );
  }


  /*
   * 通常はチャット数
   */

  else {
    list.sort(
      (a, b) =>
        Number(b.count || 0) -
        Number(a.count || 0)
    );
  }


  /*
   * 検索
   */

  if (search) {
    list =
      list.filter(
        (user) =>
          String(user.name || "")
            .toLowerCase()
            .includes(search)
      );
  }


  /*
   * 1〜100位
   */

  target.innerHTML = `
    <div class="rankingHeader">
      🔴 LIVEチャットランキング
    </div>

    ${
      list.length
        ? list
            .slice(0, 100)
            .map(
              (user, index) => `
                
