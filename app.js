const $=id=>document.getElementById(id);
$("search").addEventListener("click", run);
$("channel").addEventListener("keydown", e=>{if(e.key==="Enter")run()});

async function run(){
  const channel=$("channel").value.trim();
  const apiKey=$("apiKey").value.trim();
  if(!channel) return setStatus("チャンネル名を入力してください。");

  $("search").disabled=true;
  $("result").hidden=true;
  setStatus("YouTubeから動画とコメントを取得しています…");

  try{
    const r=await fetch("/api/ranking",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...(apiKey?{"x-youtube-api-key":apiKey}:{})
      },
      body:JSON.stringify({
        channel,
        videoLimit:Number($("videoLimit").value),
        commentsPerVideo:Number($("commentsPerVideo").value)
      })
    });
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||"取得に失敗しました");

    $("thumb").src=data.channel.thumbnail||"";
    $("channelTitle").textContent=data.channel.title;
    $("summary").textContent=`${data.scannedVideos}動画・${data.totalComments}コメントを集計`;
    const box=$("ranking");
    box.innerHTML="";

    if(!data.ranking.length){
      box.innerHTML='<div class="empty">集計できるコメントがありませんでした。</div>';
    }else{
      data.ranking.forEach((x,i)=>{
        const row=document.createElement("div");
        row.className="rank";
        row.innerHTML=`<div class="num">${i+1}</div><div class="comment"></div><div class="count">${x.count.toLocaleString()}回</div>`;
        row.querySelector(".comment").textContent=x.text;
        box.appendChild(row);
      });
    }
    $("result").hidden=false;
    setStatus("");
  }catch(e){
    setStatus("⚠️ "+e.message);
  }finally{
    $("search").disabled=false;
  }
}
function setStatus(t){$("status").textContent=t}
