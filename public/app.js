let DATA = null;
let pieChart = null;
let minuteChart = null;
let period = "all";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function show(id) {
  $$(".screen").forEach(x => x.classList.remove("active"));
  $("#" + id).classList.add("active");
  window.scrollTo(0, 0);
}

$$("[data-screen]").forEach(b => {
  b.addEventListener("click", () => show(b.dataset.screen));
});

$("#analyzeBtn").addEventListener("click", analyze);

$("#channelInput").addEventListener("keydown", e => {
  if (e.key === "Enter") analyze();
});

async function analyze() {
  const q = $("#channelInput").value.trim();

  if (!q) {
    $("#error").textContent = "チャンネル名を入力してください。";
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
      throw new Error(d.error || "取得に失敗しました");
    }

    DATA = d;

    render(d);

    $("#error").textContent = "";

    show("analysis");

  } catch (e) {
    $("#error").textContent =
      e.message || "エラーが発生しました。";
  }
}

function render(d) {

  $("#channelCard").innerHTML = `
    <img src="${d.channel.thumbnail || ""}" alt="">
    <div>
      <h2>${esc(d.channel.title)}</h2>

      <div class="sub">
        ${d.live ? "🔴 LIVE中" : "⚪ 現在LIVEなし"}
       　
        取得コメント ${Number(d.totalComments || 0).toLocaleString()}件
      </div>

      ${
        d.live
          ? `
            <a
              href="${d.live.url}"
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

  const score = Number(d.analysis?.score || 0);
  const consecutiveRate =
    Number(d.analysis?.consecutiveRate || 0);

  $("#score").textContent = `${score} / 100`;

  $("#scoreText").textContent =
    score >= 70
      ? "連投傾向が高め"
      : score >= 40
        ? "中程度"
        : "低め";

  $("#rateText").innerHTML = `
    普通のチャット
    <b>${100 - consecutiveRate}%</b>
   　
    連投チャット
    <b>${consecutiveRate}%</b>
  `;

  if (pieChart) {
    pieChart.destroy();
  }

  pieChart = new Chart($("#pie"), {
    type: "doughnut",

    data: {
      labels: [
        "普通のチャット",
        "連投チャット"
      ],

      datasets: [
        {
          data: [
            Number(d.analysis?.normalCount || 0),
            Number(d.analysis?.consecutiveCount || 0)
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
  });

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

  minuteChart = new Chart($("#minuteChart"), {
    type: "line",

    data: {
      labels: minute.labels,

      datasets: [
        {
          label: "コメント/分",
          data: minute.values,
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
  });

  $("#minuteStats").innerHTML = `
    平均 <b>${minute.average}</b> コメント/分
    ・ 最大 <b>${minute.peak}</b> コメント/分
  `;

  const pi = Number(minute.peakIndex);

  if (pi >= 0 && minute.labels[pi] !== undefined) {
    $("#peak").innerHTML = `
      <b>${minute.labels[pi]}</b>
      に
      <b>${minute.peak}</b>
      コメント/分でした。
    `;
  } else {
    $("#peak").textContent =
      "データがありません。";
  }

  const vals = minute.values || [];
  const avg = Number(minute.average || 0);

  const spikes = vals
    .map((v, i) => ({
      v: Number(v),
      i
    }))
    .filter(x => avg && x.v >= avg * 2)
    .slice(-5);

  $("#spikes").innerHTML =
    spikes.length
      ? spikes
          .map(x => `
            🚨 ${minute.labels[x.i]}：
            ${x.v}件
            （平均の${(x.v / avg).toFixed(1)}倍）
          `)
          .join("<br>")
      : "大きな急増は見つかりませんでした。";

  const users = d.analysis?.users || [];

  $("#userPreview").innerHTML =
    users
      .slice(0, 5)
      .map((u, i) => `
        <div class="rank">
          <div class="num">${i + 1}</div>

          <div>
            <b>${esc(u.name)}</b>

            <div class="sub">
              連投最大 ${Number(u.maxStreak || 0)}
              ・平均 ${Number(u.averageLength || 0)}文字
            </div>
          </div>

          <b>
            ${Number(u.count || 0).toLocaleString()}件
          </b>
        </div>
      `)
      .join("")
      || "データがありません。";

  renderRanking();
}

$$(".tab").forEach(b => {
  b.addEventListener("click", () => {

    $$(".tab").forEach(x =>
      x.classList.remove("active")
    );

    b.classList.add("active");

    rankType = b.dataset.rank;

    renderRanking();
  });
});

$("#rankSearch").addEventListener(
  "input",
  renderRanking
);

function renderRanking() {

  if (!DATA) return;

  const users =
    DATA.analysis?.users || [];

  let rows = users.map(u => ({
    ...u,

    metric:
      rankType === "streak"
        ? Number(u.maxStreak || 0)
        : Number(u.count || 0)
  }));

  rows.sort((a, b) =>
    b.metric - a.metric
  );

  const q =
    $("#rankSearch").value
      .trim()
      .toLowerCase();

  rows = rows.filter(u =>
    !q ||
    String(u.name || "")
      .toLowerCase()
      .includes(q)
  );

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
              コメント ${Number(u.count || 0)}
              ・連投最大 ${Number(u.maxStreak || 0)}
              ・平均 ${Number(u.averageLength || 0)}文字
            </div>

          </div>

          <b>
            ${Number(u.metric || 0).toLocaleString()}
          </b>

        </div>
      `)
      .join("")
    || "該当するユーザーがいません。";
}

function esc(s) {

  return String(s ?? "").replace(
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

show("home");
