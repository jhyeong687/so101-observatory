const byId = id => document.getElementById(id);
const cameraOrder = ["wrist", "belly", "top"];
const source = "runs/";
const state = {mode:"live", endpoint:null, run:null, revision:0, fresh:false, lastFrame:null, lastSeen:0};
const timeKR = new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"});
const views = cameraOrder.map(name => byId(name).getContext("2d"));
const json = async (url, timeout=8000) => {
  const reply = await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(timeout),credentials:"omit",referrerPolicy:"no-referrer"});
  if (!reply.ok) throw new Error("요청 실패");
  return reply.json();
};
function signal(kind,label,note,time="") {
  byId("signal").dataset.status=kind;
  byId("signal").querySelector("span").textContent=label;
  if(byId("note").textContent!==note) byId("note").textContent=note;
  byId("frame-time").textContent=time;
}
function selectMode(mode) {
  state.mode=mode;
  byId("live-btn").setAttribute("aria-pressed",String(mode==="live"));
  byId("replay-btn").setAttribute("aria-pressed",String(mode==="replay"));
  byId("live-pane").hidden=mode!=="live";
  byId("replay-pane").hidden=mode!=="replay";
  if(mode==="live") byId("replay").pause();
}
byId("live-btn").onclick=()=>selectMode("live");
byId("replay-btn").onclick=()=>selectMode("replay");
byId("watch").onclick=()=>{
  selectMode("replay");
  byId("monitor").scrollIntoView();
  byId("replay").play().catch(()=>{});
};
function loadImage(url) {
  const im = new Image();
  im.src=url;
  return im.decode().then(()=>im);
}
function drawFrames(mosaic) {
  views.forEach((ctx,i)=>ctx.drawImage(mosaic,0,i*360,640,360,0,0,640,360));
}
async function showSavedFrame() {
  if(!state.run) return;
  const selection=state.revision;
  const last=[...state.run.decisions].reverse().find(step=>step.observation);
  if(!last) return;
  try {
    const im = await loadImage(source+state.run.id+"/"+last.observation);
    if(!state.fresh && selection===state.revision) drawFrames(im);
  } catch { /* The offline status remains visible without a saved frame. */ }
}
async function live() {
  let delay=480;
  try {
    if(document.hidden || state.mode!=="live"){delay=1000;return;}
    if(!state.endpoint) state.endpoint=(await json("live.json?t="+Date.now())).endpoint;
    const packet=await json(state.endpoint+"?t="+Date.now(),5000);
    if(packet.time!==state.lastFrame){state.lastSeen=performance.now();state.lastFrame=packet.time;}
    if(performance.now()-state.lastSeen>5500) throw new Error("오래된 프레임");
    const image=await loadImage("data:image/jpeg;base64,"+packet.jpeg);
    if(image.width!==640 || image.height!==1080) throw new Error("프레임 크기 오류");
    drawFrames(image);
    state.fresh=true;
    let label=packet.running?"실험 중":(packet.action==="finish"?"연결됨 · 실험 종료":"연결됨 · 대기");
    signal("online",label,packet.note,timeKR.format(new Date(packet.time))+" KST");
    delay=packet.running?180:1400;
  } catch {
    state.endpoint=null;
    state.fresh=false;
    signal("offline","오프라인",state.run?"선택한 실험의 마지막 저장 화면입니다.":"실시간 화면을 기다리는 중입니다.");
    await showSavedFrame();
    delay=4000;
  } finally {window.setTimeout(live,delay);}
}
function writeMetrics(result) {
  const root=byId("metrics");root.replaceChildren();
  const metrics=[["첫 상승",result.lifts_cm[0],"cm"],["재파지 후 상승",result.lifts_cm[1],"cm"],["중간 낙하",result.drops,"회"],["최종 왼쪽 이동",result.final_left_cm,"cm"]];
  for(const [label,value,unit] of metrics) {
    const row=root.insertRow();
    const th=document.createElement("th");
    th.scope="row";th.textContent=label;th.style.fontWeight="400";
    row.append(th);
    row.insertCell().textContent=value+" "+unit;
  }
}
async function writeRecoveryFigure(run,base,revision) {
  const wrapper=byId("recovery-figure");
  wrapper.hidden=true;
  const steps=run.decisions;
  const lifts=steps.filter(s=>s.command.action==="lift");
  const recovery=steps.find(s=>s.command.action==="aim" && lifts[0] && s.seq>lifts[0].seq);
  const next=s=>s && steps.find(step=>step.seq===s.seq+1);
  const selection=[[next(lifts[0]),"(a) 첫 상승"],[recovery,"(b) 낙하 후 재관측"],[next(lifts[1]),"(c) 재파지 후 상승"]];
  if(!run.result.landed_after_drop || run.result.lifts_cm[1]<=0 || selection.some(([s])=>!s?.observation)) return;
  try {
    const photos=await Promise.all(selection.map(async ([step,label])=>{
      const im=await loadImage(base+step.observation);
      const panel=document.createElement("div"),canvas=document.createElement("canvas"),text=document.createElement("span");
      canvas.width=420;canvas.height=250;
      canvas.setAttribute("aria-label",label+" 시점의 베이스 카메라 프레임");
      canvas.getContext("2d").drawImage(im,65,360+42,420,250,0,0,420,250);
      text.textContent=label;panel.append(canvas,text);
      return panel;
    }));
    if(revision!==state.revision) return;
    byId("recovery-frames").replaceChildren(...photos);wrapper.hidden=false;
  } catch { /* Individual observations remain available through the decision log. */ }
}
function writeDecisions(run,base) {
  const list=byId("steps");list.replaceChildren();
  byId("obs").hidden=true;
  byId("steps-count").textContent=run.decisions.length+"단계";
  for(const step of run.decisions) {
    const li=document.createElement("li"),button=document.createElement("button"),num=document.createElement("b");
    num.textContent=String(step.seq+1).padStart(2,"0");
    button.setAttribute("aria-pressed","false");
    button.append(num,document.createTextNode(step.command.note));
    button.onclick=()=>{
      list.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed","false");
      button.setAttribute("aria-pressed","true");
      byId("obs").hidden=!step.observation;
      if(step.observation) byId("step-img").src=base+step.observation;
    };
    li.append(button);list.append(li);
  }
  list.querySelector("button")?.click();
}
async function selectRun(id) {
  const revision=++state.revision;
  const base=source+id+"/";
  const run=await json(base+"result.json");
  if(revision!==state.revision) return;
  state.run=run;
  byId("run-meta").textContent=run.label+"   /   "+run.model;
  byId("run-title").textContent=run.title;
  const result=run.result;
  const recovered=result.drops===1 && result.landed_after_drop && result.lifts_cm[1]>0 && result.second_carry_cm>0 && result.final_left_cm>0 && result.released_on_floor;
  byId("outcome").textContent=recovered
    ? "블록을 한 차례 떨어뜨린 뒤 새 영상에서 다시 찾아 잡았다. 최종 위치는 시작점에서 왼쪽으로 "+result.final_left_cm+" cm였고, 집게를 물린 뒤 바닥 접촉을 확인했다."
    : "아래 표는 이 실행에서 기록한 물체 중심의 이동과 중간 낙하 횟수다.";
  byId("outcome").hidden=false;
  byId("replay").src=base+"replay.mp4";
  byId("download").href=base+"result.json";
  byId("movie-file").href=base+"replay.mp4";
  writeMetrics(result);writeDecisions(run,base);void writeRecoveryFigure(run,base,revision);
  if(!state.fresh && byId("signal").dataset.status==="offline") {
    signal("offline","오프라인","선택한 실험의 마지막 저장 화면입니다.");
    void showSavedFrame();
  }
}
async function loadRuns() {
  const runs=await json("runs/index.json?t="+Date.now());
  const select=byId("runs");
  const chosen=select.value;
  select.replaceChildren(...runs.map(r=>new Option(r.label,r.id)));
  if(chosen && runs.some(r=>r.id===chosen)) select.value=chosen;
  if(select.value && !state.run) await selectRun(select.value);
}
byId("runs").onchange=e=>selectRun(e.target.value).catch(()=>{byId("run-meta").textContent="기록을 불러오지 못했습니다.";});
async function refreshRuns(){
  try{if(!document.hidden) await loadRuns();}
  catch{if(!state.run) byId("run-meta").textContent="저장 기록을 기다리는 중입니다.";}
  setTimeout(refreshRuns,60000);
}
json("assets/joint-sweep.json").then(rows=>{
  for(const item of rows){
    const row=byId("joints").insertRow();
    [item.name,...[item.limits,item.measured].map(v=>v.map(x=>x+"°").join(" ~ "))].forEach(v=>row.insertCell().textContent=v);
  }
}).catch(()=>{});
void live();void refreshRuns();
