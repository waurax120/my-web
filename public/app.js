let DATA = null;
let pieChart = null;
let minuteChart = null;
let rankType = "comments";
let period = "今日";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function show(id) {
  $$(".screen").forEach(x => x.classList.remove("active"));

  const target = $("#" + id);

  if (target) {
    target.classList.add("active");
  }

  window.scrollTo(0, 0);
}

/* =========================
   画面切り替え
========================= */

$$("[data-screen]").forEach(button => {
  button.addEventListener("click", () => {
    show(button.dataset.screen);
  });
});

/* =========================
   分析ボタン
========================= */

const analyzeBtn = $("#analyzeBtn");

if (analyzeBtn) {
  analyzeBtn.addEventListener("click", analyze);
}

const channelInput = $("#channelInput");

if (channelInput) {
  channelInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      analyze();
    }
  });
}

async function analyze() {
  const q = $("#channelInput").value.trim();

  if (!q) {
    $("#error").textContent =
      "チャンネル名を入力してください。";
    return;
  }

  $("#error").textContent =
    "分析中… YouTubeからデータを取得しています。";

  try {
    const r = await fetch(
      "/api/analyze?q=" + encodeURIComponent(q)
    );

    const d = await r.json();

    if (!r.ok) {
      throw new Error(
        d.error || "取得に失敗しました"
      );
    }

    DATA = d;

    render(d);

    $("#error").textContent = "";

    show("analysis");

  } catch (e) {
    $("#error").textContent =
      e.message ||
      "エラーが発生しました。";
  }
}

/* =========================
   分析画面
========================= */

function render(d) {

  const channel = d.channel || {};
  const analysis = d.analysis || {};

  $("#channelCard").innerHTML = `
    <img
      src="${esc(channel.thumbnail || "")}"
      alt=""
    >

    <div>
      <h2>
        ${esc(channel.title || "")}
      </h2>

      <div class="sub">
        ${
          d.live
            ? "🔴 LIVE中"
            : "⚪ 現在LIVEなし"
        }

       　
        取得コメント
        ${Number(d.totalComments || 0).toLocaleString()}件
      </div>

      ${
        d.live
          ? `
            <a
              href="${esc(d.live.url || "")}"
              target="_blank"
              rel="noopener"
              style="color:#79a0ff"
            >
              YouTubeでLIVEを見る ↗
            </a>
          `
          : ""
      }
    </div>
  `;

  /* チャット稼ぎ度 */

  const score =
    Number(analysis.score || 0);

  const consecutiveRate =
    Number(
      analysis.consecutiveRate || 0
    );

  if ($("#score")) {
    $("#score").textContent =
      `${score} / 100`;
  }

  if ($("#scoreText")) {
    $("#scoreText").textContent =
      score >= 70
        ? "連投傾向が高め"
        : score >= 40
          ? "中程度"
          : "低め";
  }

  if ($("#rateText")) {
    $("#rateText").innerHTML = `
      普通のチャット
      <b>${Math.max(
        0,
        100 - consecutiveRate
      )}%</b>

     　

      連投チャット
      <b>${consecutiveRate}%</b>
    `;
  }

  /* =========================
     円グラフ
  ========================= */

  if ($("#pie")) {

    if (pieChart) {
      pieChart.destroy();
    }

    pieChart = new Chart(
      $("#pie"),
      {
        type: "doughnut",

        data: {
          labels: [
            "普通のチャット",
            "連投チャット"
          ],

          datasets: [
            {
              data: [
                Number(
                  analysis.normalCount || 0
                ),

                Number(
                  analysis.consecutiveCount || 0
                )
              ]
            }
          ]
        },

        options: {
          plugins: {
            legend: {
              labels: {
                color: "#fff"
              }
            }
          }
        }
      }
    );
  }

  /* =========================
     コメント/分グラフ
  ========================= */

  if ($("#minuteChart")) {

    if (minuteChart) {
      minuteChart.destroy();
    }

    const minute = d.minute || {
      labels: [],
      values: [],
      average: 0,
      peak: 0,
      peakIndex: -1
    };

    minuteChart = new Chart(
      $("#minuteChart"),
      {
        type: "line",

        data: {
          labels:
            minute.labels || [],

          datasets: [
            {
              label: "コメント/分",

              data:
                minute.values || [],

              tension: 0.25,

              fill: false
            }
          ]
        },

        options: {
          scales: {

            x: {
              ticks: {
                color: "#9aa4b5"
              }
            },

            y: {
              beginAtZero: true,

              ticks: {
                color: "#9aa4b5"
              }
            }
          },

          plugins: {
            legend: {
              labels: {
                color: "#fff"
              }
            }
          }
        }
      }
    );

    if ($("#minuteStats")) {
      $("#minuteStats").innerHTML = `
        平均
        <b>${Number(
          minute.average || 0
        )}</b>
        コメント/分

        ・

        最大
        <b>${Number(
          minute.peak || 0
        )}</b>
        コメント/分
      `;
    }

    const pi =
      Number(minute.peakIndex);

    if (
      $("#peak") &&
      pi >= 0 &&
      minute.labels &&
      minute.labels[pi] !== undefined
    ) {

      $("#peak").innerHTML = `
        <b>
          ${esc(minute.labels[pi])}
        </b>
        に
        <b>
          ${Number(minute.peak || 0)}
        </b>
        コメント/分でした。
      `;

    } else if ($("#peak")) {

      $("#peak").textContent =
        "データがありません。";
    }

    /* 急増 */

    if ($("#spikes")) {

      const vals =
        minute.values || [];

      const avg =
        Number(minute.average || 0);

      const spikes =
        vals
          .map((v, i) => ({
            v: Number(v),
            i
          }))
          .filter(x =>
            avg &&
            x.v >= avg * 2
          )
          .slice(-5);

      $("#spikes").innerHTML =
        spikes.length
          ? spikes
              .map(x => `
                🚨
                ${esc(
                  minute.labels[x.i]
                )}：
                ${x.v}件
                （平均の${(
                  x.v / avg
                ).toFixed(1)}倍）
              `)
              .join("<br>")
          : "大きな急増は見つかりませんでした。";
    }
  }

  /* =========================
     ユーザーランキング
  ========================= */

  renderUsers();

  renderRanking();
}

/* =========================
   ユーザー表示
========================= */

function renderUsers() {

  if (!DATA || !$("#userPreview")) {
    return;
  }

  const users =
    DATA.analysis?.users || [];

  $("#userPreview").innerHTML =
    users
      .slice(0, 5)
      .map((u, i) => `
        <div class="rank">

          <div class="num">
            ${i + 1}
          </div>

          <div>

            <b>
              ${esc(u.name)}
            </b>

            <div class="sub">
              連投最大
              ${Number(
                u.maxStreak || 0
              )}

              ・平均
              ${Number(
                u.averageLength || 0
              )}文字
            </div>

          </div>

          <b>
            ${Number(
              u.count || 0
            ).toLocaleString()}件
          </b>

        </div>
      `)
      .join("")
      ||
      "データがありません。";
}

/* =========================
   期間ボタン
   今日 / 7日 / 30日 / 全期間
========================= */

$$(".filter").forEach(button => {

  button.addEventListener(
    "click",
    () => {

      $$(".filter").forEach(x => {
        x.classList.remove("active");
      });

      button.classList.add("active");

      period =
        button.textContent.trim();

      renderRanking();
    }
  );

});

/* =========================
   ランキングタブ
========================= */

$$(".tab").forEach(button => {

  button.addEventListener(
    "click",
    () => {

      $$(".tab").forEach(x => {
        x.classList.remove("active");
      });

      button.classList.add("active");

      rankType =
        button.dataset.rank ||
        "comments";

      renderRanking();
    }
  );

});

/* =========================
   ランキング検索
========================= */

const rankSearch =
  $("#rankSearch");

if (rankSearch) {

  rankSearch.addEventListener(
    "input",
    renderRanking
  );

}

/* =========================
   ランキング表示
========================= */

function renderRanking() {

  if (!DATA) {
    return;
  }

  const users =
    DATA.analysis?.users || [];

  let rows =
    users.map(u => {

      let metric;

      if (rankType === "streak") {

        metric =
          Number(
            u.maxStreak || 0
          );

      } else {

        metric =
          Number(
            u.count || 0
          );
      }

      return {
        ...u,
        metric
      };

    });

  /* 大きい順 */

  rows.sort(
    (a, b) =>
      b.metric - a.metric
  );

  /* 検索 */

  const search =
    rankSearch
      ? rankSearch.value
          .trim()
          .toLowerCase()
      : "";

  rows =
    rows.filter(u => {

      if (!search) {
        return true;
      }

      return String(
        u.name || ""
      )
        .toLowerCase()
        .includes(search);
    });

  if (!$("#rankingList")) {
    return;
  }

  $("#rankingList").innerHTML =
    rows
      .slice(0, 100)
      .map((u, i) => `

        <div class="rank">

          <div class="num">
            ${i + 1}
          </div>

          <div>

            <b>
              ${esc(u.name)}
            </b>

            <div class="sub">

              コメント
              ${Number(
                u.count || 0
              ).toLocaleString()}

              ・連投最大
              ${Number(
                u.maxStreak || 0
              )}

              ・平均
              ${Number(
                u.averageLength || 0
              )}文字

            </div>

          </div>

          <b>
            ${Number(
              u.metric || 0
            ).toLocaleString()}
          </b>

        </div>

      `)
      .join("")
      ||
      "該当するユーザーがいません。";
}

/* =========================
   HTMLエスケープ
========================= */

function esc(s) {

  return String(
    s ?? ""
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

/* =========================
   初期画面
========================= */

show("home");
