import fs from "node:fs/promises";
import { get, all, jobs } from "../store";
import { assetPath } from "../media";
import { signedMediaUrl } from "../auth";
import { stats } from "../service";
import type { Asset, Experiment } from "../model";
import type { LoopRun } from "./model";
import { stageLabels, stages } from "./model";
export type LoopView = {
  run: LoopRun;
  experiment: Experiment | null;
  actual: ReturnType<typeof stats> | null;
  media: { id: string; kind: Asset["kind"]; url: string }[];
  jobs: ReturnType<typeof jobs>;
};
export function loopView(id: string): LoopView {
  const run = get<LoopRun>("loop", id);
  if (!run) throw new Error("루프가 없습니다.");
  const e = run.experimentId
    ? get<Experiment>("experiment", run.experimentId)
    : undefined;
  const ids = [run.referenceAsset, run.hookAsset, e?.outputAsset].filter(
    (v): v is string => !!v,
  );
  return {
    run,
    experiment: e || null,
    actual: e ? stats(e.id) : null,
    media: [...new Set(ids)].map((id) => {
      const a = get<Asset>("asset", id)!;
      return { id, kind: a.kind, url: signedMediaUrl(id) };
    }),
    jobs: jobs().filter((j) => j.experimentId === run.experimentId),
  };
}
export async function exportLoop(id: string) {
  const primary = loopView(id);
  const related = all<LoopRun>("loop")
    .filter((r) => r.rootId === primary.run.rootId && r.id !== id)
    .sort((a, b) => a.round - b.round)
    .map((r) => loopView(r.id));
  let bytes = 0;
  const cache = new Map<string, string>();
  for (const view of [primary, ...related]) {
    for (const media of view.media) {
      if (cache.has(media.id)) {
        media.url = cache.get(media.id)!;
        continue;
      }
      const file = await fs.readFile(assetPath(media.id));
      bytes += file.length;
      media.url =
        bytes > 28 * 1024 * 1024
          ? ""
          : `data:${media.kind === "reference" ? "image/jpeg" : "video/mp4"};base64,${file.toString("base64")}`;
      cache.set(media.id, media.url);
    }
  }
  return exportedViewer(primary, related);
}
export function exportedViewer(snapshot: LoopView, related: LoopView[] = []) {
  const data = JSON.stringify({ snapshot, related }).replace(/</g, "\\u003c");
  const labels = JSON.stringify(stageLabels);
  const order = JSON.stringify(stages);
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UGC-Z · GTM Loop 실행 기록</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f7f5;color:#1d302c;font-family:Arial,"Noto Sans KR",sans-serif}main{max-width:1240px;margin:auto;padding:30px 24px}header{display:flex;justify-content:space-between;font-size:14px;border-bottom:1px solid #ccd9d1;padding-bottom:22px}h1{font-size:38px;letter-spacing:-.055em;margin:32px 0 14px}p{line-height:1.7}.notice{padding:15px 20px;background:#fff4df;border-left:3px solid #af7b28;font-size:13px}.flow{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:25px 0}.node{border:1px solid #d5e0d9;background:white;text-align:left;padding:18px 15px;border-radius:7px;cursor:pointer;color:inherit;font:inherit;min-height:104px}.node.active{border:2px solid #168e75;background:#effbf5;padding:17px 14px}.node small{display:block;color:#6a7d75;font-size:11px;margin-bottom:12px}.node strong{font-size:14px}.node span{display:block;font-size:11px;color:#23816a;margin-top:8px}.layout{display:grid;grid-template-columns:1fr 300px;gap:22px}.panel{padding:28px;background:#fff;border:1px solid #d5e0d9;border-radius:8px;min-width:0}h2{font-size:23px;margin:0 0 15px}h3{font-size:16px;margin-top:26px}small{color:#6a7d75}.row{padding:15px 0;border-top:1px solid #e3e9e5}.row p{font-size:13px;margin:8px 0}a{color:#18745f;overflow-wrap:anywhere}.check{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #eef1ee;font-size:12px;gap:20px}.checks{margin-top:15px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 monospace;background:#f5f8f5;padding:18px;border-radius:5px;max-height:700px;overflow:auto}img,video{max-width:100%;max-height:430px;display:block;background:#172723;border-radius:6px;margin:20px auto}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.stats div{padding:14px;border-left:1px solid #d5e0d9}.stats strong{font:30px monospace;display:block;margin-top:12px}.stats span{font-size:11px}.history{font-size:12px;max-height:760px;overflow:auto}.history p{border-left:2px solid #b5d0c2;padding-left:12px}.toolbar{display:flex;gap:8px;margin-top:20px}button.control{padding:10px 14px;background:#173e33;color:white;border:0;border-radius:5px;cursor:pointer}.caption{font-size:12px;color:#6a7d75} @media(max-width:760px){.flow{grid-template-columns:repeat(2,1fr)}.layout{grid-template-columns:1fr}h1{font-size:28px}.panel{padding:20px}.stats{gap:4px}.stats div{padding:10px}}</style><main><header><strong>UGC-Z / GTM LOOP</strong><span>실행 기록 · 읽기 전용</span></header><h1>고객의 불편에서, 다음 고객까지.</h1><p>노드를 눌러 조사 근거·바이너리 판정·페르소나·영상·성과·다음 결정을 확인하세요.</p><div id="notice" class="notice"></div><div class="toolbar"><label>라운드 <select id="round"></select></label><button class="control" id="play">단계별로 보기</button><button class="control" id="pause">멈춤</button></div><div id="flow" class="flow"></div><div class="layout"><section id="detail" class="panel"></section><aside class="panel"><h2>실제 트랙션</h2><div id="stats"></div><h3>실행 로그</h3><div id="history" class="history"></div></aside></div><p class="caption">내보낸 시점의 기록입니다. 이 파일에서 생성 요청이나 실제 SNS 게시는 실행되지 않습니다.</p></main><script>
const archive=${data},labels=${labels},order=${order};const records=[archive.snapshot,...archive.related].sort((a,b)=>a.run.round-b.run.round);let data=records[0],selected=0,timer;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status={pending:'대기',running:'실행 중',succeeded:'완료',blocked:'연결·검토 필요',waiting:'관측·처리 대기',failed:'실패',needs_attention:'원격 결과 확인'};
const media=id=>data.media.find(m=>m.id===id);
const preview=id=>{const m=media(id);if(!m||!m.url)return '';return m.kind==='reference'?'<img alt="페르소나 이미지" src="'+m.url+'">':'<video controls preload="metadata" src="'+m.url+'"></video>';};
function show(i){selected=i;const step=data.run.steps[i],stage=step.stage;document.querySelectorAll('.node').forEach((n,k)=>n.classList.toggle('active',k===i));let html='<small>STEP '+String(i+1).padStart(2,'0')+' / '+esc(status[step.status])+'</small><h2>'+esc(labels[stage])+'</h2><p>'+esc(step.message||'아직 실행되지 않은 단계입니다.')+'</p>';
if(stage==='research')html+=(data.run.sources||[]).map(s=>'<div class="row"><a target="_blank" rel="noreferrer" href="'+esc(s.url)+'">'+esc(s.title)+'</a><p>'+esc(s.text.slice(0,450))+'</p><small>'+esc(s.publishedAt||'게시 날짜 미확인')+' · '+esc(s.provenance)+'</small></div>').join('');
if(stage==='qualify')html+=(data.run.signals||[]).map(s=>'<div class="row"><strong>'+esc(s.qualified?'통과':'보류·제외')+'</strong><p>'+esc(s.quote)+'</p><div class="checks">'+s.checks.map(c=>'<div class="check"><span>'+esc(c.name)+'</span><b>'+esc(c.verdict)+'</b></div>').join('')+'</div></div>').join('');
if(stage==='persona')html+=preview(data.run.referenceAsset);if(stage==='intro')html+=preview(data.run.hookAsset);if(stage==='compose')html+=preview(data.experiment?.outputAsset);
if(stage==='strategy'&&data.run.plan){html+='<h3>선정한 고객</h3><p>'+esc(data.run.plan.segment)+'</p><h3>가상 페르소나</h3><p>'+esc(data.run.plan.persona.name)+' · '+esc(data.run.plan.persona.context)+'</p><p>'+esc(data.run.plan.persona.creativeChoices)+'</p>';}
if(stage==='learn'&&data.run.decision)html+='<h3>다음 결정</h3><p>'+esc(data.run.decision.reason)+'</p>';
html+='<h3>단계 입력</h3><pre>'+esc(JSON.stringify(step.input??{},null,2))+'</pre><h3>단계 결과</h3><pre>'+esc(JSON.stringify(step.output??{},null,2))+'</pre>';document.getElementById('detail').innerHTML=html;}
function renderFrame(){document.getElementById('notice').textContent=data.run.mode==='test'?'검증 리플레이: 외부 검색·AI 생성·게시·고객 이벤트는 테스트 응답입니다. 실제 고객 트랙션은 0이며 제작 흐름 검증과 구분합니다.':'라이브 실행 기록입니다. 연결 필요·관찰 대기는 성공으로 계산하지 않습니다.';
document.getElementById('flow').innerHTML=order.map((s,i)=>'<button class="node" data-index="'+i+'"><small>'+String(i+1).padStart(2,'0')+'</small><strong>'+esc(labels[s])+'</strong><span>'+esc(status[data.run.steps[i].status])+'</span></button>').join('');
document.querySelectorAll('.node').forEach(n=>n.addEventListener('click',()=>show(Number(n.dataset.index))));
const actual=data.actual||{clicks:0,activated:0,repeated:0};document.getElementById('stats').innerHTML='<div class="stats">'+[['방문',actual.clicks],['신규 활성',actual.activated],['7일 재사용',actual.repeated]].map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+(data.run.mode==='test'?'<p class="caption">테스트 성과는 아래 학습 단계에서만 별도로 표시됩니다.</p>':'');
document.getElementById('history').innerHTML=data.run.history.map(h=>'<p><small>'+new Date(h.at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'})+' · '+esc(labels[h.stage])+'</small><br>'+esc(h.message)+'</p>').join('');
show(0);}
document.getElementById('round').innerHTML=records.map((r,i)=>'<option value="'+i+'">'+r.run.round+'라운드</option>').join('');document.getElementById('round').onchange=e=>{clearInterval(timer);data=records[Number(e.target.value)];renderFrame();};renderFrame();
document.getElementById('play').onclick=()=>{clearInterval(timer);show(0);timer=setInterval(()=>{if(selected>=9){clearInterval(timer);return;}show(selected+1);},2500);};document.getElementById('pause').onclick=()=>clearInterval(timer);show(0);
</script></html>`;
}
