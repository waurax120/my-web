let DATA=null, pieChart=null, minuteChart=null, rankType="comments";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function show(id){
  $$(".screen").forEach(x=>x.classList.remove("active"));
  $("#" + id).classList.add("active");
  window.scrollTo(0,0);
}
$$("[data-screen]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.screen)));

$("#analyzeBtn").addEventListener("click", analyze);
$("#channelInput").addEventListener("keydown", e=>{if(e.key==="Enter") analyze()});

async function analyze(){
  const q=$("#channelInput").value.trim();
  if(!q){$("#error").textContent="チャンネル名を入力してください。";return}
  $("#error").textContent="分析中… YouTubeからデータを取得しています。";
  try{
    const r=await fetch("/api/analyze?q="+encodeURIComponent(q));
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||"取得に失敗しました");
    DATA=d; render(d); $("#error").textContent=""; show("analysis");
  }catch(e){$("#error").textContent=e.message}
}

function render(d){
  $("#channelCard").innerHTML=`
    <img src="${d.channel.thumbnail||""}" alt="">
    <div><h2>${esc(d.channel.title)}</h2>
    <div class="sub">${d.live ? "🔴 LIVE中" : "⚪ 現在LIVEなし"}　取得コメント ${d.totalComments.toLocaleString()}件</div>
    ${d.live?`<a href="${d.live.url}" target="_blank" rel="noopener" style="color:#79a0ff">YouTubeでLIVEを見る ↗</a>`:""}</div>`;

  $("#score").textContent=`${d.analysis.score} / 100`;
  $("#scoreText").textContent=d.analysis.score>=70?"連投傾向が高め":d.analysis.score>=40?"中程度":"低め";
  $("#rateText").innerHTML=`普通のチャット <b>${100-d.analysis.consecutiveRate}%</b>　/　連投チャット <b>${d.analysis.consecutiveRate}%</b>`;

  if(pieChart) pieChart.destroy();
  pieChart=new Chart($("#pie"),{type:"doughnut",data:{labels:["普通のチャット","連投チャット"],datasets:[{data:[d.analysis.normalCount,d.analysis.consecutiveCount]}]},options:{plugins:{legend:{labels:{color:"#fff"}}}}});

  if(minuteChart) minuteChart.destroy();
  minuteChart=new Chart($("#minuteChart"),{type:"line",data:{labels:d.minute.labels,datasets:[{label:"コメント/分",data:d.minute.values,tension:.25,fill:false}]},options:{scales:{x:{ticks:{color:"#9aa4b5"}},y:{beginAtZero:true,ticks:{color:"#9aa4b5"}}},plugins:{legend:{labels:{color:"#fff"}}}}});
  $("#minuteStats").innerHTML=`平均 <b>${d.minute.average}</b> コメント/分　・ 最大 <b>${d.minute.peak}</b> コメント/分`;

  const pi=d.minute.peakIndex;
  $("#peak").innerHTML=pi>=0?`<b>${d.minute.labels[pi]}</b> に <b>${d.minute.peak}</b> コメント/分でした。`:"データがありません。";
  const vals=d.minute.values;
  const avg=d.minute.average;
  const spikes=vals.map((v,i)=>({v,i})).filter(x=>avg && x.v>=avg*2).slice(-5);
  $("#spikes").innerHTML=spikes.length?spikes.map(x=>`🚨 ${d.minute.labels[x.i]}：${x.v}件（平均の${(x.v/avg).toFixed(1)}倍）`).join("<br>"):"大きな急増は見つかりませんでした。";

  $("#userPreview").innerHTML=d.analysis.users.slice(0,5).map((u,i)=>`<div class="rank"><div class="num">${i+1}</div><div><b>${esc(u.name)}</b><div class="sub">連投最大 ${u.maxStreak}・平均 ${u.averageLength}文字</div></div><b>${u.count.toLocaleString()}件</b></div>`).join("")||"データがありません。";
  renderRanking();
}

$$(".tab").forEach(b=>b.addEventListener("click",()=>{$$(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");rankType=b.dataset.rank;renderRanking()}));
$("#rankSearch").addEventListener("input",renderRanking);

function renderRanking(){
  if(!DATA)return;
  let rows=DATA.analysis.users.map(u=>({...u, metric:rankType==="streak"?u.maxStreak:u.count}));
  rows.sort((a,b)=>b.metric-a.metric);
  const q=$("#rankSearch").value.trim().toLowerCase();
  rows=rows.filter(u=>!q||u.name.toLowerCase().includes(q));
  $("#rankingList").innerHTML=rows.slice(0,100).map((u,i)=>`<div class="rank"><div class="num">${i+1}</div><div><b>${esc(u.name)}</b><div class="sub">コメント ${u.count}・連投最大 ${u.maxStreak}・平均 ${u.averageLength}文字</div></div><b>${u.metric.toLocaleString()}</b></div>`).join("")||"該当するユーザーがいません。";
}

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

show("home");