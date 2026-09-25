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
app.get("/api/health",(q,s)=>s.json({ok:true,version:"25.9.7",ai:!!ai,storage:usePg?"postgres":"local"}));
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

고객 질문을 먼저 연애·재회·직장·이직·사업·금전·관계·선택 등으로 파악하되, 질문에 없는 사정은 만들어내지 않는다. 질문이 모호하면 질문의 한계를 밝히고 확인할 점을 제시한다. 카드명과 정역방향, 카드 기본 의미와 참고 데이터를 서로 대조하고 충돌하면 카드 고유 상징을 우선한다. 한 장 카드가 나타내는 관점과 실제 사실·미래 확정을 구분한다. 먼저 질문의 핵심 주제와 고객이 실제로 알고 싶은 판단 포인트를 파악한 뒤, 카드의 상징을 그 질문에 직접 연결해 해석한다. 카드 사전 뜻을 길게 설명한 뒤 질문을 덧붙이는 방식은 금지한다. 질문과 무관한 전체운·재물운·직업운을 억지로 추가하지 않는다. 상대방의 속마음이나 미래를 사실처럼 단정하지 않는다. 카드가 보여주는 관점과 현실에서 확인할 신호를 구분한다. 한줄답변은 질문에 바로 답하는 1~2문장으로 작성한다. 연결해석은 '왜 이 카드가 이 질문에서 이런 뜻이 되는지'가 느껴지도록 구체적인 3~4문장. 상황흐름에는 고객이 확인할 수 있는 징후와 다른 가능성을 구분하여 3~4문장. 주의점은 질문과 연결되는 실제 점검 사항 2~3문장. 행동조언 3개는 각각 서로 다른 실행 가능한 행동으로 작성하고 뜬구름 잡는 격려를 반복하지 않는다. 답변과 연결해석, 상황흐름, 주의점에 동일 문장이나 같은 뜻의 반복을 피한다. 호기심을 끄는 소제목 같은 표현을 쓰되 불안·긴급성·재회 확정 등을 조작하지 않는다. JSON 외 텍스트 금지.`;
   const schema={type:"object",properties:{answer:{type:"string"},questionFocus:{type:"string"},connection:{type:"string"},flow:{type:"string"},caution:{type:"string"},advice:{type:"array",items:{type:"string"},minItems:3,maxItems:3},basis:{type:"string"}},required:["answer","questionFocus","connection","flow","caution","advice","basis"],additionalProperties:false};
   const r=await ai.responses.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"상업용 타로 키오스크의 참고·오락용 리딩을 작성한다. 최우선 기준은 '고객의 질문에 답하는 것'이다. 카드의 일반론을 나열하지 말고 질문의 맥락에 카드 상징을 적용한다. 결정론적 예언, 공포 조장, 타인의 감정·의도를 사실로 단정하는 표현을 피한다. 의료·법률·투자 판단을 대신하지 않는다. 반드시 JSON 객체 하나만 출력한다.",input,text:{format:{type:"json_schema",name:"tarot_question_reading_v23_1",strict:true,schema}}});
   return res.json({ok:true,mode:"ai",sections:JSON.parse(r.output_text)});
  }
  const year=new Date().getFullYear();
  if(kind==="couple"){
   const input=`첫 번째 사람 이름은 ${person1.name||"첫 번째 사람"}, 계산값 ${JSON.stringify(person1.saju)}. 두 번째 사람 이름은 ${person2.name||"두 번째 사람"}, 계산값 ${JSON.stringify(person2.saju)}. 제공된 역법 계산값만 해석하고 임의로 사주를 재계산하지 말 것. 두 사람의 차이를 우열로 판단하지 말고 상호작용을 설명한다. 결과 문장에서는 A/B라는 호칭을 절대 쓰지 말고 반드시 실제 이름을 사용한다. 핵심요약은 두 사람의 상호작용을 보여주는 2문장, 키워드 3개, 잘 맞는 점 3개는 각각 제공된 계산값과 연결되는 서로 다른 구체적 관점. 끌림/연애스타일/대화갈등/친밀감/생활/재물/장기관계는 각각 3~4문장으로, 두 사람 각각의 관점과 실제 대화에서 확인할 질문 또는 생활 속 사례를 포함한다. 각 항목에서 같은 칭찬과 경고를 반복하지 않는다. 계산값이 부족하면 추측을 사실처럼 꾸미지 않는다. ${year}년 커플 흐름은 기회/대화/생활/주의 4영역. 행동조언 3개. 확정적 결혼·이별 예언, 공포 조장, 성적 능력 판단 금지. JSON 외 텍스트 금지.`;
   const schema={type:"object",properties:{summary:{type:"string"},keywords:{type:"array",items:{type:"string"},minItems:3,maxItems:3},strengths:{type:"array",items:{type:"string"},minItems:3,maxItems:3},attraction:{type:"string"},loveStyle:{type:"string"},communication:{type:"string"},intimacy:{type:"string"},lifestyle:{type:"string"},money:{type:"string"},longTerm:{type:"string"},annual:{type:"object",properties:{opportunity:{type:"string"},communication:{type:"string"},lifestyle:{type:"string"},caution:{type:"string"}},required:["opportunity","communication","lifestyle","caution"],additionalProperties:false},advice:{type:"array",items:{type:"string"},minItems:3,maxItems:3}},required:["summary","keywords","strengths","attraction","loveStyle","communication","intimacy","lifestyle","money","longTerm","annual","advice"],additionalProperties:false};
   const r=await ai.responses.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"상업용 커플 사주 키오스크의 읽기 쉬운 참고·오락 콘텐츠를 작성한다. 계산값을 바탕으로 구체적이되 결정론적 표현은 피한다. 명리 전문용어(비견·겁재·식신·상관·편재·정재·편관·정관·편인·정인·천간·지지·일간·대운 등)를 고객 설명문에 사용할 때는 반드시 같은 문장 안에서 일상적인 쉬운 말로 뜻을 풀어 쓴다. 전문용어만 나열하지 않는다. 반드시 JSON 객체 하나만 출력한다.",input,text:{format:{type:"json_schema",name:"couple_reading_v20",strict:true,schema}}});
   return res.json({ok:true,mode:"ai",sections:JSON.parse(r.output_text)});
  }
  const premium=tier==="premium";
  if(!premium){
   const today=new Date();
   const dateLabel=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
   const input=`오늘 날짜 ${dateLabel}. 고객 이름 ${name||"미입력"}, 생년월일 ${birth}, 출생시간 ${time}. 역법 엔진 계산 데이터: ${JSON.stringify(saju)}.
프로그램이 고정 계산한 오늘의 지표: ${JSON.stringify(dailyMetrics||{})}. overallScore, scores의 숫자, biorhythm의 숫자는 반드시 이 프로그램 계산값을 그대로 사용하고 임의로 변경하지 않는다.
이 상품은 '오늘의 사주'이며 평생사주나 연간운세가 아니다. 사주 원국 데이터는 오늘의 분위기를 개인화하는 내부 참고 근거로만 사용한다. 대운, 올해 전체 운세, 평생 성향, 오행/십성 강의는 출력하지 않는다.
summary는 오늘 하루의 핵심을 2문장으로, 일반적인 행운 예언보다 오늘 점검할 구체적 주제를 담는다. overallScore는 프로그램이 제공한 0~100 참고 지수이며 운명이나 실제 성과의 확률이 아니다. scores는 energy/focus/emotion/social 각각 프로그램의 0~100 참고 지수와 1문장 설명.
biorhythm은 사주와 별개의 생년월일 기반 참고 리듬으로 physical/emotional/intellectual 각각 -100~100 정수와 짧은 설명. 이 수치를 사주에서 도출했다고 말하지 않는다. 음수 또는 낮은 구간도 불운, 능력 저하, 건강 악화로 단정하지 않고 조절·회복의 리듬으로 부드럽게 설명한다.
timeFlow는 morning/afternoon/evening 각각 그 시간대의 서로 다른 상황 예시와 도움이 되는 행동·주의점을 2문장. 특정 사건이 일어난다고 단정하지 않는다.
todayFortune은 money/work/love/social/condition 각각 일상적인 선택 상황과 확인할 포인트를 포함한 2~3문장. 서로 같은 조언을 반복하지 않는다. 장기 미래가 아니라 오늘의 행동 선택에만 연결한다.
doToday 3개, avoidToday 3개, lucky는 color/number/direction/keyword, closing은 오늘의 한마디 1문장.
과장된 길흉 단정, 사고·질병 예언, 투자 수익 보장 금지. 쉬운 한국어. JSON 외 텍스트 금지.`;
   const score={type:"object",properties:{value:{type:"integer",minimum:0,maximum:100},text:{type:"string"}},required:["value","text"],additionalProperties:false};
   const bio={type:"object",properties:{value:{type:"integer",minimum:-100,maximum:100},text:{type:"string"}},required:["value","text"],additionalProperties:false};
   const schema={type:"object",properties:{
    summary:{type:"string"},overallScore:{type:"integer",minimum:0,maximum:100},
    scores:{type:"object",properties:{energy:score,focus:score,emotion:score,social:score},required:["energy","focus","emotion","social"],additionalProperties:false},
    biorhythm:{type:"object",properties:{physical:bio,emotional:bio,intellectual:bio},required:["physical","emotional","intellectual"],additionalProperties:false},
    timeFlow:{type:"object",properties:{morning:{type:"string"},afternoon:{type:"string"},evening:{type:"string"}},required:["morning","afternoon","evening"],additionalProperties:false},
    todayFortune:{type:"object",properties:{money:{type:"string"},work:{type:"string"},love:{type:"string"},social:{type:"string"},condition:{type:"string"}},required:["money","work","love","social","condition"],additionalProperties:false},
    doToday:{type:"array",items:{type:"string"},minItems:3,maxItems:3},avoidToday:{type:"array",items:{type:"string"},minItems:3,maxItems:3},
    lucky:{type:"object",properties:{color:{type:"string"},number:{type:"string"},direction:{type:"string"},keyword:{type:"string"}},required:["color","number","direction","keyword"],additionalProperties:false},
    closing:{type:"string"}
   },required:["summary","overallScore","scores","biorhythm","timeFlow","todayFortune","doToday","avoidToday","lucky","closing"],additionalProperties:false};
   const r=await ai.responses.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"상업용 키오스크의 '오늘의 사주' 전용 데일리 리포트를 작성한다. 오직 오늘 하루의 컨디션과 행동에 집중한다. 연간운세·대운·평생성향을 출력하지 않는다. 바이오리듬은 사주와 별개의 참고·오락 지표임을 지킨다. 반드시 지정 JSON 객체 하나만 출력한다.",input,text:{format:{type:"json_schema",name:"daily_saju_v25_7",strict:true,schema}}});
   return res.json({ok:true,mode:"ai",sections:JSON.parse(r.output_text)});
  }
  const input=`고객 이름 ${name||"미입력"}, 생년월일 ${birth}, 시간 ${time}. 검증용 역법 엔진 계산 데이터: ${JSON.stringify(saju)}. 제공값만 해석하고 팔자·십성·오행을 임의로 재계산하지 말 것. 오행 counts만으로 용신·희신·강약을 단정하지 말 것. 상품은 프리미엄 종합운세. 핵심요약 1문장, 키워드 3개, 핵심포인트 3개. 성향/강점/보완점/재물/돈관리/사업직업/직장흐름/연애배우자/대인관계/건강생활을 각 3~4문장으로 작성한다. 각 항목은 제공된 명식 정보에 연결되는 전통적 해석의 근거, 일상에서 체감할 수 있는 구체적인 예시, 균형 잡힌 주의점 또는 행동 제안을 담는다. 근거가 부족하면 단정하지 않는다. 문장과 조언을 항목 간 반복하지 않는다. 제공된 계산값에 대운 정보가 있을 때만 현재 대운과 다음 대운을 구분하고, 올해 분기별 흐름(Q1~Q4)을 추가한다. 특정 시기에 사건·수익·건강 결과가 확정된다고 쓰지 않는다. 현재대운 키워드 3개. ${year}년 재물/일/관계/주의를 구체적으로 작성. 행동조언 3개. 확정적 예언 금지. 건강은 생활관리 수준. JSON 외 텍스트 금지.`;
  const props={summary:{type:"string"},keywords:{type:"array",items:{type:"string"},minItems:3,maxItems:3},highlights:{type:"array",items:{type:"string"},minItems:3,maxItems:3},personality:{type:"string"},strengths:{type:"string"},weaknesses:{type:"string"},money:{type:"string"},moneyHabits:{type:"string"},career:{type:"string"},workplace:{type:"string"},love:{type:"string"},relationships:{type:"string"},health:{type:"string"},luckKeywords:{type:"array",items:{type:"string"},minItems:3,maxItems:3},luckFlow:{type:"string"},nextLuck:{type:"string"},annual:{type:"object",properties:{money:{type:"string"},work:{type:"string"},relationship:{type:"string"},caution:{type:"string"}},required:["money","work","relationship","caution"],additionalProperties:false},quarters:{type:"object",properties:{q1:{type:"string"},q2:{type:"string"},q3:{type:"string"},q4:{type:"string"}},required:["q1","q2","q3","q4"],additionalProperties:false},advice:{type:"array",items:{type:"string"},minItems:3,maxItems:3}};
  const schema={type:"object",properties:props,required:Object.keys(props),additionalProperties:false};
  const r=await ai.responses.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"상업용 무인 사주 키오스크의 프리미엄 종합운세다. 계산 엔진 제공값만 해석한다. 장기·종합형 개인 보고서로 작성하고 쉬운 표현을 우선한다. 전문용어는 사용할 경우 바로 뜻을 풀어 쓴다. 반드시 JSON 객체 하나만 출력한다.",input,text:{format:{type:"json_schema",name:"premium_saju_v25_7",strict:true,schema}}});
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
 app.listen(PORT,"0.0.0.0",()=>console.log(`V25.9.7 server running on port ${PORT}; storage=${usePg?"postgres":"local"}`));
}
start().catch(e=>{console.error("[DATABASE STARTUP ERROR]",e);process.exit(1)});
