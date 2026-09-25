import { Solar, Lunar } from "lunar-typescript";

const ganKo={"甲":"갑","乙":"을","丙":"병","丁":"정","戊":"무","己":"기","庚":"경","辛":"신","壬":"임","癸":"계"};
const zhiKo={"子":"자","丑":"축","寅":"인","卯":"묘","辰":"진","巳":"사","午":"오","未":"미","申":"신","酉":"유","戌":"술","亥":"해"};
const stemElement={"甲":"목","乙":"목","丙":"화","丁":"화","戊":"토","己":"토","庚":"금","辛":"금","壬":"수","癸":"수"};
const branchElement={"子":"수","丑":"토","寅":"목","卯":"목","辰":"토","巳":"화","午":"화","未":"토","申":"금","酉":"금","戌":"토","亥":"수"};
const hidden={"子":["癸"],"丑":["己","癸","辛"],"寅":["甲","丙","戊"],"卯":["乙"],"辰":["戊","乙","癸"],"巳":["丙","戊","庚"],"午":["丁","己"],"未":["己","丁","乙"],"申":["庚","壬","戊"],"酉":["辛"],"戌":["戊","辛","丁"],"亥":["壬","甲"]};
const stemYang={"甲":1,"乙":0,"丙":1,"丁":0,"戊":1,"己":0,"庚":1,"辛":0,"壬":1,"癸":0};
const generates={목:"화",화:"토",토:"금",금:"수",수:"목"}; const controls={목:"토",토:"수",수:"화",화:"금",금:"목"};
function tenGod(day,other){const me=stemElement[day],o=stemElement[other],same=stemYang[day]===stemYang[other];if(me===o)return same?"비견":"겁재";if(generates[me]===o)return same?"식신":"상관";if(generates[o]===me)return same?"편인":"정인";if(controls[me]===o)return same?"편재":"정재";if(controls[o]===me)return same?"편관":"정관";return ""}
function koGz(gz){return (ganKo[gz?.[0]]||gz?.[0]||"")+(zhiKo[gz?.[1]]||gz?.[1]||"")}
function parseDate(birth,time){if(!/^\d{4}-\d{2}-\d{2}$/.test(birth||"")||!/^\d{2}:\d{2}$/.test(time||""))throw Error("invalid");const [y,m,d]=birth.split("-").map(Number),[hh,mm]=time.split(":").map(Number);if(y<1900||y>2100||m<1||m>12||d<1||d>31||hh<0||hh>23||mm<0||mm>59)throw Error("range");return {y,m,d,hh,mm}}
export function calculateSaju(input){const {birth,time,calendar="solar",leap=false,gender="male"}=input||{};const {y,m,d,hh,mm}=parseDate(birth,time);
 let lunar,solar;if(calendar==="lunar"){lunar=Lunar.fromYmdHms(y,leap?-m:m,d,hh,mm,0);solar=lunar.getSolar()}else{solar=Solar.fromYmdHms(y,m,d,hh,mm,0);lunar=solar.getLunar()}
 const ec=lunar.getEightChar(); if(input?.ziSect===1||input?.ziSect===2)ec.setSect?.(Number(input.ziSect));
 const raw=[ec.getYear(),ec.getMonth(),ec.getDay(),ec.getTime()], labels=["년주","월주","일주","시주"], counts={목:0,화:0,토:0,금:0,수:0};
 raw.forEach(gz=>{counts[stemElement[gz[0]]]++;counts[branchElement[gz[1]]]++}); const day=raw[2][0];
 const tenGods=raw.map((gz,i)=>({pillar:labels[i],stem:i===2?"일간":tenGod(day,gz[0]),branch:hidden[gz[1]].map((h,j)=>({stem:ganKo[h],god:tenGod(day,h),role:["본기","중기","여기"][j]||"장간"}))}));
 let luck=null;try{const yun=ec.getYun(gender==="female"?0:1),start=yun.getStartSolar(),ds=yun.getDaYun().slice(1,9);luck={startOffset:{years:yun.getStartYear?.(),months:yun.getStartMonth?.(),days:yun.getStartDay?.(),hours:yun.getStartHour?.()},startAge:ds[0]?.getStartAge?.(),startDate:start?.toYmdHms?.()||start?.toYmd?.(),periods:ds.map((x,i)=>({ganZhi:koGz(x.getGanZhi()),startAge:x.getStartAge(),startYear:x.getStartYear(),endYear:ds[i+1]?.getStartYear?.()-1||x.getStartYear()+9}))}}catch{}
 return {pillars:raw.map(g=>[ganKo[g[0]]||g[0],zhiKo[g[1]]||g[1]]),rawPillars:raw,counts,dayMaster:ganKo[day],dayElement:stemElement[day],tenGods,luck,solarDate:solar.toYmd?.()||birth,lunarDate:lunar.toString(),calendar,leap:!!leap,gender,engine:"lunar-typescript / EightChar",basis:"절기 기반 사주 원국. 십성은 일간 대비 천간과 지지 장간(본기·중기·여기)을 계산합니다.",warning:"본 결과는 전통 명리 계산을 바탕으로 한 참고·오락용 콘텐츠입니다. 출생지역에 따른 진태양시 보정은 적용하지 않았습니다."};
}
