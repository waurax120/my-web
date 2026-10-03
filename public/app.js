const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let DATA = null;
let currentPeriod = "今日";
let currentRank = "comments";

let pieChart = null;
let minuteChart = null;
let liveMinuteChart = null;

/* =========================
   共通
========================= */

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

/* =========================
   画面切り替え
========================= */

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

/* =========================
   エラー表示
========================= */

function showError(message) {
  const error = $("#error");

  if (error) {
    error.textContent = message || "";
  }
}

/* =========================
   チャンネルカード
========================= */

function renderChannel() {
  if (!DATA?.channel) return;

  const channel = DATA.channel;

  $("#channelCard").innerHTML = `
    <div class="channelInner">
      <img
        class="channelThumb"
        src="${esc(channel.thumbnail)}"
        alt=""
      >

      <div class="channelInfo">
        <h2>${esc(channel.title)}</h2>

        <div class="stats">
          <span>登録者 ${number(channel.subscribers)}</span>
          <span>総再生 ${number(channel.views)}</span>
          <span>動画 ${number(channel.videoCount)}</span>
        </div>
      </div>
    </div>
  `;
}

/* =========================
   LIVE表示
========================= */

function renderLiveHome() {
  const target = $("#liveHome");

  if (!target) return;

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
      <div class="liveBadge">🔴 LIVE中</div>

      <img
        src="${esc(live.thumbnail)}"
        alt=""
        style="width:100%;border-radius:12px;margin:10px 0;"
      >

      <h3>${esc(live.title)}</h3>

      <div class="stats">
        <span>👀 ${number(live.views)}</span>
        <span>👍 ${number(live.likes)}</span>
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

/* =========================
   LIVEチャット分析
========================= */

function renderLiveChat() {
  const liveChat = DATA?.liveChat;

  /*
   * 現在LIVEではない場合
   */
  if (!DATA?.live || !liveChat) {
    renderNormalAnalysis();
    return;
  }

  /*
   * LIVEチャットが存在する場合
   */
  renderLiveChatAnalysis(liveChat);
}

/* =========================
   通常コメント分析
========================= */

function renderNormalAnalysis() {
  const rateText = $("#rateText");
  const minuteStats = $("#minuteStats");
  const spikes = $("#spikes");
  const peak = $("#peak");

  if (rateText) {
    const analysis = DATA?.analysis;

    rateText.innerHTML = `
      <div>
        通常コメント：
        <strong>${number(
          analysis?.normalCount
        )}</strong>
      </div>

      <div>
        連投コメント：
        <strong>${number(
          analysis?.consecutiveCount
        )}</strong>
      </div>

      <div>
        連投率：
        <strong>${number(
          analysis?.consecutiveRate
        )}%</strong>
      </div>
    `;
  }

  if (minuteStats) {
    const minute = DATA?.minute;

    minuteStats.innerHTML = `
      <div>
        平均：
        <strong>${number(
          minute?.average
        )}</strong> コメント/分
      </div>

      <div>
        ピーク：
        <strong>${number(
          minute?.peak
        )}</strong> コメント/分
      </div>
    `;
  }

  if (spikes) {
    spikes.innerHTML = `
      <div class="muted">
        通常コメントの急増分析
      </div>
    `;
  }

  if (peak) {
    const minute = DATA?.minute;

    if (
      minute &&
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

/* =========================
   LIVEチャット分析表示
========================= */

function renderLiveChatAnalysis(liveChat) {
  const rateText = $("#rateText");
  const minuteStats = $("#minuteStats");
  const spikes = $("#spikes");
  const peak = $("#peak");
  const userPreview = $("#userPreview");

  /*
   * 連投率
   */
  if (rateText) {
    rateText.innerHTML = `
      <div class="liveAnalysisTitle">
        🔴 LIVEチャット分析
      </div>

      <div>
        チャット総数：
        <strong>${number(
          liveChat.total
        )}</strong>
      </div>

      <div>
        🔥 連投チャット：
        <strong>${number(
          liveChat.consecutiveCount
        )}</strong>
      </div>

      <div>
        🔥 チャット連投率：
        <strong class="bigRate">
          ${number(
            liveChat.consecutiveRate
          )}%
        </strong>
      </div>
    `;
  }

  /*
   * 1分あたり
   */
  if (minuteStats) {
    const minute =
      liveChat.minute || {};

    minuteStats.innerHTML = `
      <div>
        📈 平均：
        <strong>
          ${number(
            minute.average
          )}
        </strong>
        チャット/分
      </div>

      <div>
        🔥 ピーク：
        <strong>
          ${number(
            minute.peak
          )}
        </strong>
        チャット/分
      </div>
    `;
  }

  /*
   * 急増
   */
  if (spikes) {
    const list =
      liveChat.spikes || [];

    if (!list.length) {
      spikes.innerHTML = `
        <div class="muted">
          🚨 現在、大きなチャット急増は
          検出されていません。
        </div>
      `;
    } else {
      spikes.innerHTML = `
        <div class="spikeList">
          ${list
            .map(
              (item) => `
                <div class="spikeItem">
                  🚨
                  <strong>
                    ${esc(item.time)}
                  </strong>

                  <span>
                    ${number(
                      item.previous
                    )}
                    → 
                    ${number(
                      item.count
                    )}
                    チャット/分
                  </span>
                </div>
              `
            )
            .join("")}
        </div>
      `;
    }
  }

  /*
   * ピーク時間
   */
  if (peak) {
    const minute =
      liveChat.minute || {};

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
          ${esc(
            minute.peakTime
          )}
        </div>

        <div class="muted">
          ${number(
            minute.peak
          )} チャット/分
        </div>
      `;
    } else {
      peak.textContent =
        "まだチャットデータがありません。";
    }
  }

  /*
   * ユーザーランキング
   */
  if (userPreview) {
    const users =
      liveChat.users || [];

    if (!users.length) {
      userPreview.innerHTML = `
        <div class="muted">
          チャットユーザーがありません。
        </div>
      `;
    } else {
      userPreview.innerHTML = `
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
                    ${esc(
                      user.name
                    )}
                  </div>

                  <div>
                    💬
                    ${number(
                      user.count
                    )}
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      `;
    }
  }
}

/* =========================
   グラフ
========================= */

function renderPie() {
  const canvas = $("#pie");

  if (!canvas) return;

  if (pieChart) {
    pieChart.destroy();
    pieChart = null;
  }

  const liveChat = DATA?.liveChat;

  let normalCount;
  let consecutiveCount;

  if (liveChat) {
    consecutiveCount =
      liveChat.consecutiveCount || 0;

    normalCount = Math.max(
      0,
      (liveChat.total || 0) -
        consecutiveCount
    );
  } else {
    consecutiveCount =
      DATA?.analysis
        ?.consecutiveCount || 0;

    normalCount =
      DATA?.analysis
        ?.normalCount || 0;
  }

  pieChart = new Chart(
    canvas.getContext("2d"),
    {
      type: "doughnut",

      data: {
        labels: [
          liveChat
            ? "通常チャット"
            : "通常コメント",

          liveChat
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

function renderMinuteChart() {
  const canvas =
    $("#minuteChart");

  if (!canvas) return;

  if (minuteChart) {
    minuteChart.destroy();
    minuteChart = null;
  }

  const liveChat =
    DATA?.liveChat;

  const minute =
    liveChat
      ? liveChat.minute
      : DATA?.minute;

  if (!minute) return;

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
                liveChat
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

/* =========================
   ユーザー分析
========================= */

function renderUserPreview() {
  const target =
    $("#userPreview");

  if (!target) return;

  /*
   * LIVEチャットの場合は
   * renderLiveChatAnalysisで表示済み
   */
  if (DATA?.liveChat) {
    return;
  }

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

                ${esc(
                  user.name
                )}
              </div>

              <div>
                💬
                ${number(
                  user.count
                )}
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

/* =========================
   ランキング
========================= */

function renderRanking() {
  const target =
    $("#rankingList");

  if (!target || !DATA) return;

  const search =
    String(
      $("#rankSearch")?.value ||
        ""
    )
      .trim()
      .toLowerCase();

  /*
   * LIVEチャット
   */
  if (DATA.liveChat) {
    renderLiveRanking(
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

  if (currentRank === "users") {
    renderUserRanking(
      target,
      users,
      search
    );

    return;
  }

  if (currentRank === "streak") {
    renderStreakRanking(
      target,
      users,
      search
    );

    return;
  }

  renderCommentRanking(
    target,
    search
  );
}

/* =========================
   LIVEランキング
========================= */

function renderLiveRanking(
  target,
  search
) {
  const users =
    DATA.liveChat?.users || [];

  let list =
    [...users];

  if (currentRank === "streak") {
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

  if (search) {
    list = list.filter(
      (user) =>
        user.name
          .toLowerCase()
          .includes(search)
    );
  }

  target.innerHTML = `
    <div class="rankingHeader">
      🔴 LIVEチャット
    </div>

    ${list
      .slice(0, 100)
      .map(
        (user, index) => `
          <div class="rankRow">
            <div class="rankNumber">
              ${index + 1}
            </div>

            <div class="rankMain">
              <strong>
                ${esc(
                  user.name
                )}
              </strong>

              <small>
                ${
                  currentRank ===
                  "streak"
                    ? `🔥 最大連投 ${number(
                        user.maxStreak
                      )}`
                    : `💬 ${number(
                        user.count
                      )} チャット`
                }
              </small>
            </div>
          </div>
        `
      )
      .join("")}
  `;
}

/* =========================
   通常コメントランキング
========================= */

function renderUserRanking(
  target,
  users,
  search
) {
  let list = [...users];

  if (search) {
    list = list.filter(
      (user) =>
        user.name
          .toLowerCase()
          .includes(search)
    );
  }

  target.innerHTML =
    list
      .slice(0, 100)
      .map(
        (user, index) => `
          <div class="rankRow">
            <div class="rankNumber">
              ${index + 1}
            </div>

            <div class="rankMain">
              <strong>
                ${esc(
                  user.name
                )}
              </strong>

              <small>
                💬 ${number(
                  user.count
                )}
                コメント
                ／
                🔥 最大連投
                ${number(
                  user.maxStreak
                )}
              </small>
            </div>
          </div>
        `
      )
      .join("");
}

function renderStreakRanking(
  target,
  users,
  search
) {
  let list =
    [...users].sort(
      (a, b) =>
        (b.maxStreak || 0) -
        (a.maxStreak || 0)
    );

  if (search) {
    list = list.filter(
      (user) =>
        user.name
          .toLowerCase()
          .includes(search)
    );
  }

  target.innerHTML =
    list
      .slice(0, 100)
      .map(
        (user, index) => `
          <div class="rankRow">
            <div class="rankNumber">
              ${index + 1}
            </div>

            <div class="rankMain">
              <strong>
                ${esc(
                  user.name
                )}
              </strong>

              <small>
                🔥 最大
                ${number(
                  user.maxStreak
                )}
                連投
              </small>
            </div>
          </div>
        `
      )
      .join("");
}

function renderCommentRanking(
  target,
  search
) {
  const users =
    DATA.analysis?.users || [];

  /*
   * 現在のサーバーからは
   * 個別コメント一覧をランキング用に
   * 全て返していないので、
   * ユーザーランキングを表示
   */
  let list =
    [...users];

  if (search) {
    list = list.filter(
      (user) =>
        user.name
          .toLowerCase()
          .includes(search)
    );
  }

  target.innerHTML =
    list
      .slice(0, 100)
      .map(
        (user, index) => `
          <div class="rankRow">
            <div class="rankNumber">
              ${index + 1}
            </div>

            <div class="rankMain">
              <strong>
                ${esc(
                  user.name
                )}
              </strong>

              <small>
                💬 ${number(
                  user.count
                )}
                コメント
              </small>
            </div>
          </div>
        `
      )
      .join("");
}

/* =========================
   分析画面全体
========================= */

function renderAnalysis() {
  renderChannel();
  renderLiveHome();

  /*
   * LIVEならLIVEチャット
   * 通常動画なら通常コメント
   */
  if (DATA?.liveChat) {
    renderLiveChatAnalysis(
      DATA.liveChat
    );
  } else {
    renderNormalAnalysis();
    renderUserPreview();
  }

  renderPie();
  renderMinuteChart();

  /*
   * スコア
   */
  const score =
    $("#score");

  const scoreText =
    $("#scoreText");

  if (score) {
    if (DATA?.liveChat) {
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

  /*
   * LIVEの場合、
   * ユーザーランキングも表示
   */
  if (DATA?.liveChat) {
    renderUserPreview();
  }
}

/* =========================
   分析実行
========================= */

async function analyze() {
  const input =
    $("#channelInput");

  const button =
    $("#analyzeBtn");

  const q =
    String(
      input?.value || ""
    ).trim();

  if (!q) {
    showError(
      "チャンネル名を入力してください。"
    );

    return;
  }

  showError("");

  if (button) {
    button.disabled = true;
    button.textContent =
      "分析中...";
  }

  try {
    const url =
      `/api/analyze?q=${encodeURIComponent(
        q
      )}&period=${encodeURIComponent(
        currentPeriod
      )}`;

    const response =
      await fetch(url);

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error ||
          "分析に失敗しました。"
      );
    }

    DATA = data;

    renderAnalysis();

    renderRanking();

    showScreen(
      "analysis"
    );
  } catch (error) {
    console.error(error);

    showError(
      error.message ||
        "分析中にエラーが発生しました。"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "分析する";
    }
  }
}

/* =========================
   分析ボタン
========================= */

$("#analyzeBtn")?.addEventListener(
  "click",
  analyze
);

$("#channelInput")?.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter") {
      analyze();
    }
  }
);

/* =========================
   期間フィルター
========================= */

$$(".filter").forEach(
  (button) => {
    button.addEventListener(
      "click",
      async () => {
        $$(".filter").forEach(
          (item) =>
            item.classList.remove(
              "active"
            )
        );

        button.classList.add(
          "active"
        );

        currentPeriod =
          button.textContent.trim();

        if (DATA) {
          await analyze();
        }
      }
    );
  }
);

/* =========================
   ランキングタブ
========================= */

$$(".tab").forEach(
  (button) => {
    button.addEventListener(
      "click",
      () => {
        $$(".tab").forEach(
          (item) =>
            item.classList.remove(
              "active"
            )
        );

        button.classList.add(
          "active"
        );

        currentRank =
          button.dataset.rank ||
          "comments";
