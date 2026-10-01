import express from "express";
import fs from "fs";import path from "path";import OpenAI from "openai";
import pg from "pg";
import {randomBytes} from "node:crypto";
import {calculateSaju} from "./saju.js";
import {confirmPayment} from "./payment.js";
const app=express();app.use(express.json());
app.use((req,res,next)=>{res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Headers","Content-Type");res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");if(req.method==="OPTIONS")return res.sendStatus(204);next()});
const ai=process.env.OPENAI_API_KEY?new OpenAI({apiKey:process.env.OPENAI_API_KEY}):null;
const getPin=()=>process.env.ADMIN_PIN||null;
const validPin=p=>Boolean(getPin())&&String(p)===String(getPin());


// V25.9.21 Interpretation Engine V2: deterministic evidence packs are supplied to AI
// so each reading starts from card/saju-specific signals instead of generic prose.
const MAJOR_V2={
"바보":"경험보다 가능성을 먼저 보는 카드. 생활장면: 계획을 완성하기 전에 먼저 움직임, 새 관계·새 일의 첫 신호에 마음이 빨리 열림. 역방향은 시작 충동과 현실 점검의 엇박자.",
"마법사":"이미 가진 수단을 조합해 먼저 시도하는 카드. 생활장면: 연락 문구·도구·정보를 직접 정리해 판을 만듦. 역방향은 말과 실행의 간격, 보여주기와 실제 준비의 차이.",
"여사제":"말보다 미묘한 신호와 침묵을 읽는 카드. 생활장면: 답장 속도·말투·눈치·분위기를 반복 해석하고 확신 전까지 속마음을 보류함. 역방향은 직관과 불안의 혼동, 너무 많은 의미 부여.",
"여제":"돌봄·편안함·성장을 키우는 카드. 생활장면: 상대를 챙기고 분위기를 좋게 만드는 행동, 시간·돈·정성을 쓰며 관계를 키움. 역방향은 과잉 돌봄·인정 욕구·자기 몫 소진.",
"황제":"경계·질서·책임을 세우는 카드. 생활장면: 일정·기준·역할을 명확히 하고 애매함을 오래 두지 않음. 역방향은 통제 과잉 또는 기준은 강한데 실행 구조가 흔들림.",
"교황":"검증된 방식·약속·가치관을 중시하는 카드. 생활장면: 주변 조언이나 관계의 공식성, 절차와 예의를 확인함. 역방향은 남의 기준과 내 기준의 충돌.",
"연인":"끌림만이 아니라 가치가 걸린 선택의 카드. 생활장면: 관계를 택하면 다른 가능성을 내려놓아야 하는 순간, 말과 행동의 일치 확인. 역방향은 끌림과 선택의 불일치.",
"전차":"방향을 정한 뒤 속도를 붙이는 카드. 생활장면: 목표를 정하면 연락·실행을 연달아 밀어붙임. 역방향은 속도는 있는데 방향 합의가 부족하거나 제동이 걸림.",
"힘":"세게 밀기보다 감정을 다루는 힘의 카드. 생활장면: 화나도 바로 터뜨리지 않고 말의 수위를 조절함. 역방향은 참는 힘이 소진되어 사소한 신호에도 흔들림.",
"은둔자":"외부 답보다 혼자 검토해 자기 답을 찾는 카드. 생활장면: 연락을 줄이고 혼자 정리, 자료·기억을 다시 살핌. 역방향은 성찰이 고립이나 과도한 생각으로 길어짐.",
"운명의 수레바퀴":"내 통제 밖의 타이밍과 변화가 개입하는 카드. 생활장면: 예상 밖 연락·일정변경·우연한 기회에 계획을 조정. 역방향은 같은 패턴 반복과 타이밍 지연.",
"정의":"감정보다 사실·균형·책임을 대조하는 카드. 생활장면: 누가 무엇을 했는지, 조건이 공평한지 따져봄. 역방향은 판단 기준이 흔들리거나 한쪽 정보에 치우침.",
"매달린 사람":"당장 결론보다 멈춰 다른 각도를 보는 카드. 생활장면: 행동을 보류하고 상대·상황을 관찰. 역방향은 기다림이 의미 있는 보류가 아니라 정체로 변함.",
"죽음":"낡은 방식의 종료와 전환 카드. 생활장면: 계속 끌던 관계·습관·계획을 같은 방식으로 유지하지 않기로 함. 역방향은 끝낼 것을 붙잡아 전환이 늦어짐.",
"절제":"속도·감정·생활 리듬을 섞어 맞추는 카드. 생활장면: 한 번에 결론내기보다 연락·거리·일정을 조금씩 조율. 역방향은 리듬 차이가 커져 과하거나 부족해짐.",
"악마":"알면서도 반복하는 끌림·집착·보상의 카드. 생활장면: 확인하지 않으려 해도 메시지·가격·반응을 다시 확인, 끊겠다고 해도 같은 패턴 복귀. 역방향은 그 고리를 알아차리고 거리두기 시작.",
"탑":"유지하던 전제가 깨져 재정비하는 카드. 생활장면: 예상 밖 말·사실·변경으로 기존 계획을 다시 짬. 역방향은 이미 균열을 느끼지만 큰 충돌을 피하려 버팀.",
"별":"상처 뒤 다시 기대를 세우는 카드. 생활장면: 당장 결과보다 가능성을 믿고 천천히 공개·회복. 역방향은 희망은 있지만 비교·실망 때문에 자신감이 흔들림.",
"달":"정보가 부족한데 감정과 상상이 빈칸을 채우는 카드. 생활장면: 답장·표정 하나에 여러 해석을 붙임. 역방향은 안개가 걷히며 사실과 추측을 분리하기 시작.",
"태양":"숨기기보다 드러내고 확인하는 카드. 생활장면: 말이 직접적이고 함께 있을 때 반응이 분명해짐. 역방향은 좋은 흐름은 있으나 기대만큼 선명하지 않거나 과한 낙관.",
"심판":"미뤄둔 답을 다시 불러 최종 판단하는 카드. 생활장면: 과거 대화·결정을 재검토하고 이제는 답을 내리려 함. 역방향은 결론을 알면서도 자기 판단을 믿지 못해 미룸.",
"세계":"한 사이클을 완성하고 다음 단계로 넘어가는 카드. 생활장면: 마무리·공식화·완결 후 새 단계 준비. 역방향은 거의 끝났지만 마지막 확인이나 마감이 남음."
};
const SUIT_V2={
"완드":"행동·속도·욕구·경쟁. 생활에서는 먼저 연락하기, 시작하기, 밀어붙이기, 일정과 추진력으로 드러남.",
"컵":"감정·관계·교감·기대. 생활에서는 말투와 반응, 서운함, 친밀감, 감정 확인으로 드러남.",
"소드":"생각·말·판단·갈등. 생활에서는 메시지 문구, 반복 검토, 사실 확인, 결론과 대화 방식으로 드러남.",
"펜타클":"돈·시간·몸·현실 조건. 생활에서는 가격·일정·지속가능성·실제 행동과 약속 이행으로 드러남."
};
const RANK_V2={"에이스":"씨앗·첫 행동","2":"두 선택·균형","3":"확장·협업·초기 결과","4":"유지·고정·보호","5":"마찰·부족·경쟁","6":"조정·회복·주고받음","7":"점검·버팀·전략","8":"반복·속도·숙련","9":"누적·마지막 부담·자립","10":"완결·과부하·결과","페이지":"호기심·메시지·초기 학습","기사":"행동 방식·추진","퀸":"내면화된 성숙한 방식","킹":"통제·책임·결정"};
function tarotEvidence(card,reversed){
 const c=String(card||""); if(MAJOR_V2[c]) return `${MAJOR_V2[c]} ${reversed?"이번에는 역방향의 지연·과잉·내적 충돌을 우선한다.":"이번에는 정방향의 건설적 표현을 우선한다."}`;
 const suit=Object.keys(SUIT_V2).find(x=>c.includes(x)); const rank=Object.keys(RANK_V2).find(x=>c.includes(x));
 return `${suit?SUIT_V2[suit]:"카드의 고유 상징을 우선한다."} ${rank?`숫자/인물 단계: ${RANK_V2[rank]}.`:""} ${reversed?"역방향이므로 막힘·과잉·내면화·지연 중 질문에 맞는 축을 선택한다.":"정방향이므로 자연스러운 발현과 진행을 우선한다."}`;
}
const ELEMENT_BEHAVIOR={목:"시작·확장·관계망을 넓히려는 힘",화:"표현·속도·가시성과 즉각 반응",토:"유지·책임·현실 점검과 버티는 힘",금:"기준·정리·선택과 경계 설정",수:"관찰·정보·유연성·속생각"};
const GOD_BEHAVIOR={비견:"내 기준과 독립성, 직접 책임지려는 성향",겁재:"경쟁·속도·주도권과 사람 사이 자원 배분",식신:"꾸준한 생산·생활 감각·내 방식의 표현",상관:"직설·개선 욕구·틀을 바꾸려는 표현",편재:"기회 포착·외부 활동·돈과 사람의 빠른 회전",정재:"계획적 관리·예측 가능한 수입지출·책임",편관:"압박 속 실행·책임·긴장과 자기통제",정관:"규칙·신뢰·역할·공식적인 책임",편인:"직관·독특한 관점·혼자 깊게 파고듦",정인:"확인·학습·보호·충분히 이해한 뒤 움직임"};
function sajuEvidence(saju){
 const counts=saju?.counts||{}; const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
 const top=sorted.slice(0,2).map(([e,n])=>`${e} ${n}: ${ELEMENT_BEHAVIOR[e]||""}`).join(" / ");
 const low=sorted.filter(([,n])=>n===0).map(([e])=>`${e}: ${ELEMENT_BEHAVIOR[e]||""}`).join(" / ");
 const gods=[]; for(const t of saju?.tenGods||[]){if(t?.stem&&t.stem!=="일간")gods.push(t.stem); for(const b of t?.branch||[]) if(b?.god)gods.push(b.god)}
 const freq={}; gods.forEach(g=>freq[g]=(freq[g]||0)+1); const topGods=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([g,n])=>`${g}(${n}): ${GOD_BEHAVIOR[g]||"전통적 역할 신호"}`).join(" / ");
 const luck=saju?.luck?.periods||[]; const now=new Date().getFullYear(); const current=luck.find(x=>x.startYear<=now&&x.endYear>=now); const next=luck.find(x=>x.startYear>now);
 return `일간 ${saju?.dayMaster||"미상"}(${saju?.dayElement||""}). 오행에서 상대적으로 두드러진 축: ${top||"자료 부족"}. 비어 있거나 낮은 축은 결핍 단정이 아니라 의식적으로 보완하는 영역으로만 해석: ${low||"없음"}. 반복 십성 신호: ${topGods||"자료 부족"}. 현재 대운: ${current?`${current.ganZhi} ${current.startYear}-${current.endYear}`:"자료 없음"}; 다음 대운: ${next?`${next.ganZhi} ${next.startYear}-${next.endYear}`:"자료 없음"}. 이 팩은 전통 명리의 해석 보조 신호이며 성격·미래의 과학적 측정값이 아니다.`;
}

const defaultSettings={storeName:"오늘의 운세",idleSeconds:120,prices:{saju:5000,tarot:5000,premium:9000,couple:7000},paymentProvider:"mock",resultRetentionDays:30,autoCleanup:true};
const usePg=Boolean(process.env.DATABASE_URL);
const pool=usePg?new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000}):null;
const filePath=name=>path.resolve("server",name+".json");
const defaults={settings:defaultSettings,sales:[],results:{}};
const clone=x=>JSON.parse(JSON.stringify(x));
async function getData(name){
 if(pool){const r=await pool.query("SELECT value FROM kiosk_data WHERE name=$1",[name]);return r.rows.length?r.rows[0].value:clone(defaults[name]);}
 const f=filePath(name);return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):clone(defaults[name]);
}
async function putData(name,value){
 if(pool){await pool.query("INSERT INTO kiosk_data(name,value) VALUES($1,$2::jsonb) ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value",[name,JSON.stringify(value)]);return;}
 fs.writeFileSync(filePath(name),JSON.stringify(value,null,2));
}
const read=()=>getData("results"),save=d=>putData("results",d);
const readSettings=()=>getData("settings"),writeSettings=d=>putData("settings",d);
const readSales=()=>getData("sales"),writeSales=d=>putData("sales",d);
function asyncRoute(fn){return (req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next)}
app.get("/api/health",(q,s)=>s.json({ok:true,version:"25.9.21",ai:!!ai,storage:usePg?"postgres":"local"}));
app.get("/api/settings",asyncRoute(async(q,s)=>s.json(await readSettings())));
async function cleanupResults(){
 const cfg=await readSettings();if(!cfg.autoCleanup)return 0;
 const days=Math.max(1,Number(cfg.resultRetentionDays||30)),cut=Date.now()-days*86400000,d=await read();let n=0;
 for(const [k,v] of Object.entries(d)){if(v.createdAt&&new Date(v.createdAt).getTime()<cut){delete d[k];n++}}
 if(n)await save(d);return n;
}
app.post("/api/admin/change-pin",(q,s)=>{if(!validPin(q.body.pin))return s.status(401).json({ok:false});const np=String(q.body.newPin||"");if(!/^\d{4,8}$/.test(np))return s.status(400).json({ok:false,error:"PIN은 숫자 4~8자리"});return s.status(400).json({ok:false,error:"Render Environment의 ADMIN_PIN에서 변경하세요."})});
app.post("/api/admin/restore",asyncRoute(async(q,s)=>{if(!validPin(q.body.pin))return s.status(401).json({ok:false});const b=q.body.backup;if(!b||typeof b!=="object")return s.status(400).json({ok:false});if(b.settings)await writeSettings(b.settings);if(Array.isArray(b.sales))await writeSales(b.sales);if(b.results&&typeof b.results==="object")await save(b.results);s.json({ok:true})}));
app.post("/api/admin/cleanup",asyncRoute(async(q,s)=>{if(!validPin(q.body.pin))return s.status(401).json({ok:false});s.json({ok:true,deleted:await cleanupResults()})}));
setInterval(()=>cleanupResults().catch(e=>console.error("[CLEANUP]",e)),6*60*60*1000);
app.post("/api/admin/settings",asyncRoute(async(q,s)=>{if(!validPin(q.body.pin))return s.status(401).json({ok:false});const cur=await readSettings();const next={...cur,...q.body.settings,prices:{...cur.prices,...(q.body.settings?.prices||{})}};await writeSettings(next);s.json({ok:true,settings:next})}));
app.post("/api/admin/clear-results",asyncRoute(async(q,s)=>{if(!validPin(q.body.pin))return s.status(401).json({ok:false});await save({});s.json({ok:true})}));
app.post("/api/admin/clear-sales",asyncRoute(async(q,s)=>{if(!validPin(q.body.pin))return s.status(401).json({ok:false});await writeSales([]);s.json({ok:true})}));
app.post("/api/admin/export",asyncRoute(async(q,s)=>{if(!validPin(q.body.pin))return s.status(401).json({ok:false});s.json({ok:true,exportedAt:new Date().toISOString(),settings:await readSettings(),sales:await readSales(),results:await read()})}));
app.post("/api/admin/login",(q,s)=>s.json({ok:validPin(q.body.pin)}));
app.post("/api/payment/confirm",asyncRoute(async(q,s)=>{
 const result=await confirmPayment(q.body);
 if(result.ok){
   const sales=await readSales();sales.push({orderId:q.body.orderId,amount:Number(q.body.amount||0),product:q.body.product||"",createdAt:new Date().toISOString()});await writeSales(sales);
 }
 s.json(result);
}));
app.post("/api/admin/stats",asyncRoute(async(q,s)=>{
 if(!validPin(q.body.pin))return s.status(401).json({ok:false});
 const sales=await readSales(),now=new Date();
 const day=sales.filter(x=>new Date(x.createdAt).toDateString()===now.toDateString());
 const month=sales.filter(x=>{const d=new Date(x.createdAt);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()});
 s.json({ok:true,totalCount:sales.length,totalRevenue:sales.reduce((a,x)=>a+x.amount,0),dayCount:day.length,dayRevenue:day.reduce((a,x)=>a+x.amount,0),monthCount:month.length,monthRevenue:month.reduce((a,x)=>a+x.amount,0),recent:sales.slice(-20).reverse()});
}));
app.post("/api/saju",(q,s)=>{try{s.json({ok:true,...calculateSaju(q.body)})}catch(e){s.status(400).json({ok:false,error:"생년월일/시간을 확인하세요."})}});
app.post("/api/ai-reading",async(req,res)=>{
 const {kind,name,birth,time,card,reversed,saju,tier,person1,person2,dailyMetrics}=req.body;
 const fallback=kind==="tarot"?`${card}의 상징을 오늘의 상황에 비추어 차분히 살펴보세요.`:`${name||"고객"}님의 운세입니다. 중요한 선택은 실제 조건과 함께 살펴보세요.`;
 if(!ai)return res.status(503).json({ok:false,error:"OPENAI_API_KEY 설정이 없습니다."});
 try{
  if(kind==="tarot"){
   const {question,meaning,cardContext}=req.body;
   const q=(question||"지금 나에게 필요한 메시지").trim();
   const input=`고객 질문: ${q}
선택 카드: ${card} / ${reversed?"역방향":"정방향"}
카드 기본 의미: ${meaning||""}
카드 참고 데이터: ${JSON.stringify(cardContext||{})}
해석 엔진 V2 카드 고유 근거: ${tarotEvidence(card,reversed)}

고객 질문을 먼저 연애·재회·직장·이직·사업·금전·관계·선택 등으로 파악하되, 질문에 없는 사정은 만들어내지 않는다. 질문이 모호하면 질문의 한계를 밝히고 확인할 점을 제시한다. 카드명과 정역방향, 카드 기본 의미와 참고 데이터를 서로 대조하고 충돌하면 카드 고유 상징을 우선한다. 한 장 카드가 나타내는 관점과 실제 사실·미래 확정을 구분한다. 먼저 질문의 핵심 주제와 고객이 실제로 알고 싶은 판단 포인트를 파악한 뒤, 카드의 상징을 그 질문에 직접 연결해 해석한다. 카드 사전 뜻을 길게 설명한 뒤 질문을 덧붙이는 방식은 금지한다. 질문과 무관한 전체운·재물운·직업운을 억지로 추가하지 않는다. 상대방의 속마음이나 미래를 사실처럼 단정하지 않는다. 카드가 보여주는 관점과 현실에서 확인할 신호를 구분한다. 한줄답변은 질문에 바로 답하는 1~2문장으로 작성한다. 목표는 고객이 “일반적인 말”이 아니라 “내가 실제로 하는 행동을 짚었다”라고 느끼는 밀도 높은 리딩이다. 질문형 문장을 남발하지 말고 관찰형 문장을 우선한다. “여러 생각이 들 수 있다, 부담이 있을 수 있다, 신중할 수 있다”처럼 누구에게나 적용되는 문장은 단독으로 쓰지 않는다. 반드시 질문의 단어와 카드의 고유 상징을 연결해 연락 방식, 답장을 확인하는 습관, 말하기 전 머릿속 리허설, 상대 반응을 살피는 방식, 돈을 쓸 때의 확인 습관, 일에서 미루거나 몰아붙이는 방식처럼 눈앞에 그려지는 생활 장면으로 번역한다. 단, 고객이 말하지 않은 실제 과거 사건·상대의 속마음·미래 결과를 알고 있다고 주장하지 않는다. questionFocus는 “연애-고백 타이밍” 같은 보고서식 분류명이 아니라 “당신이 정말 궁금한 건 고백할 용기보다 지금이 그 타이밍인지입니다.”처럼 고객에게 직접 말하는 1~2문장으로 쓴다. patternMirror는 4~6문장으로 행동 장면 2~3개를 구체화하고, 최소 2문장은 관찰형 문장으로 쓴다. 필요할 때만 “~일 가능성이 있습니다/~하기 쉽습니다”를 사용한다. sharpLine은 카드 고유 상징과 질문을 함께 압축한, 다른 카드에 그대로 붙일 수 없는 한 문장으로 작성한다. connection은 '왜 이 카드가 이 질문에서 이런 뜻이 되는지'가 느껴지도록 구체적인 3~4문장. 상황흐름에는 고객이 확인할 수 있는 징후와 다른 가능성을 구분하여 3~4문장. 주의점은 질문과 연결되는 실제 점검 사항 2~3문장. 행동조언 3개는 각각 서로 다른 실행 가능한 행동으로 작성하고 뜬구름 잡는 격려를 반복하지 않는다. 답변과 연결해석, 상황흐름, 주의점에 동일 문장이나 같은 뜻의 반복을 피한다. 호기심을 끄는 소제목 같은 표현을 쓰되 불안·긴급성·재회 확정 등을 조작하지 않는다. JSON 외 텍스트 금지.`;
   const schema={type:"object",properties:{answer:{type:"string"},questionFocus:{type:"string"},patternMirror:{type:"string"},sharpLine:{type:"string"},connection:{type:"string"},flow:{type:"string"},caution:{type:"string"},advice:{type:"array",items:{type:"string"},minItems:3,maxItems:3},basis:{type:"string"}},required:["answer","questionFocus","patternMirror","sharpLine","connection","flow","caution","advice","basis"],additionalProperties:false};
   const r=await ai.responses.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"상업용 타로 키오스크의 참고·오락용 리딩을 작성한다. 최우선 기준은 '고객의 질문에 답하는 것'이다. 카드의 일반론을 나열하지 말고 질문의 맥락에 카드 상징을 적용한다. 결정론적 예언, 공포 조장, 타인의 감정·의도를 사실로 단정하는 표현을 피한다. 의료·법률·투자 판단을 대신하지 않는다. 반드시 JSON 객체 하나만 출력한다.",input,text:{format:{type:"json_schema",name:"tarot_question_reading_v25_9_21",strict:true,schema}}});
   return res.json({ok:true,mode:"ai",sections:JSON.parse(r.output_text)});
  }
  const year=new Date().getFullYear();
  if(kind==="couple"){
   const input=`첫 번째 사람 이름은 ${person1.name||"첫 번째 사람"}, 계산값 ${JSON.stringify(person1.saju)}. 두 번째 사람 이름은 ${person2.name||"두 번째 사람"}, 계산값 ${JSON.stringify(person2.saju)}. 첫 번째 사람 V2 행동근거: ${sajuEvidence(person1.saju)}. 두 번째 사람 V2 행동근거: ${sajuEvidence(person2.saju)}. 제공된 역법 계산값만 해석하고 임의로 사주를 재계산하지 말 것. 두 사람의 차이를 우열로 판단하지 말고 상호작용을 설명한다. 결과 문장에서는 A/B라는 호칭을 절대 쓰지 말고 반드시 실제 이름을 사용한다.
품질 목표는 두 사람이 읽으면서 “우리 둘이 실제로 이러는데?”라고 느낄 정도로 구체적인 관계 패턴을 보여주는 것이다. 단, 실제 과거 사건이나 상대의 숨은 마음을 알고 있다고 주장하지 않는다. summary는 궁합 점수 같은 평가가 아니라 두 사람 사이에서 가장 두드러지는 상호작용을 고객에게 직접 말하는 2문장. uncannyPattern은 연락 빈도, 약속 정하는 방식, 서운함을 표현하는 방식, 다툰 뒤 풀어가는 방식, 소비·생활 리듬 중 계산값으로 설명 가능한 장면 2~3개를 4~6문장으로 묘사한다. contrast는 “한 사람은 이렇게 반응하고 다른 사람은 이렇게 받아들이기 쉬워 엇갈린다”처럼 두 사람의 차이가 실제 생활에서 어떻게 보일지 3~4문장으로 쓴다. sharpLine은 이 커플만의 핵심 상호작용을 기억에 남게 압축한 한 문장. 키워드 3개, 잘 맞는 점 3개는 서로 다른 구체적 관점. 끌림/연애스타일/대화갈등/친밀감/생활/재물/장기관계는 각각 3~4문장으로, 두 사람 각각의 관점과 생활 속 사례를 포함한다. “서로 배려하세요/대화가 중요합니다” 같은 범용 조언만으로 문단을 채우지 않는다. 각 항목에서 같은 칭찬과 경고를 반복하지 않는다. 계산값이 부족하면 추측을 사실처럼 꾸미지 않는다. ${year}년 커플 흐름은 기회/대화/생활/주의 4영역. 행동조언 3개는 오늘부터 실제로 해볼 수 있게 구체적으로 쓴다. 확정적 결혼·이별 예언, 공포 조장, 성적 능력 판단 금지. JSON 외 텍스트 금지.`;
   const schema={type:"object",properties:{summary:{type:"string"},uncannyPattern:{type:"string"},contrast:{type:"string"},sharpLine:{type:"string"},keywords:{type:"array",items:{type:"string"},minItems:3,maxItems:3},strengths:{type:"array",items:{type:"string"},minItems:3,maxItems:3},attraction:{type:"string"},loveStyle:{type:"string"},communication:{type:"string"},intimacy:{type:"string"},lifestyle:{type:"string"},money:{type:"string"},longTerm:{type:"string"},annual:{type:"object",properties:{opportunity:{type:"string"},communication:{type:"string"},lifestyle:{type:"string"},caution:{type:"string"}},required:["opportunity","communication","lifestyle","caution"],additionalProperties:false},advice:{type:"array",items:{type:"string"},minItems:3,maxItems:3}},required:["summary","uncannyPattern","contrast","sharpLine","keywords","strengths","attraction","loveStyle","communication","intimacy","lifestyle","money","longTerm","annual","advice"],additionalProperties:false};
   const r=await ai.responses.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"상업용 커플 사주 키오스크의 읽기 쉬운 참고·오락 콘텐츠를 작성한다. 계산값을 바탕으로 구체적이되 결정론적 표현은 피한다. 명리 전문용어(비견·겁재·식신·상관·편재·정재·편관·정관·편인·정인·천간·지지·일간·대운 등)를 고객 설명문에 사용할 때는 반드시 같은 문장 안에서 일상적인 쉬운 말로 뜻을 풀어 쓴다. 전문용어만 나열하지 않는다. 반드시 JSON 객체 하나만 출력한다.",input,text:{format:{type:"json_schema",name:"couple_reading_v25_9_21",strict:true,schema}}});
   return res.json({ok:true,mode:"ai",sections:JSON.parse(r.output_text)});
  }
  const premium=tier==="premium";
  if(!premium){
   const today=new Date();
   const dateLabel=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
   const input=`오늘 날짜 ${dateLabel}. 고객 이름 ${name||"미입력"}, 생년월일 ${birth}, 출생시간 ${time}. 역법 엔진 계산 데이터: ${JSON.stringify(saju)}.
해석 엔진 V2 행동근거: ${sajuEvidence(saju)}.
프로그램이 고정 계산한 오늘의 지표: ${JSON.stringify(dailyMetrics||{})}. overallScore, scores의 숫자, biorhythm의 숫자는 반드시 이 프로그램 계산값을 그대로 사용하고 임의로 변경하지 않는다.
이 상품은 '오늘의 사주'이며 평생사주나 연간운세가 아니다. 사주 원국 데이터는 오늘의 분위기를 개인화하는 내부 참고 근거로만 사용한다. 대운, 올해 전체 운세, 평생 성향, 오행/십성 강의는 출력하지 않는다.
summary는 오늘 하루의 핵심을 고객에게 직접 말하는 2문장으로 쓴다. “기운이 좋다/신중하라”만 쓰지 말고 오늘 특히 어디서 체감될지 한 장면을 포함한다. todayMirror는 "오늘 유독 드러나기 쉬운 나의 패턴"으로, 제공된 사주 원국과 오늘 지표를 근거로 연락·결정·일처리·감정반응 같은 생활 장면 3개를 4~6문장으로 구체적으로 묘사한다. 예를 들어 메시지를 쓰고 지웠다가 보내는지, 일을 여러 개 펼친 뒤 하나에 몰입하는지, 서운할 때 바로 말하기보다 혼자 정리하는지처럼 행동 단위로 내려간다. 계산값이 뒷받침하지 않는 장면은 만들지 않는다. 누구에게나 맞는 추상적인 문장과 질문형 나열을 피하고, 실제 사건을 안다고 주장하지 않으며 필요한 곳에만 "~하기 쉽습니다/~일 가능성이 있습니다"를 사용한다. 각 분야 설명도 오늘 실제로 할 법한 선택 하나와 연결한다. overallScore는 프로그램이 제공한 0~100 참고 지수이며 운명이나 실제 성과의 확률이 아니다. scores는 energy/focus/emotion/social 각각 프로그램의 0~100 참고 지수와 1문장 설명.
biorhythm은 사주와 별개의 생년월일 기반 참고 리듬으로 physical/emotional/intellectual 각각 -100~100 정수와 짧은 설명. 이 수치를 사주에서 도출했다고 말하지 않는다. 음수 또는 낮은 구간도 불운, 능력 저하, 건강 악화로 단정하지 않고 조절·회복의 리듬으로 부드럽게 설명한다.
timeFlow는 morning/afternoon/evening 각각 그 시간대의 서로 다른 상황 예시와 도움이 되는 행동·주의점을 2문장. 특정 사건이 일어난다고 단정하지 않는다.
todayFortune은 money/work/love/social/condition 각각 일상적인 선택 상황과 확인할 포인트를 포함한 2~3문장. 서로 같은 조언을 반복하지 않는다. 장기 미래가 아니라 오늘의 행동 선택에만 연결한다.
doToday 3개, avoidToday 3개, lucky는 color/number/direction/keyword, closing은 오늘의 한마디 1문장.
과장된 길흉 단정, 사고·질병 예언, 투자 수익 보장 금지. 쉬운 한국어. JSON 외 텍스트 금지.`;
   const score={type:"object",properties:{value:{type:"integer",minimum:0,maximum:100},text:{type:"string"}},required:["value","text"],additionalProperties:false};
   const bio={type:"object",properties:{value:{type:"integer",minimum:-100,maximum:100},text:{type:"string"}},required:["value","text"],additionalProperties:false};
   const schema={type:"object",properties:{
    summary:{type:"string"},todayMirror:{type:"string"},overallScore:{type:"integer",minimum:0,maximum:100},
    scores:{type:"object",properties:{energy:score,focus:score,emotion:score,social:score},required:["energy","focus","emotion","social"],additionalProperties:false},
    biorhythm:{type:"object",properties:{physical:bio,emotional:bio,intellectual:bio},required:["physical","emotional","intellectual"],additionalProperties:false},
    timeFlow:{type:"object",properties:{morning:{type:"string"},afternoon:{type:"string"},evening:{type:"string"}},required:["morning","afternoon","evening"],additionalProperties:false},
    todayFortune:{type:"object",properties:{money:{type:"string"},work:{type:"string"},love:{type:"string"},social:{type:"string"},condition:{type:"string"}},required:["money","work","love","social","condition"],additionalProperties:false},
    doToday:{type:"array",items:{type:"string"},minItems:3,maxItems:3},avoidToday:{type:"array",items:{type:"string"},minItems:3,maxItems:3},
    lucky:{type:"object",properties:{color:{type:"string"},number:{type:"string"},direction:{type:"string"},keyword:{type:"string"}},required:["color","number","direction","keyword"],additionalProperties:false},
    closing:{type:"string"}
   },required:["summary","todayMirror","overallScore","scores","biorhythm","timeFlow","todayFortune","doToday","avoidToday","lucky","closing"],additionalProperties:false};
   const r=await ai.responses.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"상업용 키오스크의 '오늘의 사주' 전용 데일리 리포트를 작성한다. 오직 오늘 하루의 컨디션과 행동에 집중한다. 연간운세·대운·평생성향을 출력하지 않는다. 바이오리듬은 사주와 별개의 참고·오락 지표임을 지킨다. 반드시 지정 JSON 객체 하나만 출력한다.",input,text:{format:{type:"json_schema",name:"daily_saju_v25_9_21",strict:true,schema}}});
   return res.json({ok:true,mode:"ai",sections:JSON.parse(r.output_text)});
  }
  const input=`고객 이름 ${name||"미입력"}, 생년월일 ${birth}, 시간 ${time}. 검증용 역법 엔진 계산 데이터: ${JSON.stringify(saju)}. 해석 엔진 V2 행동근거: ${sajuEvidence(saju)}. 제공값만 해석하고 팔자·십성·오행을 임의로 재계산하지 말 것. 오행 counts만으로 용신·희신·강약을 단정하지 말 것. 상품은 프리미엄 종합운세. 목표는 “성격이 좋다/책임감이 있다” 같은 범용 문구가 아니라 계산값이 실제 생활에서 어떻게 보이는지 장면으로 번역하는 고밀도 개인 보고서다. 핵심요약 1문장, 키워드 3개, 핵심포인트 3개. hiddenPattern은 "남들은 잘 모르는 나"로 겉으로 보이는 모습과 실제 속반응의 차이를 연락, 부탁, 관계 정리, 돈, 일 중 계산값으로 뒷받침되는 생활 장면 3개를 4~6문장으로 구체화한다. decisionStyle은 중요한 결정을 앞뒀을 때 자료를 반복 확인하는지, 주변 의견을 듣고도 이미 정한 답을 확인받는지, 오래 미루다가 한 번에 밀어붙이는지 등 계산값으로 설명 가능한 패턴을 4~6문장으로 쓴다. stressPattern은 압박받거나 서운할 때 말투가 짧아지는지, 연락을 줄이는지, 혼자 정리한 뒤 결론을 통보하는지 등 가능한 반응을 4~6문장으로 쓴다. 단, 계산값으로 뒷받침되지 않는 예시는 억지로 넣지 않는다. 각 항목은 실제 과거 사건을 안다고 주장하지 말고 관찰형 문장을 중심으로 쓰되 필요한 곳에만 조건부 표현을 쓴다. “그럴 수 있습니다”를 모든 문장 끝에 반복하지 않는다. 성향/강점/보완점/재물/돈관리/사업직업/직장흐름/연애배우자/대인관계/건강생활을 각 4~5문장으로 작성한다. 각 항목마다 최소 하나는 실제 생활 행동 장면을 포함하고, 다른 사람에게 이름만 바꿔 붙여도 되는 문장은 피한다. 각 항목은 제공된 명식 정보에 연결되는 전통적 해석의 근거, 일상에서 체감할 수 있는 구체적인 예시, 균형 잡힌 주의점 또는 행동 제안을 담는다. 근거가 부족하면 단정하지 않는다. 문장과 조언을 항목 간 반복하지 않는다. 동일 핵심어(예: 신중함·책임감·안정·혼자 생각함)를 세 개 이상의 섹션에서 재사용하지 않는다. 각 섹션은 서로 다른 근거 신호를 우선 배정한다. hiddenPattern은 관계/연락, decisionStyle은 판단 과정, stressPattern은 압박 반응, money는 현금흐름 판단, career는 문제 해결 방식처럼 역할을 분리한다. 제공된 계산값에 대운 정보가 있을 때만 현재 대운과 다음 대운을 구분하고, 올해 분기별 흐름(Q1~Q4)을 추가한다. 특정 시기에 사건·수익·건강 결과가 확정된다고 쓰지 않는다. 현재대운 키워드 3개. ${year}년 재물/일/관계/주의를 구체적으로 작성. 행동조언 3개. 확정적 예언 금지. 건강은 생활관리 수준. JSON 외 텍스트 금지.`;
  const props={summary:{type:"string"},hiddenPattern:{type:"string"},decisionStyle:{type:"string"},stressPattern:{type:"string"},keywords:{type:"array",items:{type:"string"},minItems:3,maxItems:3},highlights:{type:"array",items:{type:"string"},minItems:3,maxItems:3},personality:{type:"string"},strengths:{type:"string"},weaknesses:{type:"string"},money:{type:"string"},moneyHabits:{type:"string"},career:{type:"string"},workplace:{type:"string"},love:{type:"string"},relationships:{type:"string"},health:{type:"string"},luckKeywords:{type:"array",items:{type:"string"},minItems:3,maxItems:3},luckFlow:{type:"string"},nextLuck:{type:"string"},annual:{type:"object",properties:{money:{type:"string"},work:{type:"string"},relationship:{type:"string"},caution:{type:"string"}},required:["money","work","relationship","caution"],additionalProperties:false},quarters:{type:"object",properties:{q1:{type:"string"},q2:{type:"string"},q3:{type:"string"},q4:{type:"string"}},required:["q1","q2","q3","q4"],additionalProperties:false},advice:{type:"array",items:{type:"string"},minItems:3,maxItems:3}};
  const schema={type:"object",properties:props,required:Object.keys(props),additionalProperties:false};
  const r=await ai.responses.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"상업용 무인 사주 키오스크의 프리미엄 종합운세다. 계산 엔진 제공값만 해석한다. 장기·종합형 개인 보고서로 작성하고 쉬운 표현을 우선한다. 전문용어는 사용할 경우 바로 뜻을 풀어 쓴다. 반드시 JSON 객체 하나만 출력한다.",input,text:{format:{type:"json_schema",name:"premium_saju_v25_9_21",strict:true,schema}}});
  return res.json({ok:true,mode:"ai",sections:JSON.parse(r.output_text)});
 }catch(e){console.error("[AI-READING ERROR]",e);res.status(500).json({ok:false,error:e?.message||"AI reading failed"})}
});
app.post("/api/result",asyncRoute(async(q,s)=>{const id=String(q.body.id||"");if(!/^K[0-9]{8,24}$/.test(id))return s.status(400).json({ok:false,error:"invalid result id"});const d=await read();const prior=d[id]||{};const viewToken=prior.viewToken||randomBytes(24).toString("hex");d[id]={...prior,...q.body,id,viewToken,createdAt:prior.createdAt||new Date().toISOString()};await save(d);s.json({ok:true,id,viewToken})}));
app.get("/api/public-result/:token",asyncRoute(async(q,s)=>{s.setHeader("Cache-Control","no-store");const token=String(q.params.token||"");if(!/^[a-f0-9]{48}$/.test(token))return s.status(404).json({error:"not found"});const x=Object.values(await read()).find(v=>v&&v.viewToken===token);if(!x)return s.status(404).json({error:"not found"});const {viewToken,...publicResult}=x;s.json(publicResult)}));
app.get("/api/result/:id",asyncRoute(async(q,s)=>{const x=(await read())[q.params.id];x?s.json(x):s.status(404).json({error:"not found"})}));

const distPath=path.resolve(process.cwd(),"dist");
if(fs.existsSync(distPath)){
  app.use(express.static(distPath));
  app.get("*",(req,res,next)=>{
    if(req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distPath,"index.html"));
  });
}
const PORT=process.env.PORT||3001;
app.use((err,req,res,next)=>{console.error("[STORAGE/ROUTE ERROR]",err);if(!res.headersSent)res.status(503).json({ok:false,error:"서버 저장소 오류. 관리자에게 문의하세요."})});
async function start(){
 if(pool){await pool.query("CREATE TABLE IF NOT EXISTS kiosk_data (name TEXT PRIMARY KEY, value JSONB NOT NULL)");await pool.query("SELECT 1");}
 app.listen(PORT,"0.0.0.0",()=>console.log(`V25.9.21 server running on port ${PORT}; storage=${usePg?"postgres":"local"}`));
}
start().catch(e=>{console.error("[DATABASE STARTUP ERROR]",e);process.exit(1)});
