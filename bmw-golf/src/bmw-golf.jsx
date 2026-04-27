import { useState, useEffect, useMemo, useCallback, useRef } from "react";

const SUPABASE_URL      = 'https://cxnwtgytuapcmqzldfyp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bnd0Z3l0dWFwY21xemxkZnlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTExOTQsImV4cCI6MjA4OTQ2NzE5NH0.w-bs6xIqsP1WER0zQq4UxZMJYuanCo8Sktdt0D4T5aU';

const COURSES = [
  { name:'Olmos Basin',       rating:69.4, slope:125, par:72, yardage:'6,026 yds',
    holes_par:[4,4,3,4,5,3,4,4,5,4,4,3,4,4,4,4,4,5],
    hdcp:[7,3,9,1,11,17,5,13,15,4,12,10,8,18,2,14,6,16] },
  { name:'Brackenridge Park', rating:67.7, slope:124, par:71, yardage:'5,807 yds',
    holes_par:[4,3,5,4,4,4,4,3,5,3,4,5,5,4,3,4,4,3],
    hdcp:[15,3,13,9,7,1,5,11,17,8,4,10,14,2,18,12,16,6] },
  { name:'Cedar Creek',       rating:73.4, slope:139, par:72, yardage:'6,660 yds',
    holes_par:[4,4,4,5,3,4,3,4,5,4,4,4,4,5,4,4,3,4],
    hdcp:[13,3,9,17,15,1,7,5,11,12,16,2,6,18,14,10,8,4] },
  { name:'Mission Del Lago',  rating:71.0, slope:128, par:72, yardage:'6,378 yds',
    holes_par:[4,5,4,4,3,4,4,3,5,4,5,3,4,4,5,3,4,4],
    hdcp:[7,11,1,9,15,5,3,13,17,4,18,16,8,2,14,12,10,6] },
  { name:'Northern Hills',    rating:70.1, slope:121, par:72, yardage:'6,193 yds',
    holes_par:[5,4,4,3,4,5,4,4,3,5,4,4,4,3,4,4,5,3],
    hdcp:[5,17,15,9,1,7,3,13,11,16,12,6,8,14,2,10,18,4] },
  { name:'Riverside',         rating:69.3, slope:117, par:72, yardage:'5,892 yds',
    holes_par:[5,4,3,4,4,4,3,4,5,4,4,5,4,4,3,4,4,4],
    hdcp:[15,5,13,1,11,7,9,3,17,16,4,14,8,2,10,6,18,12] },
  { name:'Willow Springs',    rating:72.4, slope:127, par:72, yardage:'6,529 yds',
    holes_par:[4,5,4,3,4,5,4,3,4,5,3,5,4,4,4,4,4,3],
    hdcp:[9,7,1,15,5,17,3,11,13,16,18,6,10,2,14,4,8,12] },
];

const sumArr = a => a.reduce((x,y)=>x+y,0);
const toPar  = n => n===0?'E':n>0?`+${n}`:`${n}`;
const fmt$0  = n => `$${Math.round(n)}`;
const fmt$   = n => `$${n.toFixed(2)}`;

const sb = async (path, method='GET', body=null) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers:{
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method==='POST'?'return=representation':'return=representation',
    },
    ...(body!==null?{body:JSON.stringify(body)}:{}),
  });
  if(res.status===204) return null;
  const data = await res.json();
  if(!res.ok) throw new Error(data.message||data.hint||JSON.stringify(data));
  return data;
};

// ── SCORING HELPERS ──────────────────────────────────────
const scoreColor = (s,p) => {
  if(s<=0) return C.muted;
  const d=s-p;
  if(d<=-2) return '#E65100';  // eagle — bold orange
  if(d===-1) return '#B71C1C'; // birdie — bold red
  if(d===0)  return '#1B5E20'; // par — bold green
  if(d===1)  return '#424242'; // bogey — dark gray
  return '#6A1B9A';            // double+ — bold purple
};
const scoreBg = (s,p) => {
  if(s<=0) return 'transparent';
  const d=s-p;
  if(d<=-2) return '#FFF3E0'; // eagle — warm orange bg
  if(d===-1) return '#FFEBEE'; // birdie — light red bg
  if(d===0)  return '#E8F5E9'; // par — light green bg
  if(d===1)  return '#EEEEEE'; // bogey — light gray bg
  return '#F3E5F5';            // double+ — light purple bg
};

const computeSkins = (scores, players, par) => {
  const skins = Object.fromEntries(players.map(p=>[p,0]));
  const holes  = Array(18).fill(null).map(()=>({winner:null,tied:false,skins:0,carry:false}));
  let carry = 0;
  for(let h=0;h<18;h++){
    const hs = players.filter(p=>scores[p]&&scores[p][h]>0).map(p=>({name:p,score:scores[p][h]}));
    if(hs.length<2){holes[h]={winner:null,tied:false,skins:0,carry:carry>0};continue;}
    const min=Math.min(...hs.map(s=>s.score));
    const winners=hs.filter(s=>s.score===min);
    if(winners.length===1){
      skins[winners[0].name]+=1+carry;
      holes[h]={winner:winners[0].name,tied:false,skins:1+carry,carry:false};
      carry=0;
    } else {
      holes[h]={winner:null,tied:true,skins:0,carry:carry>0};
      carry++;
    }
  }
  return {skins,holes,totalCarry:carry};
};

const computeBestBall = (scores,pair,par) => {
  if(!scores[pair[0]]||!scores[pair[1]]) return null;
  const a=scores[pair[0]], b=scores[pair[1]];
  const result = Array.from({length:18},(_,h)=>{
    const sa=a[h]>0?a[h]:null, sb=b[h]>0?b[h]:null;
    if(sa&&sb) return Math.min(sa,sb);
    return sa||sb||0;
  });
  return result;
};

const calcPayouts = (config,scores,ctp,pairings,hcMap,par,parTotal) => {
  if(!config) return null;
  const {buy_in,super_skin_fee,pct_ctp,pct_low_net,pct_skins,pct_2mbd,
         flight_a,flight_b,flight_c,num_flights,
         skins_a,skins_b,
         mbd_a,mbd_b,oh_shit_player,
         super_skin_players,odd_player} = config;

  // ── Low Net flights (A/B/C depending on num_flights) ──────
  const lowNetFlights = num_flights===2
    ? [{k:'A',p:flight_a||[]},{k:'B',p:flight_b||[]}]
    : [{k:'A',p:flight_a||[]},{k:'B',p:flight_b||[]},{k:'C',p:flight_c||[]}];

  // ── Skins flights (always A & B only) ─────────────────────
  const skinsFlights = [
    {k:'A',p:skins_a||flight_a||[]},
    {k:'B',p:skins_b||flight_b||[]},
  ];

  // ── 2MBD flights (always A & B only) ─────────────────────
  const mbdPlayers = [...(mbd_a||flight_a||[]),...(mbd_b||flight_b||[])];

  const allFlighted = lowNetFlights.flatMap(f=>f.p);
  const fieldSize = allFlighted.length;
  if(!fieldSize) return null;

  const totalPot     = fieldSize*buy_in;
  const ctpPot       = totalPot*pct_ctp/100;
  const lowNetPot    = totalPot*pct_low_net/100;
  const skinsPot     = totalPot*pct_skins/100;
  const twoMbdPot    = totalPot*pct_2mbd/100;
  const superSkinPot = (super_skin_players||[]).length*(super_skin_fee||10);
  const par3Count    = (par||[]).filter(p=>p===3).length||3;
  const ctpPerHole   = ctpPot/par3Count;

  // ── Low Net ────────────────────────────────────────────────
  const flightLowNet = {};
  lowNetFlights.forEach(({k,p})=>{
    const fp = lowNetPot/lowNetFlights.length;
    const lb = p.filter(n=>scores[n]&&sumArr(scores[n])>0)
      .map(n=>({name:n,net:sumArr(scores[n].map((s,i)=>s>0?s:par[i]))-(hcMap[n]??0),gross:sumArr(scores[n].map((s,i)=>s>0?s:par[i]))}))
      .sort((a,b)=>a.net-b.net);
    flightLowNet[k]={pot:fp,places:lb.slice(0,3).map((pl,i)=>({...pl,payout:fp*[0.5,0.3,0.2][i]}))};
  });

  // ── Skins (A & B only, 2 flights always) ──────────────────
  const flightSkins = {};
  skinsFlights.forEach(({k,p})=>{
    const fp = skinsPot/2;
    const active = p.filter(n=>scores[n]);
    const {skins,holes,totalCarry} = computeSkins(scores,active,par);
    const winners = Object.entries(skins).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
    const total = Object.values(skins).reduce((a,b)=>a+b,0)||1;
    flightSkins[k]={pot:fp,players:p,winners:winners.map(([name,count])=>({name,count,payout:fp*(count/total)})),holes,totalCarry,perSkin:fp/total};
  });

  // ── Super Skins ────────────────────────────────────────────
  const ssp = (super_skin_players||[]).filter(p=>scores[p]);
  const {skins:sSkins,holes:ssHoles,totalCarry:ssTotalCarry} = computeSkins(scores,ssp,par);
  const ssTot = Object.values(sSkins).reduce((a,b)=>a+b,0)||1;
  const superSkins = {
    pot:superSkinPot,players:super_skin_players||[],
    winners:Object.entries(sSkins).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count,payout:superSkinPot*(count/ssTot)})),
    holes:ssHoles,totalCarry:ssTotalCarry,perSkin:superSkinPot/(ssTot),
  };

  // ── 2MBD — 3 separate 6-hole segments ────────────────────
  // Each segment: holes 1-6, 7-12, 13-18
  // Winner = lowest COMBINED score (p1_score + p2_score) per segment
  // Payout: 1/3 of pot per segment, 1st place only
  const segPot = twoMbdPot / 3;
  const segHoles = [[0,6],[6,12],[12,18]]; // hole index ranges

  const twoMbdSegments = [1,2,3].map(seg=>{
    const segPairs = (pairings||[])
      .filter(grp=>grp.segment===seg||(!grp.segment&&seg===1)) // fallback for old data
      .flatMap(grp=>Array.isArray(grp)?grp:[grp]);

    // Use config's segment pairings if available
    const segKey = `mbd_seg${seg}`;
    const segPairList = config[segKey] || [];

    const [hStart,hEnd] = segHoles[seg-1];
    const teams = segPairList.map(pair=>{
      if(!pair||pair.length<2) return null;
      const [p1,p2] = pair;
      const sc1 = scores[p1]||[];
      const sc2 = scores[p2]||[];
      const s1 = sumArr(sc1.slice(hStart,hEnd).map((s,i)=>s>0?s:par[hStart+i]));
      const s2 = sumArr(sc2.slice(hStart,hEnd).map((s,i)=>s>0?s:par[hStart+i]));
      const played1 = sc1.slice(hStart,hEnd).filter(s=>s>0).length;
      const played2 = sc2.slice(hStart,hEnd).filter(s=>s>0).length;
      return {pair,p1score:s1,p2score:s2,combined:s1+s2,played:played1+played2};
    }).filter(Boolean).sort((a,b)=>a.combined-b.combined);

    return {
      seg, label:`${seg===1?'1st':seg===2?'2nd':'3rd'} 6 (holes ${hStart+1}–${hEnd})`,
      pot:segPot, teams, winner:teams[0]||null,
      hStart, hEnd,
    };
  });

  const twoMbd={
    pot:twoMbdPot,
    segments:twoMbdSegments,
    segPot,
    ohShitPlayer:oh_shit_player||null,
  };

  return {totalPot,ctpPot,lowNetPot,skinsPot,twoMbdPot,superSkinPot,ctpPerHole,
          flightLowNet,flightSkins,superSkins,twoMbd,fieldSize,
          oddPlayer:odd_player,
          lowNetFlights,skinsFlights,
          breakdown:{ctp:pct_ctp,lowNet:pct_low_net,skins:pct_skins,twoMbd:pct_2mbd}};
};

const assembleRound = (r,scores,ctps,pairings,configs,courses) => {
  const scoresMap = Object.fromEntries(scores.filter(s=>s.round_id===r.id).map(s=>[s.player_name,s.holes]));
  const ctpObj = {};
  ctps.filter(c=>c.round_id===r.id).forEach(c=>{ctpObj[c.hole_key]={player:c.player_name||'',distance:c.distance||''};});
  const rPairings=pairings.filter(p=>p.round_id===r.id);
  const groupNums=[...new Set(rPairings.map(p=>p.group_num))].sort((a,b)=>a-b);
  const pairStruct=groupNums.map(gn=>rPairings.filter(p=>p.group_num===gn).sort((a,b)=>a.team_num-b.team_num).map(p=>[p.player1,p.player2]));
  const groups=pairStruct.map(g=>g.flat().filter(Boolean));
  const cfg=configs.find(c=>c.round_id===r.id)||null;
  const course=courses.find(c=>c.id===r.course_id)||null;
  // Use COURSES par if available for accuracy
  const localCourse = COURSES.find(a=>a.name===course?.name);
  const par = localCourse?.holes_par || course?.holes_par || [4,4,3,4,5,3,4,4,5,4,4,3,4,4,4,4,4,5];
  const hdcp = localCourse?.hdcp || null;
  return {id:r.id,date:r.date,course,par,parTotal:sumArr(par),hdcp,scores:scoresMap,groups,pairings:pairStruct,ctp:ctpObj,config:cfg,status:r.status||'live'};
};

// ── GHIN HANDICAP CALCULATION ────────────────────────────
// Uses USGA World Handicap System: Score Differential = (Adjusted Gross - Course Rating) x 113 / Slope
const calcScoreDifferential = (grossScore, courseRating, slope) =>
  ((grossScore - courseRating) * 113 / slope);

const calcGHINHandicap = (differentials) => {
  // Use best 8 of last 20 differentials (or best of available)
  const sorted = [...differentials].sort((a,b)=>a-b);
  const use = sorted.length >= 20 ? sorted.slice(0,8)
    : sorted.length >= 10 ? sorted.slice(0,Math.ceil(sorted.length*0.4))
    : sorted.length >= 6  ? sorted.slice(0,Math.ceil(sorted.length*0.4))
    : sorted.slice(0,1);
  if(!use.length) return null;
  const avg = use.reduce((a,b)=>a+b,0)/use.length;
  return Math.floor(avg * 0.96 * 10) / 10;
};

// True random shuffle using Fisher-Yates algorithm
const shuffle = arr => {
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
};

const drawPairings = (flightA,flightB) => {
  const sA  = shuffle(flightA||[]);
  const sB  = shuffle(flightB||[]);
  const pairs = [];
  // Pair each A with one B
  const min = Math.min(sA.length, sB.length);
  for(let i=0;i<min;i++) pairs.push([sA[i], sB[i]]);
  // Leftover A players — pair together
  const remA = sA.slice(min);
  for(let i=0;i<remA.length;i+=2)
    pairs.push(remA[i+1]?[remA[i],remA[i+1]]:[remA[i],sB[sB.length-1]||'']);
  // Leftover B players — pair together
  const remB = sB.slice(min);
  for(let i=0;i<remB.length;i+=2)
    pairs.push(remB[i+1]?[remB[i],remB[i+1]]:[remB[i],remA[remA.length-1]||'']);
  // Group into foursomes (2 pairs per group)
  const groups=[];
  for(let i=0;i<pairs.length;i+=2)
    groups.push(pairs[i+1]?[pairs[i],pairs[i+1]]:[pairs[i]]);
  return groups;
};

const computePlayerStats = (rounds,playerName,par) => {
  let totalRounds=0,totalGross=0,totalNet=0,skins=0,wins=0,
      birdies=0,eagles=0,pars=0,bogeys=0,doubles=0,bestNet=999,ctpWins=0;
  rounds.forEach(r=>{
    const sc=r.scores[playerName];
    if(!sc) return;
    const hcMap2={}; // simplified
    totalRounds++;
    const rPar=r.par||par;
    const gross=sumArr(sc.map((s,i)=>s>0?s:rPar[i]));
    const hc=0; // would need hcMap
    totalGross+=gross;
    const net=gross-hc; totalNet+=net;
    if(net<bestNet) bestNet=net;
    sc.forEach((s,i)=>{
      if(s<=0) return;
      const d=s-rPar[i];
      if(d<=-2) eagles++;
      else if(d===-1) birdies++;
      else if(d===0) pars++;
      else if(d===1) bogeys++;
      else doubles++;
    });
    if(r.ctp){
      Object.values(r.ctp).forEach(v=>{if(v===playerName) ctpWins++;});
    }
  });
  return {totalRounds,totalGross,totalNet,avgGross:totalRounds?totalGross/totalRounds:0,avgNet:totalRounds?totalNet/totalRounds:0,birdies,eagles,pars,bogeys,doubles,bestNet:bestNet===999?null:bestNet,ctpWins,skins,wins};
};

// ── THEME — High contrast outdoor/sunlight optimized ─────
const C = {
  bg:'#ffffff', card:'#ffffff', card2:'#f5f5f5',
  border:'#d0d0d0', gold:'#B8860B', goldL:'#DAA520',
  text:'#111111', muted:'#555555', green:'#1B5E20',
  accent:'#2E7D32', light:'#F1F8E9', red:'#C62828',
  fA:'#1565C0', fB:'#6A1B9A', fC:'#E65100',
};
const FC={A:C.fA,B:C.fB,C:C.fC};

// ── SUNDAY SKINS LOGO ────────────────────────────────────
const Logo = ({size=44}) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    <rect x="2" y="2" width="116" height="116" rx="16" fill={C.green}/>
    <rect x="5" y="5" width="110" height="110" rx="13" fill="none" stroke={C.goldL} strokeWidth="1.5"/>
    <text x="60" y="24" textAnchor="middle" fill={C.goldL} style={{fontSize:'9px',fontWeight:700,fontFamily:"Georgia,serif",letterSpacing:'2px'}}>SUNDAY</text>
    <text x="60" y="40" textAnchor="middle" fill="#fff" style={{fontSize:'14px',fontWeight:900,fontFamily:"Georgia,serif",letterSpacing:'1.5px'}}>SKINS</text>
    <line x1="20" y1="46" x2="100" y2="46" stroke={C.goldL} strokeWidth="0.8" opacity="0.6"/>
    {/* Golf flag */}
    <line x1="60" y1="52" x2="60" y2="90" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    <polygon points="60,52 82,60 60,68" fill={C.goldL}/>
    {/* Golf ball */}
    <circle cx="60" cy="94" r="8" fill="#fff" stroke={C.goldL} strokeWidth="1"/>
    <circle cx="58" cy="92" r="1.5" fill="#ddd"/>
    <circle cx="62" cy="92" r="1.5" fill="#ddd"/>
    <circle cx="60" cy="96" r="1.5" fill="#ddd"/>
    <text x="60" y="112" textAnchor="middle" fill={C.goldL} style={{fontSize:'5.5px',fontFamily:'sans-serif',letterSpacing:'1.5px',opacity:0.8}}>GOLF GROUP</text>
  </svg>
);

// ─────────────────────────────────────────────────────────
export default function App() {
  const configured = SUPABASE_URL !== 'YOUR_SUPABASE_URL';
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const [view,setView]=useState('groups');
  const [adminMode,setAdmin]=useState(false);
  const [showPwBox,setShowPwBox]=useState(false);
  const [adminPw,setAdminPw]=useState('');
  const adminPwRef=useRef('');
  const ADMIN_PW='sunday2024';

  const [players,setPlayers]=useState([]);
  const [dbCourses,setDbCourses]=useState([]);
  const [rounds,setRounds]=useState([]);
  const [selRound,setSelRound]=useState(null);
  const [lastUpdated,setLastUpdated]=useState(null);
  const [payoutsHistory,setPayoutsHistory]=useState([]);

  // Scoring modal
  const [scoringPlayer,setScoringPlayer]=useState(null);
  const [scoringHole,setScoringHole]=useState(0);
  const [tempScores,setTempScores]=useState(Array(18).fill(0));

  // Remember Me — auto-open scoring for returning player
  const [myName,setMyName]=useState(()=>localStorage.getItem('sundaySkins_myName')||'');

  // New round
  const [newRoundStep,setNewRoundStep]=useState(1);
  const [newRound,setNewRound]=useState({date:'',courseId:'',numFlights:3});
  const [selectedPlayers,setSelectedPlayers]=useState([]);
  const [draftFlights,setDraftFlights]=useState({A:[],B:[],C:[]});       // Low Net flights
  const [draftSkinsFlights,setDraftSkinsFlights]=useState({A:[],B:[]}); // Skins A/B
  const [draftMbdFlights,setDraftMbdFlights]=useState({A:[],B:[]});     // 2MBD A/B
  const [ohShitPlayer,setOhShitPlayer]=useState(null);                   // sits out 2MBD
  const [mbdSeg1,setMbdSeg1]=useState([]);  // pairs for holes 1-6
  const [mbdSeg2,setMbdSeg2]=useState([]);  // pairs for holes 7-12
  const [mbdSeg3,setMbdSeg3]=useState([]);  // pairs for holes 13-18
  const [draftSuperSkins,setDraftSuperSkins]=useState([]);  // super skins opt-in
  const [draftGroups,setDraftGroups]=useState([]);                       // manual foursomes
  const [draftPairs,setDraftPairs]=useState([]);
  const [weeklyField,setWeeklyField]=useState([]);                        // players selected for this Sunday
  const [ctpLocal,setCtpLocal]=useState({});  // optimistic CTP state
  const [movingPlayer,setMovingPlayer]=useState(null);                    // player being moved between groups
  const [cfgEdit,setCfgEdit]=useState(null);
  const [addPlayerName,setAddPlayerName]=useState('');
  const [addPlayerHc,setAddPlayerHc]=useState('');

  const pollRef = useRef(null);

  const loadAll = useCallback(async(keepRound=null,silent=false)=>{
    if(!silent) setLoading(true);
    setErr('');
    try {
      const [pls,crs,rds,scs,ctps,pairs,cfgs,ph] = await Promise.all([
        sb('players?order=hc'),
        sb('courses?order=name'),
        sb('rounds?order=id.desc'),
        sb('scores?select=*'),
        sb('ctp?select=*'),
        sb('pairings?select=*&order=group_num,team_num'),
        sb('round_config?select=*'),
        sb('payouts?select=*').catch(()=>[]),
      ]);
      setPlayers(pls||[]);
      setDbCourses(crs||[]);
      setPayoutsHistory(ph||[]);
      const assembled=(rds||[]).map(r=>assembleRound(r,scs||[],ctps||[],pairs||[],cfgs||[],crs||[]));
      setRounds(assembled);
      if(assembled.length) setSelRound(prev=>keepRound??prev??assembled[0].id);
      setLastUpdated(new Date());
    } catch(e){setErr('DB: '+e.message);}
    if(!silent) setLoading(false);
  },[]);

  useEffect(()=>{
    if(!configured){setLoading(false);return;}
    loadAll();
    pollRef.current=setInterval(()=>loadAll(null,true),20000);
    return ()=>clearInterval(pollRef.current);
  },[]);

  const round=rounds.find(r=>r.id===selRound)||rounds[0];
  const hcMap=Object.fromEntries(players.map(p=>[p.name,p.hc]));
  const par=round?.par||[4,4,3,4,5,3,4,4,5,4,4,3,4,4,4,4,4,5];
  const parTotal=round?.parTotal||72;
  const par3Idx=par.reduce((a,p,i)=>p===3?[...a,i]:a,[]);
  const isLive=round?.status==='live';
  const isLocked=round?.status==='locked';

  // Season rank map — top 10 by total winnings, shown as gold badge in groups
  const seasonRankMap=useMemo(()=>{
    if(!payoutsHistory?.length) return {};
    const winnings={};
    payoutsHistory.forEach(p=>{
      if(!p?.player_name) return;
      if(!winnings[p.player_name]) winnings[p.player_name]=0;
      winnings[p.player_name]+=parseFloat(p.amount)||0;
    });
    return Object.fromEntries(
      Object.entries(winnings)
        .filter(([,v])=>v>0)
        .sort((a,b)=>b[1]-a[1])
        .slice(0,10)
        .map(([name],i)=>[name,i+1])
    );
  },[payoutsHistory]);

  const payouts=useMemo(()=>round?calcPayouts(round.config,round.scores,round.ctp,round.pairings,hcMap,par,parTotal):null,[round,players]);

  const flightedLB=useMemo(()=>{
    if(!round?.config) return {A:[],B:[],C:[]};
    const cfg=round.config;
    const flights=cfg.num_flights===2?{A:cfg.flight_a||[],B:cfg.flight_b||[]}:{A:cfg.flight_a||[],B:cfg.flight_b||[],C:cfg.flight_c||[]};
    const res={};
    Object.entries(flights).forEach(([k,p])=>{
      res[k]=p.filter(n=>round.scores[n]).map(n=>{
        const sc=round.scores[n].map((s,i)=>s>0?s:null);
        const played=sc.filter(Boolean);
        const gross=played.reduce((a,b)=>a+b,0);
        const parPlayed=par.filter((_,i)=>round.scores[n][i]>0).reduce((a,b)=>a+b,0);
        return {name:n,gross,net:gross-(hcMap[n]??0),hc:hcMap[n]??0,toPar:gross-parPlayed,holesPlayed:played.length};
      }).sort((a,b)=>a.net-b.net);
    });
    return res;
  },[round,players]);

  // ── SCORE ENTRY ─────────────────────────────────────────
  const openScoring = async (playerName) => {
    if(isLocked) return;
    // Remember this player for next time
    setMyName(playerName);
    localStorage.setItem('sundaySkins_myName', playerName);
    const existing = round?.scores[playerName];
    const scores = existing || Array(18).fill(0);
    setTempScores([...scores]);
    // Find first unplayed hole
    const firstEmpty = scores.findIndex(s=>s<=0);
    setScoringHole(firstEmpty>=0?firstEmpty:0);
    setScoringPlayer(playerName);
    // Create score row if doesn't exist
    if(!existing) {
      try {
        await sb('scores','POST',{round_id:round.id,player_name:playerName,holes:Array(18).fill(0)});
      } catch(e){}
    }
  };

  const saveHoleScore = async (hole, score) => {
    if(!scoringPlayer||!round) return;
    const updated=[...tempScores];
    updated[hole]=score;
    setTempScores(updated);
    try {
      await sb(`scores?round_id=eq.${round.id}&player_name=eq.${encodeURIComponent(scoringPlayer)}`,'PATCH',{holes:updated});
      loadAll(selRound,true);
    } catch(e){setErr('Save failed: '+e.message);}
  };

  const closeScoring = () => {setScoringPlayer(null);};

  // ── CTP ─────────────────────────────────────────────────
  const saveCtp = async(key, val, distance)=>{
    if(!round) return;
    // Optimistic update — show change immediately
    setCtpLocal(prev=>({...prev,[key]:{
      player: val!==undefined ? val : (prev[key]?.player||''),
      distance: distance!==undefined ? distance : (prev[key]?.distance||''),
    }}));
    const patch = {};
    if(val !== undefined) patch.player_name = val;
    if(distance !== undefined) patch.distance = distance;
    try{await sb(`ctp?round_id=eq.${round.id}&hole_key=eq.${key}`,'PATCH',patch);await loadAll(selRound,true);}
    catch(e){setErr(e.message);}
  };

  // ── LOCK ROUND ───────────────────────────────────────────
  const lockRound = async()=>{
    if(!round||!payouts) return;
    if(!window.confirm('Lock scoring and save final payouts?')) return;
    setSaving(true);
    try {
      await sb(`rounds?id=eq.${round.id}`,'PATCH',{status:'locked'});
      // Save payout history
      const rows=[];
      ['A','B','C'].forEach(f=>{
        if(!payouts.flightLowNet[f]) return;
        payouts.flightLowNet[f].places.forEach((p,i)=>rows.push({round_id:round.id,player_name:p.name,category:`low_net_${f.toLowerCase()}`,amount:p.payout,place:i+1}));
        (payouts.flightSkins[f]?.winners||[]).forEach(w=>rows.push({round_id:round.id,player_name:w.name,category:`skins_${f.toLowerCase()}`,amount:w.payout,place:1}));
      });
      // 2MBD segments
      (payouts.twoMbd.segments||[]).forEach((seg,i)=>{
        if(seg.winner) rows.push({round_id:round.id,player_name:seg.winner.pair.join(' & '),category:`2mbd_seg${i+1}`,amount:seg.pot,place:1});
      });
      payouts.superSkins.winners.forEach(w=>rows.push({round_id:round.id,player_name:w.name,category:'super_skins',amount:w.payout,place:1}));
      // CTP — all par 3s
      Object.entries(round.ctp||{}).forEach(([k,entry])=>{
        const winner=typeof entry==='object'?entry.player:entry;
        if(winner) rows.push({round_id:round.id,player_name:winner,category:`ctp_${k}`,amount:payouts.ctpPerHole,place:1});
      });
      if(rows.length) await sb('payouts','POST',rows);
      await loadAll(selRound);
    } catch(e){setErr(e.message);}
    setSaving(false);
  };

  // ── RESET SCORES ─────────────────────────────────────────
  const resetScores = async()=>{
    if(!round) return;
    const pw = window.prompt('Enter admin password to reset all scores:');
    if(pw!==ADMIN_PW){ setErr('Wrong password — scores not reset.'); return; }
    if(!window.confirm(`Reset ALL scores for ${round.date} at ${round.course?.name}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const playerNames = Object.keys(round.scores||{});
      for(const name of playerNames){
        await sb(`scores?round_id=eq.${round.id}&player_name=eq.${encodeURIComponent(name)}`,'PATCH',{holes:Array(18).fill(0)});
      }
      await loadAll(selRound);
    } catch(e){ setErr('Reset failed: '+e.message); }
    setSaving(false);
  };

  const deleteRound = async()=>{
    if(!round) return;
    const pw = window.prompt('Enter admin password to delete this round:');
    if(pw!==ADMIN_PW){ setErr('Wrong password — round not deleted.'); return; }
    if(!window.confirm(`PERMANENTLY DELETE round: ${round.date} at ${round.course?.name}?\n\nThis will delete ALL scores, pairings, and payouts for this round.`)) return;
    setSaving(true);
    try {
      // Cascade delete — Supabase will handle child tables via ON DELETE CASCADE
      await sb(`rounds?id=eq.${round.id}`,'DELETE');
      // Switch to next available round
      const remaining = rounds.filter(r=>r.id!==round.id);
      setSelRound(remaining.length?remaining[0].id:null);
      await loadAll(remaining.length?remaining[0].id:null);
      setView('groups');
    } catch(e){ setErr('Delete failed: '+e.message); }
    setSaving(false);
  };
  const autoAssignFlights = (selected,numFlights) => {
    const sorted=[...selected].sort((a,b)=>(hcMap[a]??0)-(hcMap[b]??0));
    const n=sorted.length;
    // Low Net flights
    let lowNet;
    if(numFlights===2){
      const half=Math.floor(n/2);
      lowNet={A:sorted.slice(0,half),B:sorted.slice(half),C:[]};
    } else {
      const third=Math.floor(n/3);
      lowNet={
        A:sorted.slice(0,third),
        B:sorted.slice(third,third*2),
        C:sorted.slice(third*2),
      };
    }
    // Skins & 2MBD always A/B even split
    const half=Math.floor(n/2);
    const skinsAndMbd={A:sorted.slice(0,half),B:sorted.slice(half)};
    return {lowNet, skinsAndMbd};
  };

  // Oh Shit draw — randomly pick one player to sit out 2MBD when odd number
  const doOhShitDraw = (allPlayers) => {
    if(allPlayers.length%2===0){ setOhShitPlayer(null); return allPlayers; }
    const idx=Math.floor(Math.random()*allPlayers.length);
    const sitOut=allPlayers[idx];
    setOhShitPlayer(sitOut);
    return allPlayers.filter(p=>p!==sitOut);
  };

  const autoGenerateGroups = (selected) => {
    const shuffled = shuffle(selected);
    const groups = [];
    for(let i=0;i<shuffled.length;i+=4)
      groups.push(shuffled.slice(i,Math.min(i+4,shuffled.length)));
    return groups;
  };

  const generateDraw = (mbdA,mbdB) => {
    return drawPairings(mbdA,mbdB);
  };

  // Generate 3 independent segment draws — fully random, anyone paired with anyone
  const generateSegmentDraws = (mbdA, mbdB) => {
    const allPlayers = shuffle([...mbdA, ...mbdB]);
    const makePairs = (players) => {
      const shuffled = shuffle([...players]);
      const pairs = [];
      for(let i=0;i<shuffled.length;i+=2)
        pairs.push(shuffled[i+1]?[shuffled[i],shuffled[i+1]]:[shuffled[i],'']);
      return pairs;
    };
    return [makePairs(allPlayers), makePairs(allPlayers), makePairs(allPlayers)];
  };

  const submitNewRound = async()=>{
    if(!newRound.date||!newRound.courseId||selectedPlayers.length<2) return;
    setSaving(true);
    try {
      const [rRow]=await sb('rounds','POST',{date:newRound.date,course_id:Number(newRound.courseId),status:'live'});
      const rid=rRow.id;
      // Insert empty scores for all players
      await sb('scores','POST',selectedPlayers.map(name=>({round_id:rid,player_name:name,holes:Array(18).fill(0)})));
      // Insert pairings — store foursomes as groups, 2MBD pairs as teams within each group
      // We store 2MBD pairs (draftPairs) in the pairings table for scoring
      const pairRows=[];
      draftPairs.forEach((grp,gi)=>grp.forEach((pair,ti)=>{
        pairRows.push({round_id:rid,group_num:gi+1,team_num:ti+1,player1:pair[0],player2:pair[1]||''});
      }));
      if(pairRows.length) await sb('pairings','POST',pairRows);
      // Store foursomes in round_config as groups json
      const foursomesJson = JSON.stringify(draftGroups);
      // CTP — create rows for every par 3 on the course
      const courseForRound = COURSES.find(a=>a.name===dbCourses.find(c=>c.id===Number(newRound.courseId))?.name);
      const coursePar = courseForRound?.holes_par || [4,4,3,4,5,3,4,4,5,4,4,3,4,4,4,4,4,5];
      const par3Keys = coursePar.map((p,i)=>p===3?`h${i+1}`:null).filter(Boolean);
      await sb('ctp','POST', par3Keys.map(key=>({round_id:rid, hole_key:key, player_name:'', distance:''})));
      // Config — save all flight data separately
      const oddLowNet=selectedPlayers.length%3!==0&&newRound.numFlights===3?draftFlights.C[draftFlights.C.length-1]:null;
      await sb('round_config','POST',{
        round_id:rid,buy_in:25,super_skin_fee:10,pct_ctp:20,pct_low_net:30,pct_skins:20,pct_2mbd:30,
        num_flights:newRound.numFlights,
        // Low Net flights
        flight_a:draftFlights.A,flight_b:draftFlights.B,
        flight_c:newRound.numFlights===3?draftFlights.C:[],
        // Skins flights (A & B only)
        skins_a:draftSkinsFlights.A,skins_b:draftSkinsFlights.B,
        // 2MBD flights (A & B only) + 3 segment draws
        mbd_a:draftMbdFlights.A,mbd_b:draftMbdFlights.B,
        mbd_seg1:mbdSeg1, mbd_seg2:mbdSeg2, mbd_seg3:mbdSeg3,
        oh_shit_player:ohShitPlayer||null,
        super_skin_players:draftSuperSkins,odd_player:null,
        foursomes:draftGroups,
      });
      setNewRound({date:'',courseId:'',numFlights:3});
      setSelectedPlayers([]);
      setDraftFlights({A:[],B:[],C:[]});
      setDraftSkinsFlights({A:[],B:[]});
      setDraftMbdFlights({A:[],B:[]});
      setOhShitPlayer(null);
      setMbdSeg1([]);setMbdSeg2([]);setMbdSeg3([]);
      setDraftGroups([]);
      setDraftSuperSkins([]);
      setDraftPairs([]);
      setNewRoundStep(1);setSelRound(rid);
      await loadAll(rid);setView('groups');
    } catch(e){setErr(e.message);}
    setSaving(false);
  };

  const saveConfig=async()=>{
    if(!cfgEdit||!round) return;
    setSaving(true);
    try {
      await sb(`round_config?round_id=eq.${round.id}`,'PATCH',{
        buy_in:cfgEdit.buy_in,super_skin_fee:cfgEdit.super_skin_fee,
        pct_ctp:cfgEdit.pct_ctp,pct_low_net:cfgEdit.pct_low_net,
        pct_skins:cfgEdit.pct_skins,pct_2mbd:cfgEdit.pct_2mbd,
        num_flights:cfgEdit.num_flights,
        flight_a:cfgEdit.flight_a,flight_b:cfgEdit.flight_b,flight_c:cfgEdit.flight_c,
        super_skin_players:cfgEdit.super_skin_players,odd_player:cfgEdit.odd_player||null,
      });
      setCfgEdit(null);await loadAll(selRound);
    } catch(e){setErr(e.message);}
    setSaving(false);
  };

  const addPlayer=async()=>{
    if(!addPlayerName.trim()||addPlayerHc==='') return;
    setSaving(true);
    try{await sb('players','POST',{name:addPlayerName.trim(),hc:Number(addPlayerHc)});setAddPlayerName('');setAddPlayerHc('');await loadAll(selRound);}
    catch(e){setErr(e.message);}setSaving(false);
  };

  // ── NAV ───────────────────────────────────────────────
  const nav=[
    {key:'groups',  label:'Groups',     icon:'⛳'},
    {key:'live',    label:'Live $',     icon:'💵'},
    {key:'board',   label:'Scores',     icon:'🏆'},
    {key:'skins',   label:'Skins',      icon:'🎯'},
    {key:'draw',    label:'2MBD',       icon:'🎲'},
    {key:'season',  label:'Season',     icon:'📊'},
    {key:'stats',   label:'Stats',      icon:'🏅'},
    ...(adminMode?[
      {key:'newround',label:'New Round',icon:'➕'},
      {key:'setup',   label:'Setup',    icon:'⚙️'},
      {key:'roster',  label:'Roster',   icon:'👥'},
    ]:[]),
  ];

  const Card=({children,style:s={}})=><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',...s}}>{children}</div>;
  const CardHead=({children,right})=>(
    <div style={{background:C.card2,padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{color:C.green,fontSize:'0.77rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase'}}>{children}</span>
      {right&&<span>{right}</span>}
    </div>
  );
  const FlightBadge=({f})=><span style={{background:FC[f]+'18',color:FC[f],borderRadius:4,padding:'2px 9px',fontSize:'0.7rem',fontWeight:700,border:`1px solid ${FC[f]}30`}}>Flight {f}</span>;
  const Btn=({children,onClick,color=C.green,disabled,small,outline,style:s={}})=>(
    <button onClick={onClick} disabled={disabled} style={{
      background:outline?'transparent':disabled?C.border:color,
      color:outline?color:disabled?C.muted:'#fff',
      border:`1.5px solid ${disabled?C.border:color}`,
      borderRadius:7,padding:small?'5px 12px':'9px 18px',
      fontWeight:700,fontSize:small?'0.75rem':'0.85rem',cursor:disabled?'default':'pointer',
      opacity:disabled?0.6:1,transition:'all .15s',...s,
    }}>{children}</button>
  );

  if(!configured) return (
    <div style={{background:C.bg,minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <Card style={{maxWidth:520,width:'100%',padding:36}}>
        <div style={{textAlign:'center',marginBottom:24}}><Logo size={72}/>
          <h1 style={{fontFamily:"'Playfair Display',serif",color:C.green,fontSize:'1.6rem',margin:'12px 0 4px'}}>Sunday Skins</h1>
          <p style={{color:C.muted,fontSize:'0.82rem',margin:0}}>Add your Supabase credentials to the top of this file</p>
        </div>
        <div style={{background:C.light,borderRadius:8,padding:14,fontFamily:"'DM Mono',monospace",fontSize:'0.74rem'}}>
          <div style={{color:C.muted,marginBottom:4}}>// top of sunday-skins.jsx</div>
          <div style={{color:C.text}}>const SUPABASE_URL = <span style={{color:C.green}}>'https://xxxx.supabase.co'</span>;</div>
          <div style={{color:C.text}}>const SUPABASE_ANON_KEY = <span style={{color:C.green}}>'eyJhbGci...'</span>;</div>
        </div>
      </Card>
    </div>
  );

  if(loading) return (
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{textAlign:'center'}}>
        <div style={{display:'inline-block',animation:'spin 1.4s linear infinite',fontSize:'2.5rem',marginBottom:12}}>⛳</div>
        <div style={{color:C.muted,fontSize:'0.85rem'}}>Loading Sunday Skins…</div>
      </div>
    </div>
  );

  return (
    <div style={{background:C.bg,minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",color:C.text,overflowX:'hidden'}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { opacity:1; }
      `}</style>

      {/* Error bar */}
      {err&&<div style={{background:'#fee2e2',borderBottom:'1px solid #fca5a5',padding:'7px 20px',display:'flex',justifyContent:'space-between'}}>
        <span style={{color:C.red,fontSize:'0.8rem'}}>⚠️ {err}</span>
        <button onClick={()=>setErr('')} style={{background:'transparent',border:'none',color:C.red,cursor:'pointer'}}>✕</button>
      </div>}
      {saving&&<div style={{background:C.green,padding:'4px',textAlign:'center',fontSize:'0.72rem',color:'#fff',fontWeight:700,letterSpacing:'0.05em'}}>SAVING…</div>}

      {/* Live update indicator */}
      {lastUpdated&&isLive&&(
        <div style={{background:C.light,borderBottom:`1px solid ${C.border}`,padding:'3px 16px',textAlign:'center',fontSize:'0.67rem',color:C.muted}}>
          🔴 LIVE · Last updated {Math.round((new Date()-lastUpdated)/1000)}s ago · Auto-refreshes every 20s
        </div>
      )}

      {/* My Scorecard — quick access for remembered player */}
      {myName&&isLive&&round?.scores&&Object.keys(round.scores).includes(myName)&&!scoringPlayer&&(
        <div style={{background:C.green,padding:'8px 16px',display:'flex',justifyContent:'center',alignItems:'center',gap:10,cursor:'pointer',borderBottom:'2px solid #145218'}}
          onClick={()=>openScoring(myName)}>
          <span style={{color:'#fff',fontSize:'1rem',fontWeight:700}}>⛳ Open My Scorecard — {myName}</span>
          <span style={{background:'rgba(255,255,255,0.25)',color:'#fff',borderRadius:6,padding:'3px 10px',fontSize:'0.8rem',fontWeight:600}}>
            {(round.scores[myName]||[]).filter(s=>s>0).length}/18
          </span>
        </div>
      )}

      {/* Admin PW modal */}
      {showPwBox&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Card style={{padding:28,minWidth:280,border:`1px solid ${C.border}`}}>
            <div style={{color:C.green,fontWeight:700,marginBottom:12}}>🔒 Admin Password</div>
            <input type="password" onChange={e=>{adminPwRef.current=e.target.value;}} placeholder="Password"
              onKeyDown={e=>{if(e.key==='Enter'){if(adminPwRef.current===ADMIN_PW){setAdmin(true);setShowPwBox(false);adminPwRef.current='';}else setErr('Wrong password');}}}
              style={{width:'100%',border:`1.5px solid ${C.border}`,borderRadius:6,padding:'8px 12px',fontSize:'0.9rem',marginBottom:10}}/>
            <div style={{display:'flex',gap:8}}>
              <Btn onClick={()=>{if(adminPwRef.current===ADMIN_PW){setAdmin(true);setShowPwBox(false);adminPwRef.current='';}else setErr('Wrong password');}}>Unlock</Btn>
              <Btn outline onClick={()=>{setShowPwBox(false);adminPwRef.current='';}}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Scoring Modal — Number Pad */}
      {scoringPlayer&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:90,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,padding:'16px 16px 24px',maxHeight:'95vh',overflowY:'auto'}}>
            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div>
                <div style={{fontWeight:800,fontSize:'1.2rem',color:C.green}}>{scoringPlayer}</div>
                <div style={{color:C.muted,fontSize:'0.85rem',fontWeight:500}}>HC {hcMap[scoringPlayer]??'?'} · Gross {sumArr(tempScores.filter(s=>s>0))} · {tempScores.filter(s=>s>0).length}/18</div>
              </div>
              <button onClick={closeScoring} style={{background:'#eee',border:'none',borderRadius:'50%',width:40,height:40,fontSize:'1.2rem',cursor:'pointer',color:'#333',fontWeight:700}}>✕</button>
            </div>

            {/* Current hole display */}
            <div style={{background:tempScores[scoringHole]>0?scoreBg(tempScores[scoringHole],par[scoringHole]):'#f5f5f5',borderRadius:14,padding:'14px 16px',marginBottom:14,border:`2px solid ${tempScores[scoringHole]>0?scoreColor(tempScores[scoringHole],par[scoringHole]):'#ddd'}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <button onClick={()=>setScoringHole(h=>Math.max(0,h-1))} disabled={scoringHole===0}
                  style={{background:scoringHole===0?'#eee':C.green,color:scoringHole===0?'#aaa':'#fff',border:'none',borderRadius:8,padding:'10px 16px',fontSize:'1rem',fontWeight:700,cursor:scoringHole===0?'default':'pointer'}}>◀</button>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:'0.85rem',fontWeight:700,color:C.muted,letterSpacing:'0.1em'}}>HOLE {scoringHole+1}</div>
                  <div style={{fontSize:'0.8rem',color:C.muted}}>PAR {par[scoringHole]}</div>
                </div>
                <button onClick={()=>setScoringHole(h=>Math.min(17,h+1))} disabled={scoringHole===17}
                  style={{background:scoringHole===17?'#eee':C.green,color:scoringHole===17?'#aaa':'#fff',border:'none',borderRadius:8,padding:'10px 16px',fontSize:'1rem',fontWeight:700,cursor:scoringHole===17?'default':'pointer'}}>▶</button>
              </div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'3.5rem',fontWeight:900,fontFamily:"'DM Mono',monospace",color:tempScores[scoringHole]>0?scoreColor(tempScores[scoringHole],par[scoringHole]):'#bbb',lineHeight:1}}>
                  {tempScores[scoringHole]>0?tempScores[scoringHole]:'—'}
                </div>
                {tempScores[scoringHole]>0&&(
                  <div style={{fontSize:'1rem',fontWeight:800,color:scoreColor(tempScores[scoringHole],par[scoringHole]),marginTop:2}}>
                    {tempScores[scoringHole]-par[scoringHole]===0?'PAR':tempScores[scoringHole]-par[scoringHole]<=-2?'EAGLE':tempScores[scoringHole]-par[scoringHole]===-1?'BIRDIE':tempScores[scoringHole]-par[scoringHole]===1?'BOGEY':tempScores[scoringHole]-par[scoringHole]===2?'DOUBLE':'TRIPLE+'}
                  </div>
                )}
              </div>
            </div>

            {/* Number Pad — big buttons for outdoor use */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6,marginBottom:14}}>
              {[1,2,3,4,5,6,7,8,9,0].map(n=>{
                const isActive = tempScores[scoringHole]===n && n>0;
                const isPar = n===par[scoringHole];
                if(n===0) return (
                  <button key="clear" onClick={()=>saveHoleScore(scoringHole,0)}
                    style={{gridColumn:'span 1',background:'#ffebee',color:C.red,border:`2px solid #ef9a9a`,borderRadius:10,padding:'14px 0',fontSize:'1.1rem',fontWeight:700,cursor:'pointer'}}>CLR</button>
                );
                return (
                  <button key={n} onClick={()=>{saveHoleScore(scoringHole,n);if(scoringHole<17)setTimeout(()=>setScoringHole(h=>h+1),300);}}
                    style={{background:isActive?C.green:isPar?'#E8F5E9':'#fff',color:isActive?'#fff':isPar?C.green:'#111',border:`2px solid ${isActive?C.green:isPar?'#81C784':'#ccc'}`,borderRadius:10,padding:'14px 0',fontSize:'1.3rem',fontWeight:800,cursor:'pointer',fontFamily:"'DM Mono',monospace",transition:'all .1s'}}>
                    {n}
                  </button>
                );
              })}
            </div>

            {/* Mini scorecard — front 9 */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:3,marginBottom:4}}>
              {Array(9).fill(0).map((_,i)=>(
                <div key={i} onClick={()=>setScoringHole(i)}
                  style={{textAlign:'center',cursor:'pointer',padding:'5px 2px',borderRadius:6,background:scoringHole===i?C.green:tempScores[i]>0?scoreBg(tempScores[i],par[i]):'#f5f5f5',border:`2px solid ${scoringHole===i?C.green:tempScores[i]>0?scoreColor(tempScores[i],par[i]):'#ddd'}`}}>
                  <div style={{fontSize:'0.6rem',color:scoringHole===i?'#fff':C.muted,fontWeight:600}}>{i+1}</div>
                  <div style={{fontSize:'0.9rem',fontWeight:800,color:scoringHole===i?'#fff':tempScores[i]>0?scoreColor(tempScores[i],par[i]):'#bbb',fontFamily:"'DM Mono',monospace"}}>
                    {tempScores[i]>0?tempScores[i]:'·'}
                  </div>
                </div>
              ))}
            </div>
            {/* Back 9 */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:3,marginBottom:14}}>
              {Array(9).fill(0).map((_,i)=>(
                <div key={i+9} onClick={()=>setScoringHole(i+9)}
                  style={{textAlign:'center',cursor:'pointer',padding:'5px 2px',borderRadius:6,background:scoringHole===i+9?C.green:tempScores[i+9]>0?scoreBg(tempScores[i+9],par[i+9]):'#f5f5f5',border:`2px solid ${scoringHole===i+9?C.green:tempScores[i+9]>0?scoreColor(tempScores[i+9],par[i+9]):'#ddd'}`}}>
                  <div style={{fontSize:'0.6rem',color:scoringHole===i+9?'#fff':C.muted,fontWeight:600}}>{i+10}</div>
                  <div style={{fontSize:'0.9rem',fontWeight:800,color:scoringHole===i+9?'#fff':tempScores[i+9]>0?scoreColor(tempScores[i+9],par[i+9]):'#bbb',fontFamily:"'DM Mono',monospace"}}>
                    {tempScores[i+9]>0?tempScores[i+9]:'·'}
                  </div>
                </div>
              ))}
            </div>

            <Btn onClick={closeScoring} style={{width:'100%',padding:'14px',fontSize:'1.1rem'}}>Done ✓</Btn>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{background:'#fff',borderBottom:`2px solid ${C.border}`,position:'sticky',top:0,zIndex:50,boxShadow:'0 2px 8px rgba(0,0,0,0.1)'}}>
        <div style={{maxWidth:1060,margin:'0 auto',padding:'0 12px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'8px 0'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
              <Logo size={36}/>
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",color:C.green,fontSize:'1rem',lineHeight:1.2,fontWeight:700}}>Sunday Skins</div>
                <div style={{color:C.muted,fontSize:'0.7rem',marginTop:1,fontWeight:500}}>
                  {round?.course?.name} · {round?.date}
                  {round?.status==='locked'&&<span style={{color:C.red,marginLeft:6,fontWeight:700}}>🔒</span>}
                  {round?.status==='live'&&<span style={{color:'#2E7D32',marginLeft:6,fontWeight:700}}>🟢</span>}
                </div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <select value={selRound??''} onChange={e=>setSelRound(Number(e.target.value))}
                style={{background:'#f5f5f5',color:'#111',border:`2px solid ${C.border}`,borderRadius:8,padding:'6px 10px',fontSize:'0.8rem',fontWeight:600,maxWidth:140}}>
                {rounds.map(r=><option key={r.id} value={r.id}>{r.date}</option>)}
              </select>
              <button onClick={()=>adminMode?setAdmin(false):setShowPwBox(true)} style={{
                background:adminMode?'#E8F5E9':'#f5f5f5',color:adminMode?C.green:'#666',
                border:`2px solid ${adminMode?C.green:'#ddd'}`,borderRadius:8,padding:'6px 10px',fontSize:'0.8rem',cursor:'pointer',fontWeight:700,
              }}>{adminMode?'🔓':'🔒'}</button>
            </div>
          </div>
          {/* Nav tabs — bigger for mobile */}
          <div style={{display:'flex',alignItems:'center',gap:4,overflowX:'auto',paddingBottom:8,WebkitOverflowScrolling:'touch'}}>
            {nav.map(n=>(
              <button key={n.key} onClick={()=>setView(n.key)} style={{
                background:view===n.key?C.green:'transparent',color:view===n.key?'#fff':'#555',
                border:`2px solid ${view===n.key?C.green:'#ddd'}`,borderRadius:8,
                padding:'8px 12px',fontSize:'0.82rem',fontWeight:view===n.key?700:600,cursor:'pointer',
                display:'flex',alignItems:'center',gap:4,whiteSpace:'nowrap',flexShrink:0,
              }}><span>{n.icon}</span><span>{n.label}</span></button>
            ))}
          </div>
        </div>
      </header>

      <main style={{maxWidth:1060,margin:'0 auto',padding:'14px 10px'}}>

        {/* ══════ GROUPS / LIVE SCORING ══════════════════════ */}
        {view==='groups'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:16,flexWrap:'wrap',gap:10}}>
              <div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:2,color:C.green}}>⛳ Today's Groups</h2>
                <p style={{color:C.muted,fontSize:'0.75rem',margin:0}}>
                  {round?.course?.name} · CR {round?.course?.rating}/{round?.course?.slope} · Par {parTotal}
                  {isLive&&' · Tap your name to enter scores'}
                </p>
              </div>
              {adminMode&&isLive&&(
                <div style={{display:'flex',gap:8}}>
                  <Btn outline color={C.red} onClick={resetScores}>🗑️ Reset Scores</Btn>
                  <Btn color={C.red} onClick={lockRound}>🔒 Lock Scoring</Btn>
                </div>
              )}
              {adminMode&&(
                <Btn outline color={C.red} small onClick={deleteRound}>🗑 Delete Round</Btn>
              )}
            </div>

            {(!round?.config?.foursomes?.length&&!round?.pairings?.length)&&(
              <Card style={{padding:40,textAlign:'center'}}>
                <div style={{fontSize:'2rem',marginBottom:12}}>⛳</div>
                <p style={{color:C.muted}}>No round set up yet. Admin → New Round to get started.</p>
              </Card>
            )}

            {/* Show foursomes if available, otherwise fall back to 2MBD groups */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
              {(round?.config?.foursomes?.length
                ? round.config.foursomes.map((grp,gi)=>({gi, players:grp, type:'foursome'}))
                : (round?.pairings||[]).map((pairs,gi)=>({gi, players:pairs.flat().filter(Boolean), type:'mbd'}))
              ).map(({gi,players,type})=>(
                <Card key={gi}>
                  <CardHead>
                    Group {gi+1} · {players.length} players
                    {type==='foursome'&&<span style={{color:C.muted,fontSize:'0.68rem',fontWeight:400,marginLeft:6}}>Tee {gi+1}</span>}
                  </CardHead>
                  <div style={{padding:10,display:'flex',flexDirection:'column',gap:6}}>
                    {players.map(name=>{
                      if(!name) return null;
                      const sc=round.scores[name]||[];
                      const played=sc.filter(s=>s>0);
                      const gross=sumArr(played);
                      const holesPlayed=played.length;
                      const flight=round.config?.flight_a?.includes(name)?'A':round.config?.flight_b?.includes(name)?'B':'C';
                      const allDone=holesPlayed===18;
                      const isMe=name===myName;
                      // Find this player's 2MBD partner
                      const mbdPair = round.pairings?.flatMap(g=>g).find(p=>p.includes(name));
                      const mbdPartner = mbdPair?.find(p=>p&&p!==name);
                      return (
                        <div key={name} onClick={()=>isLive&&openScoring(name)}
                          style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',background:isMe?'#E8F5E9':C.card,borderRadius:8,cursor:isLive?'pointer':'default',border:`2px solid ${isMe?C.green:isLive&&holesPlayed===0?C.accent:C.border}`,transition:'all .1s'}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <FlightBadge f={flight}/>
                            <div>
                              <div style={{fontWeight:700,fontSize:'1rem',display:'flex',alignItems:'center',gap:6,color:'#111'}}>
                                {name}
                                {isMe&&<span style={{fontSize:'0.7rem',color:C.green}}>⭐</span>}
                                {seasonRankMap[name]&&(
                                  <span style={{
                                    background:seasonRankMap[name]===1?C.gold:seasonRankMap[name]<=3?'#b8860b':'#7a6a30',
                                    color:'#fff',borderRadius:4,
                                    padding:'2px 7px',fontSize:'0.7rem',
                                    fontWeight:700,fontFamily:"'DM Mono',monospace",
                                    letterSpacing:'0.03em',flexShrink:0,
                                  }}>
                                    #{seasonRankMap[name]}
                                  </span>
                                )}
                              </div>
                              <div style={{color:C.muted,fontSize:'0.8rem',fontWeight:500}}>
                                HC {hcMap[name]??'?'}
                                {mbdPartner&&<span style={{marginLeft:6,color:C.gold,fontWeight:600}}>2MBD w/ {mbdPartner}</span>}
                              </div>
                            </div>
                          </div>
                          <div style={{textAlign:'right',display:'flex',alignItems:'center',gap:10}}>
                            {holesPlayed>0&&(
                              <div>
                                <div style={{fontFamily:"'DM Mono',monospace",fontWeight:800,fontSize:'1.2rem',color:C.green}}>{gross}</div>
                                <div style={{color:C.muted,fontSize:'0.8rem',fontWeight:500}}>{holesPlayed}/18 {allDone?'✅':''}</div>
                              </div>
                            )}
                            {isLive&&(
                              <div style={{background:holesPlayed===0?C.green:'#C8E6C9',color:holesPlayed===0?'#fff':C.green,borderRadius:8,padding:'8px 14px',fontSize:'0.9rem',fontWeight:700,whiteSpace:'nowrap',border:`2px solid ${holesPlayed===0?C.green:'#81C784'}`}}>
                                {holesPlayed===0?'⛳ Start':'✏️ Edit'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ══════ LIVE PAYOUTS ══════════════════════════════ */}
        {view==='live'&&(
          <div>
            <div style={{marginBottom:16}}>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:2,color:C.green}}>💵 Live Payout Board</h2>
              <p style={{color:C.muted,fontSize:'0.75rem',margin:0}}>
                {payouts?.fieldSize||0} players · ${round?.config?.buy_in||25} buy-in · Total pot <span style={{color:C.green,fontWeight:700}}>{fmt$0(payouts?.totalPot||0)}</span>
                {payouts?.superSkinPot>0&&<> · Super Skins <span style={{color:C.gold,fontWeight:700}}>{fmt$0(payouts.superSkinPot)}</span></>}
                {payouts?.oddPlayer&&<span style={{color:C.red}}> · ⚠️ {payouts.oddPlayer} refunded</span>}
              </p>
            </div>

            {!payouts&&<Card style={{padding:40,textAlign:'center'}}><p style={{color:C.muted}}>No configuration yet. Admin → Setup.</p></Card>}

            {payouts&&(<>
              {/* Pot summary */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
                {[
                  {icon:'📍',label:'CTP',          pot:payouts.ctpPot,         sub:`${fmt$0(payouts.ctpPerHole)}/hole`,         super:false},
                  {icon:'🏅',label:'Low Net',      pot:payouts.lowNetPot,      sub:`${fmt$0(payouts.lowNetPot/(payouts.lowNetFlights?.length||2))}/flight`, super:false},
                  {icon:'🎯',label:'Skins',        pot:payouts.skinsPot,       sub:`${fmt$0(payouts.skinsPot/2)}/flt · A&B`,  super:false},
                  {icon:'🎲',label:'2MBD',         pot:payouts.twoMbdPot,      sub:`${fmt$0(payouts.twoMbd?.segPot||0)}/seg`, super:false},
                  {icon:null, label:'Super Skins', pot:payouts.superSkinPot,   sub:`${(payouts.superSkins?.players||[]).length} opted in`, super:true},
                ].map(x=>(
                  <Card key={x.label} style={x.super?{background:'#1a3a0e',border:`2px solid ${C.gold}`}:{}}>
                    <div style={{padding:'10px 8px',textAlign:'center'}}>
                      {x.super?(
                        <svg width="24" height="24" viewBox="0 0 28 28" fill="none" style={{margin:'0 auto 3px',display:'block'}}>
                          <circle cx="14" cy="14" r="13" fill="#b8860b"/>
                          <polygon points="14,3 17,10 24,8 18,15 22,25 14,19 6,25 10,15 4,8 11,10" fill="#f0e8c8" stroke="#7a5c08" strokeWidth="0.5"/>
                          <text x="14" y="18" textAnchor="middle" fill="#1a3a0e" fontFamily="Georgia,serif" fontSize="10" fontWeight="900">SS</text>
                        </svg>
                      ):(
                        <div style={{fontSize:'1rem',marginBottom:3}}>{x.icon}</div>
                      )}
                      <div style={{color:x.super?'#f0e8c8':C.muted,fontSize:'0.58rem',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:2,fontWeight:x.super?700:400}}>{x.label}</div>
                      <div style={{color:C.gold,fontWeight:800,fontSize:'1.1rem',fontFamily:"'DM Mono',monospace"}}>{fmt$0(x.pot)}</div>
                      <div style={{color:x.super?'#86efac':C.muted,fontSize:'0.58rem',marginTop:2,lineHeight:1.3}}>{x.sub}</div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Low Net per flight */}
              <div style={{marginBottom:6}}>
                <div style={{color:C.muted,fontSize:'0.7rem',fontWeight:600,letterSpacing:'0.05em',marginBottom:6}}>🏅 LOW NET — {payouts.lowNetFlights?.length||2} FLIGHTS</div>
                <div style={{display:'grid',gridTemplateColumns:`repeat(${payouts.lowNetFlights?.length||2},1fr)`,gap:12,marginBottom:14}}>
                  {(payouts.lowNetFlights||[{k:'A'},{k:'B'}]).map(({k})=>(
                    <Card key={k}>
                      <CardHead><FlightBadge f={k}/> <span style={{color:C.muted,fontSize:'0.68rem',fontWeight:400,marginLeft:4}}>{fmt$0(payouts.flightLowNet[k]?.pot||0)}</span></CardHead>
                      <div style={{padding:10}}>
                        {(payouts.flightLowNet[k]?.places||[]).map((p,i)=>(
                          <div key={p.name} style={{display:'flex',justifyContent:'space-between',padding:'5px 8px',background:i===0?C.light:C.bg,borderRadius:5,marginBottom:4,border:`1px solid ${C.border}`}}>
                            <span style={{fontSize:'0.78rem',fontWeight:i===0?600:400}}>{['🥇','🥈','🥉'][i]} {p.name}</span>
                            <div style={{textAlign:'right'}}>
                              <span style={{color:C.gold,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{fmt$0(p.payout)}</span>
                              <span style={{color:C.muted,fontSize:'0.67rem',marginLeft:6}}>net {p.net}</span>
                            </div>
                          </div>
                        ))}
                        {!(payouts.flightLowNet[k]?.places||[]).length&&<p style={{color:C.muted,fontSize:'0.74rem',margin:0}}>In progress…</p>}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Skins A & B only */}
              <div style={{marginBottom:6}}>
                <div style={{color:C.muted,fontSize:'0.7rem',fontWeight:600,letterSpacing:'0.05em',marginBottom:6}}>🎯 SKINS — A & B FLIGHTS ONLY</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
                  {(payouts.skinsFlights||[{k:'A'},{k:'B'}]).map(({k})=>(
                    <Card key={k}>
                      <CardHead><FlightBadge f={k}/> <span style={{color:C.muted,fontSize:'0.68rem',fontWeight:400,marginLeft:4}}>{fmt$0(payouts.flightSkins[k]?.pot||0)} · {fmt$(payouts.flightSkins[k]?.perSkin||0)}/skin</span></CardHead>
                      <div style={{padding:10}}>
                        {(payouts.flightSkins[k]?.winners||[]).slice(0,3).map((w,i)=>(
                          <div key={w.name} style={{display:'flex',justifyContent:'space-between',padding:'5px 8px',background:C.bg,borderRadius:5,marginBottom:4,border:`1px solid ${C.border}`}}>
                            <span style={{fontSize:'0.77rem',color:C.muted}}>{w.name} ×{w.count}</span>
                            <span style={{color:'#16a34a',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{fmt$0(w.payout)}</span>
                          </div>
                        ))}
                        {!(payouts.flightSkins[k]?.winners||[]).length&&<p style={{color:C.muted,fontSize:'0.74rem',margin:0}}>No outright winners yet</p>}
                        {(payouts.flightSkins[k]?.totalCarry||0)>0&&<div style={{color:C.red,fontSize:'0.69rem',marginTop:4}}>⚡ {payouts.flightSkins[k].totalCarry} carrying over</div>}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Super Skins */}
              {payouts.superSkinPot>0&&(
                <Card style={{marginBottom:14,border:`1px solid ${C.gold}40`}}>
                  <CardHead>💀 Super Skins — {fmt$0(payouts.superSkinPot)} · {fmt$(payouts.superSkins.perSkin)}/skin · {payouts.superSkins.players.length} players</CardHead>
                  <div style={{padding:'12px 16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                    <div>
                      {payouts.superSkins.winners.length===0
                        ?<p style={{color:C.muted,fontSize:'0.8rem',margin:0}}>All tied — pot carrying</p>
                        :payouts.superSkins.winners.map(({name,count,payout},i)=>(
                          <div key={name} style={{display:'flex',justifyContent:'space-between',padding:'7px 10px',background:i===0?C.light:C.bg,borderRadius:6,marginBottom:5,border:`1px solid ${C.border}`}}>
                            <span style={{fontWeight:i===0?700:400}}>{i===0?'🏆 ':''}{name} <span style={{color:C.muted,fontSize:'0.7rem'}}>×{count}</span></span>
                            <span style={{color:C.gold,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{fmt$0(payout)}</span>
                          </div>
                        ))
                      }
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:3}}>
                      {payouts.superSkins.holes.map((h,i)=>(
                        <div key={i} style={{background:h.winner?'#dcfce7':h.tied?'#fef9c3':C.light,borderRadius:4,padding:'4px 2px',textAlign:'center',border:`1px solid ${h.winner?'#86efac':h.tied?'#fde047':C.border}`}}>
                          <div style={{color:C.muted,fontSize:'0.56rem'}}>{i+1}</div>
                          <div style={{color:h.winner?'#16a34a':h.tied?'#ca8a04':C.muted,fontSize:'0.6rem',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {h.winner?h.winner.split(' ')[0]:h.tied?'TIE':'—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {/* CTP + 2MBD — stacked vertically on mobile */}
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <Card>
                  <CardHead>📍 Closest to Pin — {fmt$0(payouts.ctpPot)} · {fmt$0(payouts.ctpPerHole)}/hole</CardHead>
                  <div style={{padding:'12px 16px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
                    {par3Idx.length===0&&<p style={{color:C.muted,fontSize:'0.76rem',margin:0}}>No par 3s found for this course.</p>}
                    {par3Idx.map(holeIdx=>{
                      const key=`h${holeIdx+1}`;
                      const remoteEntry=round?.ctp?.[key]||{};
                      const localEntry=ctpLocal[key];
                      const winner = localEntry?.player ?? (typeof remoteEntry==='object' ? remoteEntry.player : remoteEntry) ?? '';
                      const distance = localEntry?.distance ?? (typeof remoteEntry==='object' ? remoteEntry.distance : '') ?? '';
                      const allInRound=Object.keys(round?.scores||{}).sort();
                      return (
                        <div key={key} style={{background:C.light,borderRadius:7,padding:'9px 12px',border:`1px solid ${winner?C.green:C.border}`}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                            <span style={{fontWeight:700,fontSize:'0.8rem',color:C.green,whiteSpace:'nowrap'}}>Hole {holeIdx+1} — Par 3</span>
                            <span style={{color:C.gold,fontWeight:700,fontSize:'0.75rem',fontFamily:"'DM Mono',monospace",marginLeft:8,flexShrink:0}}>{fmt$0(payouts.ctpPerHole)}</span>
                          </div>
                          <select value={winner||''} onChange={e=>saveCtp(key,e.target.value,distance)}
                            style={{width:'100%',border:`1px solid ${C.border}`,borderRadius:5,padding:'5px 8px',fontSize:'0.78rem',marginBottom:6,background:winner?'#dcfce7':C.card}}>
                            <option value=''>— Tap to claim CTP —</option>
                            {allInRound.map(n=><option key={n} value={n}>{n}</option>)}
                          </select>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <input
                              key={`${key}-${distance}`}
                              defaultValue={distance||''}
                              placeholder={`e.g. 4'2"`}
                              onBlur={e=>{if(e.target.value!==distance) saveCtp(key,winner,e.target.value);}}
                              style={{flex:1,border:`1px solid ${C.border}`,borderRadius:5,padding:'4px 8px',fontSize:'0.76rem',background:C.card}}
                            />
                            <span style={{color:C.muted,fontSize:'0.68rem',whiteSpace:'nowrap'}}>from pin</span>
                          </div>
                          {winner&&(
                            <div style={{marginTop:5,color:C.green,fontSize:'0.78rem',fontWeight:700}}>
                              🏆 {winner}{distance?` · ${distance}`:''}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
                <Card>
                  <CardHead>🎲 2MBD — {fmt$0(payouts.twoMbdPot)} · 3 segments · {fmt$0(payouts.twoMbd.segPot)}/segment</CardHead>
                  <div style={{padding:'12px 16px'}}>
                    {payouts.twoMbd.ohShitPlayer&&(
                      <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 10px',marginBottom:8,fontSize:'0.74rem',color:C.red}}>
                        ⚠️ Oh Shit: <strong>{payouts.twoMbd.ohShitPlayer}</strong> sits out — refund 2MBD
                      </div>
                    )}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
                    {(payouts.twoMbd.segments||[]).map((seg,si)=>(
                      <div key={si} style={{background:C.bg,borderRadius:6,padding:'8px 10px',border:`1px solid ${C.border}`}}>
                        <div style={{color:C.muted,fontSize:'0.66rem',marginBottom:6,fontWeight:600}}>{seg.label} — {fmt$0(seg.pot)}</div>
                        {seg.winner?(
                          <div>
                            <div style={{color:C.green,fontWeight:700,fontSize:'0.85rem',marginBottom:3}}>🏆 {seg.winner.pair[0]} &amp; {seg.winner.pair[1]}</div>
                            <div style={{fontFamily:"'DM Mono',monospace",color:C.gold,fontWeight:700,fontSize:'1rem'}}>{seg.winner.p1score}/{seg.winner.p2score}={seg.winner.combined}</div>
                          </div>
                        ):<span style={{color:C.muted,fontSize:'0.75rem'}}>In progress…</span>}
                      </div>
                    ))}
                    </div>
                    {!payouts.twoMbd.segments?.length&&<p style={{color:C.muted,fontSize:'0.8rem',margin:0}}>Scores in progress…</p>}
                  </div>
                </Card>
              </div>
            </>)}
          </div>
        )}

        {/* ══════ SCORES / LEADERBOARD ══════════════════════ */}
        {view==='board'&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:16,color:C.green}}>🏆 Scores by Flight</h2>
            <div style={{display:'grid',gridTemplateColumns:`repeat(${payouts?.lowNetFlights?.length||3},minmax(200px,1fr))`,gap:12,marginBottom:16,overflowX:'auto'}}>
              {(payouts?.flights||[{k:'A'},{k:'B'},{k:'C'}]).map(({k})=>(
                <Card key={k} style={{minWidth:180}}>
                  <CardHead><FlightBadge f={k}/></CardHead>
                  <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'DM Mono',monospace",fontSize:'0.78rem'}}>
                    <thead><tr style={{borderBottom:`1px solid ${C.border}`,background:C.card2}}>
                      {['#','Player','HC','Net','Holes'].map(h=>(
                        <th key={h} style={{padding:'6px 6px',color:C.muted,fontWeight:500,textAlign:h==='Player'?'left':'center',fontSize:'0.64rem'}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(flightedLB[k]||[]).map((p,i)=>(
                        <tr key={p.name} style={{borderBottom:`1px solid ${C.border}`,background:i===0?C.light:i%2===0?C.bg:C.card,cursor:isLive?'pointer':'default'}}
                          onClick={()=>isLive&&openScoring(p.name)}>
                          <td style={{padding:'6px 6px',textAlign:'center',color:i<3?C.gold:C.muted,fontWeight:i===0?700:400}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                          <td style={{padding:'6px 6px',fontFamily:"'DM Sans',sans-serif",fontWeight:i===0?700:400,color:i===0?C.green:C.text,fontSize:'0.78rem'}}>{p.name}</td>
                          <td style={{padding:'6px 6px',textAlign:'center',color:C.muted,fontSize:'0.75rem'}}>{p.hc}</td>
                          <td style={{padding:'6px 6px',textAlign:'center',color:i===0?C.green:C.text,fontWeight:i===0?700:400}}>{p.net||'—'}</td>
                          <td style={{padding:'6px 6px',textAlign:'center',color:C.muted,fontSize:'0.72rem'}}>{p.holesPlayed}/18</td>
                        </tr>
                      ))}
                      {!(flightedLB[k]||[]).length&&<tr><td colSpan={5} style={{padding:'14px',textAlign:'center',color:C.muted,fontSize:'0.76rem'}}>No scores yet</td></tr>}
                    </tbody>
                  </table>
                </Card>
              ))}
            </div>

            {/* Full scorecard */}
            <Card>
              <CardHead>{round?.course?.name} · White Tees CR {round?.course?.rating}/{round?.course?.slope}</CardHead>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'DM Mono',monospace",fontSize:'0.72rem'}}>
                  <thead>
                    <tr style={{background:C.card2,borderBottom:`1px solid ${C.border}`}}>
                      <th style={{padding:'7px 10px',textAlign:'left',color:C.muted,position:'sticky',left:0,background:C.card2,minWidth:90,fontSize:'0.67rem'}}>PLAYER</th>
                      {par.map((p,i)=><th key={i} style={{padding:'5px 5px',textAlign:'center',color:par3Idx.includes(i)?'#16a34a':C.muted,minWidth:24,fontSize:'0.65rem'}}>{i+1}</th>)}
                      <th style={{padding:'5px 8px',textAlign:'center',color:C.gold,fontSize:'0.67rem'}}>OUT</th>
                      <th style={{padding:'5px 8px',textAlign:'center',color:C.gold,fontSize:'0.67rem'}}>IN</th>
                      <th style={{padding:'5px 8px',textAlign:'center',color:C.gold,fontSize:'0.67rem'}}>TOT</th>
                      <th style={{padding:'5px 8px',textAlign:'center',color:C.green,fontSize:'0.67rem'}}>NET</th>
                    </tr>
                    <tr style={{background:C.bg,borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:'4px 10px',color:C.muted,position:'sticky',left:0,background:C.bg,fontSize:'0.67rem'}}>PAR</td>
                      {par.map((p,i)=><td key={i} style={{padding:'4px 5px',textAlign:'center',color:C.muted,fontSize:'0.7rem'}}>{p}</td>)}
                      <td style={{padding:'4px 8px',textAlign:'center',color:C.muted}}>{sumArr(par.slice(0,9))}</td>
                      <td style={{padding:'4px 8px',textAlign:'center',color:C.muted}}>{sumArr(par.slice(9))}</td>
                      <td style={{padding:'4px 8px',textAlign:'center',color:C.muted}}>{parTotal}</td>
                      <td style={{padding:'4px 8px',textAlign:'center',color:C.muted}}>—</td>
                    </tr>
                  </thead>
                  <tbody>
                    {(payouts?.flights||[{k:'A'},{k:'B'},{k:'C'}]).flatMap(({k})=>(flightedLB[k]||[]).map((pl,ri)=>{
                      const sc=round?.scores[pl.name]||[];
                      return (
                        <tr key={pl.name} style={{borderBottom:`1px solid ${C.border}`,background:ri%2===0?C.bg:C.card,cursor:isLive?'pointer':'default'}}
                          onClick={()=>isLive&&openScoring(pl.name)}>
                          <td style={{padding:'6px 10px',position:'sticky',left:0,background:ri%2===0?C.bg:C.card,fontSize:'0.74rem',fontFamily:"'DM Sans',sans-serif",fontWeight:500}}>
                            <span style={{color:FC[k],fontSize:'0.58rem',marginRight:4}}>{k}</span>{pl.name}
                          </td>
                          {sc.map((s,hi)=>(
                            <td key={hi} style={{padding:'6px 5px',textAlign:'center',background:s>0?scoreBg(s,par[hi]):'transparent',color:s>0?scoreColor(s,par[hi]):C.muted,fontWeight:s>0&&Math.abs(s-par[hi])>=2?700:400,fontSize:'0.73rem'}}>
                              {s>0?s:'·'}
                            </td>
                          ))}
                          <td style={{padding:'6px 8px',textAlign:'center',color:C.gold,fontWeight:600,fontSize:'0.73rem'}}>{sumArr(sc.slice(0,9).filter(s=>s>0))||'—'}</td>
                          <td style={{padding:'6px 8px',textAlign:'center',color:C.gold,fontWeight:600,fontSize:'0.73rem'}}>{sumArr(sc.slice(9).filter(s=>s>0))||'—'}</td>
                          <td style={{padding:'6px 8px',textAlign:'center',color:C.gold,fontWeight:700,fontSize:'0.73rem'}}>{pl.gross||'—'}</td>
                          <td style={{padding:'6px 8px',textAlign:'center',color:C.green,fontWeight:700,fontSize:'0.73rem'}}>{pl.net||'—'}</td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ══════ SKINS ════════════════════════════════════ */}
        {view==='skins'&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:16,color:C.green}}>🎯 Skins</h2>

            {/* Flighted skins — A & B only */}
            {payouts&&(
              <>
                <div style={{background:C.light,borderRadius:8,padding:'6px 12px',marginBottom:12,border:`1px solid ${C.border}`,fontSize:'0.75rem',color:C.muted}}>
                  Skins are always <strong>Flight A vs Flight B only</strong> — separate from Low Net flights
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  {(payouts.skinsFlights||[{k:'A'},{k:'B'}]).map(({k})=>(
                    <Card key={k}>
                      <CardHead><FlightBadge f={k}/> <span style={{color:C.muted,fontSize:'0.7rem',fontWeight:400,marginLeft:4}}>{fmt$0(payouts.flightSkins[k]?.pot||0)} · {fmt$(payouts.flightSkins[k]?.perSkin||0)}/skin</span></CardHead>
                      <div style={{padding:12}}>
                        {/* Hole grid */}
                        <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:3,marginBottom:4}}>
                          {(payouts.flightSkins[k]?.holes||[]).slice(0,9).map((h,i)=>(
                            <div key={i} style={{background:h.winner?'#dcfce7':h.tied?'#fef9c3':C.light,borderRadius:4,padding:'4px 2px',textAlign:'center',border:`1px solid ${h.winner?'#86efac':h.tied?'#fde047':C.border}`}}>
                              <div style={{color:C.muted,fontSize:'0.55rem'}}>{i+1}</div>
                              <div style={{color:h.winner?'#16a34a':h.tied?'#ca8a04':C.muted,fontSize:'0.58rem',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                {h.winner?h.winner.split(' ')[0]:h.tied?'TIE':'—'}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:3,marginBottom:10}}>
                          {(payouts.flightSkins[k]?.holes||[]).slice(9).map((h,i)=>(
                            <div key={i+9} style={{background:h.winner?'#dcfce7':h.tied?'#fef9c3':C.light,borderRadius:4,padding:'4px 2px',textAlign:'center',border:`1px solid ${h.winner?'#86efac':h.tied?'#fde047':C.border}`}}>
                              <div style={{color:C.muted,fontSize:'0.55rem'}}>{i+10}</div>
                              <div style={{color:h.winner?'#16a34a':h.tied?'#ca8a04':C.muted,fontSize:'0.58rem',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                {h.winner?h.winner.split(' ')[0]:h.tied?'TIE':'—'}
                              </div>
                            </div>
                          ))}
                        </div>
                        {(payouts.flightSkins[k]?.winners||[]).map(({name,count,payout})=>(
                          <div key={name} style={{display:'flex',justifyContent:'space-between',padding:'6px 8px',background:C.light,borderRadius:5,marginBottom:4,border:`1px solid ${C.border}`}}>
                            <span style={{fontSize:'0.8rem',fontWeight:600}}>{name} <span style={{color:C.muted,fontWeight:400}}>×{count}</span></span>
                            <span style={{color:'#16a34a',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{fmt$0(payout)}</span>
                          </div>
                        ))}
                        {!(payouts.flightSkins[k]?.winners||[]).length&&<p style={{color:C.muted,fontSize:'0.75rem',margin:0,textAlign:'center'}}>No outright winners yet</p>}
                        {(payouts.flightSkins[k]?.totalCarry||0)>0&&<div style={{color:C.red,fontSize:'0.7rem',marginTop:6}}>⚡ {payouts.flightSkins[k].totalCarry} skin{payouts.flightSkins[k].totalCarry>1?'s':''} carrying over</div>}
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Super skins */}
                {payouts.superSkinPot>0&&(
                  <Card style={{border:`1px solid ${C.gold}40`}}>
                    <CardHead>💀 Super Skins (Non-Flighted) — {fmt$0(payouts.superSkinPot)} · {payouts.superSkins.players.length} players · {fmt$(payouts.superSkins.perSkin)}/skin</CardHead>
                    <div style={{padding:14}}>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:3,marginBottom:4}}>
                        {payouts.superSkins.holes.slice(0,9).map((h,i)=>(
                          <div key={i} style={{background:h.winner?'#dcfce7':h.tied?'#fef9c3':C.light,borderRadius:4,padding:'5px 2px',textAlign:'center',border:`1px solid ${h.winner?'#86efac':h.tied?'#fde047':C.border}`}}>
                            <div style={{color:C.muted,fontSize:'0.56rem'}}>{i+1}</div>
                            <div style={{color:h.winner?'#16a34a':h.tied?'#ca8a04':C.muted,fontSize:'0.6rem',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {h.winner?h.winner.split(' ')[0]:h.tied?'TIE':'—'}
                            </div>
                            {h.skins>1&&<div style={{color:C.gold,fontSize:'0.52rem'}}>×{h.skins}</div>}
                          </div>
                        ))}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:3,marginBottom:12}}>
                        {payouts.superSkins.holes.slice(9).map((h,i)=>(
                          <div key={i+9} style={{background:h.winner?'#dcfce7':h.tied?'#fef9c3':C.light,borderRadius:4,padding:'5px 2px',textAlign:'center',border:`1px solid ${h.winner?'#86efac':h.tied?'#fde047':C.border}`}}>
                            <div style={{color:C.muted,fontSize:'0.56rem'}}>{i+10}</div>
                            <div style={{color:h.winner?'#16a34a':h.tied?'#ca8a04':C.muted,fontSize:'0.6rem',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {h.winner?h.winner.split(' ')[0]:h.tied?'TIE':'—'}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                        {payouts.superSkins.winners.map(({name,count,payout})=>(
                          <div key={name} style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px 14px',display:'flex',gap:12,alignItems:'center'}}>
                            <span style={{fontWeight:600}}>{name}</span>
                            <span style={{color:C.muted,fontSize:'0.7rem'}}>×{count}</span>
                            <span style={{color:C.gold,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{fmt$0(payout)}</span>
                          </div>
                        ))}
                        {!payouts.superSkins.winners.length&&<p style={{color:C.muted,fontSize:'0.8rem',margin:0}}>All tied — {payouts.superSkins.totalCarry} carrying over</p>}
                      </div>
                    </div>
                  </Card>
                )}
              </>
            )}
            {!payouts&&<Card style={{padding:40,textAlign:'center'}}><p style={{color:C.muted}}>No configuration yet.</p></Card>}
          </div>
        )}

        {/* ══════ 2MBD ══════════════════════════════════════ */}
        {view==='draw'&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4,color:C.green}}>🎲 2 Man Blind Draw</h2>
            <p style={{color:C.muted,fontSize:'0.75rem',marginBottom:16}}>
              {round?.date} · 3 separate draws · Fully random pairings · Lowest combined score wins each segment · {fmt$0(payouts?.twoMbdPot||0)} total · {fmt$0(payouts?.twoMbd?.segPot||0)}/segment
            </p>
            {payouts?.twoMbd?.ohShitPlayer&&(
              <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:6,padding:'7px 12px',marginBottom:14,fontSize:'0.78rem',color:C.red}}>
                ⚠️ <strong>Oh Shit:</strong> <strong>{payouts.twoMbd.ohShitPlayer}</strong> sits out all 3 draws — refund their 2MBD portion
              </div>
            )}
            {(!payouts?.twoMbd?.segments||!payouts.twoMbd.segments[0]?.teams?.length)&&(
              <Card style={{padding:40,textAlign:'center'}}><p style={{color:C.muted}}>No 2MBD draw yet — create a new round to generate pairings.</p></Card>
            )}
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {(payouts?.twoMbd?.segments||[]).map((seg,si)=>(
                <Card key={si}>
                  <CardHead>
                    {seg.label}
                    <span style={{color:C.muted,fontSize:'0.7rem',fontWeight:400,marginLeft:8}}>{fmt$0(seg.pot)} pot · lowest combined wins</span>
                  </CardHead>
                  <div style={{padding:12}}>
                    {seg.winner&&(
                      <div style={{background:C.light,border:`1.5px solid ${C.green}`,borderRadius:8,padding:'10px 14px',marginBottom:10}}>
                        <div style={{color:C.muted,fontSize:'0.67rem',marginBottom:3}}>🏆 WINNER — {fmt$0(seg.pot)}</div>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{color:C.green,fontWeight:700,fontSize:'0.95rem'}}>
                            {seg.winner.pair[0]} & {seg.winner.pair[1]}
                          </div>
                          <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:C.green,fontSize:'1.1rem'}}>
                            {seg.winner.p1score}/{seg.winner.p2score} = {seg.winner.combined}
                          </div>
                        </div>
                      </div>
                    )}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6}}>
                      {(seg.teams||[]).map((team,ti)=>{
                        const isWinner=ti===0&&seg.winner;
                        return (
                          <div key={ti} style={{background:isWinner?C.light:C.bg,borderRadius:6,padding:'8px 10px',border:`1px solid ${isWinner?C.green:C.border}`}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                              <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                                {(team.pair||[]).filter(Boolean).map(n=>{
                                  const f=round?.config?.mbd_a?.includes(n)?'A':'B';
                                  return <span key={n} style={{display:'flex',alignItems:'center',gap:3}}><FlightBadge f={f}/><span style={{fontSize:'0.8rem',fontWeight:600}}>{n}</span></span>;
                                })}
                              </div>
                              <div style={{fontFamily:"'DM Mono',monospace",fontSize:'0.82rem',color:isWinner?C.green:C.muted,fontWeight:isWinner?700:400,textAlign:'right',whiteSpace:'nowrap',marginLeft:8}}>
                                {team.played>0?`${team.p1score}/${team.p2score} = ${team.combined}`:'—'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {!seg.teams?.length&&<p style={{color:C.muted,fontSize:'0.76rem',margin:0}}>Draw not yet generated</p>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ══════ SEASON ════════════════════════════════════ */}
        {view==='season'&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4,color:C.green}}>📊 Season Standings</h2>
            <p style={{color:C.muted,fontSize:'0.75rem',marginBottom:16}}>{rounds.filter(r=>r.status==='locked').length} completed rounds · Ranked by total winnings</p>

            {(()=>{
              // Build stats
              const stats={};
              rounds.filter(r=>r.status==='locked').forEach(r=>{
                const rPar=r.par||par;
                Object.entries(r.scores||{}).forEach(([name,sc])=>{
                  if(!stats[name]) stats[name]={name,rounds:0,totalGross:0,totalNet:0};
                  const gross=sumArr(sc.map((s,i)=>s>0?s:rPar[i]));
                  stats[name].rounds++;
                  stats[name].totalGross+=gross;
                  stats[name].totalNet+=gross-(hcMap[name]??0);
                });
              });
              const winnings={};
              payoutsHistory.forEach(p=>{
                if(!winnings[p.player_name]) winnings[p.player_name]=0;
                winnings[p.player_name]+=parseFloat(p.amount)||0;
              });

              // This week's scores (current selected round if locked)
              const thisWeekRound = rounds.find(r=>r.id===selRound&&r.status==='locked')
                || rounds.filter(r=>r.status==='locked').sort((a,b)=>b.id-a.id)[0];
              const thisWeekStats = {};
              if(thisWeekRound){
                const rPar=thisWeekRound.par||par;
                Object.entries(thisWeekRound.scores||{}).forEach(([name,sc])=>{
                  const gross=sumArr(sc.map((s,i)=>s>0?s:rPar[i]));
                  thisWeekStats[name]={gross,net:gross-(hcMap[name]??0)};
                });
              }
              const thisWeekRanked=[...Object.entries(thisWeekStats)]
                .sort((a,b)=>a[1].net-b[1].net)
                .map(([name],i)=>({name,place:i+1}));
              const thisWeekPlaceMap=Object.fromEntries(thisWeekRanked.map(x=>[x.name,x.place]));

              // Full season ranking by total winnings
              const seasonRanked=Object.values(stats)
                .map(p=>({...p,winnings:winnings[p.name]||0,avgNet:p.totalNet/p.rounds,avgGross:p.totalGross/p.rounds}))
                .sort((a,b)=>b.winnings-a.winnings);

              const top10=seasonRanked.slice(0,10);
              const rest=seasonRanked.slice(10);

              return (
                <>
                  {/* TOP 10 LEADERBOARD — prominent display */}
                  <div style={{marginBottom:20}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <div style={{fontWeight:700,fontSize:'0.85rem',color:C.green}}>🏆 Top 10 — Season Leaders</div>
                      {thisWeekRound&&<div style={{color:C.muted,fontSize:'0.72rem'}}>This week: {thisWeekRound.date}</div>}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {top10.map((p,i)=>{
                        const medals=['🥇','🥈','🥉'];
                        const thisWeekPlace=thisWeekPlaceMap[p.name];
                        const isTop3=i<3;
                        return (
                          <div key={p.name} style={{
                            display:'flex',alignItems:'center',gap:10,
                            background:i===0?'#1a3a0e':i===1?'#1e3a1e':i===2?'#1e3a24':C.card,
                            border:`1.5px solid ${i===0?C.gold:i<3?C.green:C.border}`,
                            borderRadius:10,padding:'10px 14px',
                            transition:'all .1s',
                          }}>
                            {/* Rank */}
                            <div style={{width:32,textAlign:'center',flexShrink:0}}>
                              {i<3
                                ?<span style={{fontSize:'1.3rem'}}>{medals[i]}</span>
                                :<span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:C.muted,fontSize:'0.9rem'}}>#{i+1}</span>
                              }
                            </div>
                            {/* Name + HC */}
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:isTop3?700:600,fontSize:'0.92rem',color:isTop3?'#f0e8c8':C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
                              <div style={{color:isTop3?'#86efac':C.muted,fontSize:'0.68rem'}}>HC {hcMap[p.name]??'?'} · {p.rounds} round{p.rounds!==1?'s':''}</div>
                            </div>
                            {/* This week's net score */}
                            {thisWeekStats[p.name]&&(
                              <div style={{textAlign:'center',flexShrink:0,minWidth:60}}>
                                <div style={{fontSize:'0.62rem',color:isTop3?'#86efac':C.muted,marginBottom:1}}>this week</div>
                                <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:'0.88rem',color:isTop3?'#f0e8c8':C.text}}>
                                  net {thisWeekStats[p.name].net}
                                </div>
                                {thisWeekPlace&&<div style={{fontSize:'0.62rem',color:thisWeekPlace<=3?C.gold:isTop3?'#86efac':C.muted}}>
                                  {thisWeekPlace===1?'🏆':thisWeekPlace===2?'🥈':thisWeekPlace===3?'🥉':''}#{thisWeekPlace} this wk
                                </div>}
                              </div>
                            )}
                            {/* Avg net */}
                            <div style={{textAlign:'center',flexShrink:0,minWidth:52}}>
                              <div style={{fontSize:'0.62rem',color:isTop3?'#86efac':C.muted,marginBottom:1}}>avg net</div>
                              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:600,fontSize:'0.85rem',color:isTop3?'#f0e8c8':C.text}}>{p.avgNet.toFixed(1)}</div>
                            </div>
                            {/* Winnings */}
                            <div style={{textAlign:'right',flexShrink:0,minWidth:56}}>
                              <div style={{fontSize:'0.62rem',color:isTop3?'#86efac':C.muted,marginBottom:1}}>winnings</div>
                              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:800,fontSize:'1rem',color:C.gold}}>{fmt$0(p.winnings)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* FULL TABLE — all players */}
                  <Card>
                    <CardHead>Full Season Table</CardHead>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'DM Mono',monospace",fontSize:'0.78rem'}}>
                        <thead><tr style={{background:C.light,borderBottom:`1px solid ${C.border}`}}>
                          {['#','Player','HC','Rds','Avg Gross','Avg Net','This Wk Net','This Wk Place','Winnings'].map(h=>(
                            <th key={h} style={{padding:'8px 10px',color:C.muted,fontWeight:600,textAlign:h==='Player'?'left':'center',fontSize:'0.67rem',whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {seasonRanked.map((p,i)=>{
                            const thisWkPlace=thisWeekPlaceMap[p.name];
                            const thisWkNet=thisWeekStats[p.name]?.net;
                            return (
                              <tr key={p.name} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.bg:C.card}}>
                                <td style={{padding:'7px 10px',textAlign:'center',color:i<3?C.gold:C.muted,fontWeight:i<3?700:400}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                                <td style={{padding:'7px 10px',color:C.text,fontFamily:"'DM Sans',sans-serif",fontWeight:i<3?600:400}}>{p.name}</td>
                                <td style={{padding:'7px 10px',textAlign:'center',color:C.muted}}>{hcMap[p.name]??'—'}</td>
                                <td style={{padding:'7px 10px',textAlign:'center',color:C.muted}}>{p.rounds}</td>
                                <td style={{padding:'7px 10px',textAlign:'center'}}>{p.avgGross.toFixed(1)}</td>
                                <td style={{padding:'7px 10px',textAlign:'center',color:C.green,fontWeight:500}}>{p.avgNet.toFixed(1)}</td>
                                <td style={{padding:'7px 10px',textAlign:'center',color:thisWkNet!=null?C.text:C.muted}}>{thisWkNet!=null?thisWkNet:'—'}</td>
                                <td style={{padding:'7px 10px',textAlign:'center',color:thisWkPlace<=3?C.gold:C.muted,fontWeight:thisWkPlace<=3?700:400}}>
                                  {thisWkPlace?`#${thisWkPlace}`:'—'}
                                </td>
                                <td style={{padding:'7px 10px',textAlign:'center',color:C.gold,fontWeight:700}}>{fmt$0(p.winnings)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              );
            })()}
          </div>
        )}

        {/* ══════ STATS ════════════════════════════════════ */}
        {view==='stats'&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4,color:C.green}}>🏅 Player Stats</h2>
            <p style={{color:C.muted,fontSize:'0.75rem',marginBottom:16}}>All-time stats from completed rounds</p>
            <Card>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'DM Mono',monospace",fontSize:'0.76rem'}}>
                  <thead><tr style={{background:C.card2,borderBottom:`1px solid ${C.border}`}}>
                    {['Player','Rds','Avg Net','Eagles 🦅','Birdies 🐦','Pars','Bogeys','Doubles+','CTP Wins','Winnings'].map(h=>(
                      <th key={h} style={{padding:'9px 10px',color:C.muted,fontWeight:500,textAlign:h==='Player'?'left':'center',fontSize:'0.67rem',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {players.map((player,i)=>{
                      const rPar=par;
                      let totalRounds=0,totalNet=0,eagles=0,birdies=0,pars2=0,bogeys=0,doubles=0,ctpWins=0;
                      rounds.filter(r=>r.status==='locked').forEach(r=>{
                        const sc=r.scores[player.name];
                        if(!sc) return;
                        totalRounds++;
                        const hp=r.par||rPar;
                        const gross=sumArr(sc.map((s,k)=>s>0?s:hp[k]));
                        totalNet+=gross-player.hc;
                        sc.forEach((s,k)=>{if(s<=0) return;const d=s-hp[k];if(d<=-2)eagles++;else if(d===-1)birdies++;else if(d===0)pars2++;else if(d===1)bogeys++;else doubles++;});
                        if(r.ctp) Object.values(r.ctp).forEach(v=>{if(v===player.name) ctpWins++;});
                      });
                      const winnings=payoutsHistory.filter(p=>p.player_name===player.name).reduce((a,p)=>a+parseFloat(p.amount||0),0);
                      if(!totalRounds) return null;
                      return (
                        <tr key={player.name} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.bg:C.card}}>
                          <td style={{padding:'7px 10px',fontFamily:"'DM Sans',sans-serif",fontWeight:500}}>{player.name}</td>
                          <td style={{padding:'7px 10px',textAlign:'center',color:C.muted}}>{totalRounds}</td>
                          <td style={{padding:'7px 10px',textAlign:'center',color:C.green,fontWeight:600}}>{(totalNet/totalRounds).toFixed(1)}</td>
                          <td style={{padding:'7px 10px',textAlign:'center',color:'#d97706',fontWeight:eagles>0?700:400}}>{eagles||'—'}</td>
                          <td style={{padding:'7px 10px',textAlign:'center',color:'#dc2626',fontWeight:birdies>0?600:400}}>{birdies||'—'}</td>
                          <td style={{padding:'7px 10px',textAlign:'center',color:'#16a34a'}}>{pars2||'—'}</td>
                          <td style={{padding:'7px 10px',textAlign:'center',color:C.muted}}>{bogeys||'—'}</td>
                          <td style={{padding:'7px 10px',textAlign:'center',color:'#9333ea'}}>{doubles||'—'}</td>
                          <td style={{padding:'7px 10px',textAlign:'center',color:C.gold,fontWeight:ctpWins>0?700:400}}>{ctpWins||'—'}</td>
                          <td style={{padding:'7px 10px',textAlign:'center',color:C.gold,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{winnings>0?fmt$0(winnings):'—'}</td>
                        </tr>
                      );
                    }).filter(Boolean)}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ══════ NEW ROUND (Admin) ══════════════════════════ */}
        {view==='newround'&&adminMode&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4,color:C.green}}>➕ New Round</h2>
            <div style={{display:'flex',gap:8,marginBottom:20}}>
              {[1,2,3,4,5,6].map(s=>(
                <div key={s} style={{flex:1,height:4,borderRadius:4,background:newRoundStep>=s?C.green:C.border}}/>
              ))}
            </div>

            {newRoundStep===1&&(
              <Card style={{padding:20,marginBottom:14}}>
                <div style={{color:C.green,fontWeight:700,marginBottom:16}}>Step 1 — Round Details</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                  <div>
                    <label style={{display:'block',color:C.muted,fontSize:'0.72rem',marginBottom:4}}>Date</label>
                    <input type="date"
                      defaultValue={newRound.dateISO||new Date().toISOString().split('T')[0]}
                      onChange={e=>{
                        const d=new Date(e.target.value+'T12:00:00');
                        const label=d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
                        setNewRound(nr=>({...nr,date:label,dateISO:e.target.value}));
                      }}
                      style={{width:'100%',border:`1.5px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}/>
                  </div>
                  <div>
                    <label style={{display:'block',color:C.muted,fontSize:'0.72rem',marginBottom:4}}>Course</label>
                    <select value={newRound.courseId} onChange={e=>setNewRound(nr=>({...nr,courseId:e.target.value}))}
                      style={{width:'100%',border:`1.5px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}>
                      <option value=''>— Select course —</option>
                      {COURSES.map(c=>{
                        const match=dbCourses.find(d=>d.name===c.name);
                        return match?<option key={match.id} value={match.id}>{c.name} · CR {c.rating}/{c.slope}</option>:null;
                      })}
                      {dbCourses.filter(d=>!COURSES.find(a=>a.name===d.name)).map(c=>(
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{display:'block',color:C.muted,fontSize:'0.72rem',marginBottom:4}}>Number of Flights</label>
                    <select value={newRound.numFlights} onChange={e=>setNewRound(nr=>({...nr,numFlights:Number(e.target.value)}))}
                      style={{width:'100%',border:`1.5px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}>
                      <option value={2}>2 Flights (A + B)</option>
                      <option value={3}>3 Flights (A + B + C)</option>
                    </select>
                  </div>
                </div>

                <div style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <label style={{color:C.muted,fontSize:'0.72rem'}}>
                      Select Players ({selectedPlayers.length} selected) — sorted by handicap
                      {weeklyField.length>0&&selectedPlayers.length===weeklyField.length&&
                        <span style={{color:C.green,marginLeft:8}}>✓ Pre-loaded from Roster</span>}
                    </label>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>setSelectedPlayers(players.map(p=>p.name))} style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:5,padding:'3px 10px',fontSize:'0.72rem',cursor:'pointer',color:C.text}}>Select All</button>
                      <button onClick={()=>setSelectedPlayers([])} style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:5,padding:'3px 10px',fontSize:'0.72rem',cursor:'pointer',color:C.text}}>Clear</button>
                    </div>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:5,maxHeight:320,overflowY:'auto',padding:6,background:C.light,borderRadius:8,border:`1px solid ${C.border}`}}>
                    {[...players].sort((a,b)=>a.hc-b.hc).map(p=>{
                      const sel=selectedPlayers.includes(p.name);
                      return (
                        <button key={p.name} onClick={()=>setSelectedPlayers(prev=>sel?prev.filter(x=>x!==p.name):[...prev,p.name])}
                          style={{background:sel?C.green:C.card,color:sel?'#fff':C.text,border:`1.5px solid ${sel?C.green:C.border}`,borderRadius:6,padding:'6px 12px',fontSize:'0.78rem',cursor:'pointer',fontWeight:sel?600:400,display:'flex',alignItems:'center',gap:6}}>
                          {sel&&<span style={{fontSize:'0.7rem'}}>✓</span>}
                          <span>{p.name}</span>
                          <span style={{background:sel?'rgba(255,255,255,0.25)':'#e4f0e6',color:sel?'#fff':C.green,borderRadius:4,padding:'1px 6px',fontSize:'0.68rem',fontWeight:700}}>HC {p.hc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Btn onClick={()=>{
                  const {lowNet,skinsAndMbd}=autoAssignFlights(selectedPlayers,newRound.numFlights);
                  setDraftFlights(lowNet);
                  setDraftSkinsFlights(skinsAndMbd);
                  const mbdActive=doOhShitDraw([...selectedPlayers].sort((a,b)=>(hcMap[a]??0)-(hcMap[b]??0)));
                  const half=Math.floor(mbdActive.length/2);
                  const mbd={A:mbdActive.slice(0,half),B:mbdActive.slice(half)};
                  setDraftMbdFlights(mbd);
                  const [s1,s2,s3]=generateSegmentDraws(mbd.A,mbd.B);
                  setMbdSeg1(s1);setMbdSeg2(s2);setMbdSeg3(s3);
                  setDraftPairs(generateDraw(mbd.A,mbd.B));
                  setDraftGroups(autoGenerateGroups(selectedPlayers));
                  setNewRoundStep(2);
                }} disabled={!newRound.date||!newRound.courseId||selectedPlayers.length<4}>
                  Next — Assign Flights →
                </Btn>
              </Card>
            )}

            {newRoundStep===2&&(
              <Card style={{padding:20,marginBottom:14}}>
                <div style={{color:C.green,fontWeight:700,marginBottom:4}}>Step 2 — Flight Assignment</div>
                <p style={{color:C.muted,fontSize:'0.75rem',marginBottom:16}}>
                  Low Net uses A/B/C · Skins and 2MBD always use A/B only · All sorted by HC lowest→highest
                </p>

                {/* LOW NET */}
                <div style={{background:C.light,borderRadius:8,padding:12,marginBottom:12,border:`1px solid ${C.border}`}}>
                  <div style={{fontWeight:700,fontSize:'0.82rem',color:C.green,marginBottom:8}}>🏅 Low Net Flights ({newRound.numFlights} flights)</div>
                  <div style={{display:'grid',gridTemplateColumns:newRound.numFlights===2?'1fr 1fr':'1fr 1fr 1fr',gap:10}}>
                    {['A','B',...(newRound.numFlights===3?['C']:[])].map(f=>(
                      <div key={f}>
                        <div style={{marginBottom:4,display:'flex',alignItems:'center',gap:6}}>
                          <FlightBadge f={f}/>
                          <span style={{color:C.muted,fontSize:'0.68rem'}}>{draftFlights[f]?.length}p · HC {draftFlights[f]?.length?`${hcMap[draftFlights[f][0]]??'?'}–${hcMap[draftFlights[f][draftFlights[f].length-1]]??'?'}`:'—'}</span>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:2,background:C.card,borderRadius:6,padding:6,border:`1px solid ${C.border}`,minHeight:40}}>
                          {([...(draftFlights[f]||[])].sort((a,b)=>(hcMap[a]??0)-(hcMap[b]??0))).map(p=>(
                            <div key={p} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3px 6px',fontSize:'0.73rem',background:C.light,borderRadius:4}}>
                              <span><span style={{color:C.green,fontWeight:700,fontSize:'0.65rem',marginRight:4}}>{hcMap[p]??'?'}</span>{p}</span>
                              <select defaultValue='' onChange={e=>{if(!e.target.value) return;const to=e.target.value;setDraftFlights(prev=>({...prev,[f]:prev[f].filter(x=>x!==p),[to]:[...(prev[to]||[]),p]}));e.target.value='';}}
                                style={{background:'transparent',border:'none',color:C.muted,fontSize:'0.63rem',cursor:'pointer'}}>
                                <option value=''>→</option>
                                {['A','B',...(newRound.numFlights===3?['C']:[])].filter(x=>x!==f).map(x=><option key={x} value={x}>{x}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SKINS A/B */}
                <div style={{background:C.light,borderRadius:8,padding:12,marginBottom:12,border:`1px solid ${C.border}`}}>
                  <div style={{fontWeight:700,fontSize:'0.82rem',color:C.green,marginBottom:8}}>🎯 Skins Flights (A & B only)</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    {['A','B'].map(f=>(
                      <div key={f}>
                        <div style={{marginBottom:4,display:'flex',alignItems:'center',gap:6}}>
                          <FlightBadge f={f}/>
                          <span style={{color:C.muted,fontSize:'0.68rem'}}>{draftSkinsFlights[f]?.length}p</span>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:2,background:C.card,borderRadius:6,padding:6,border:`1px solid ${C.border}`,minHeight:40}}>
                          {([...(draftSkinsFlights[f]||[])].sort((a,b)=>(hcMap[a]??0)-(hcMap[b]??0))).map(p=>(
                            <div key={p} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3px 6px',fontSize:'0.73rem',background:C.light,borderRadius:4}}>
                              <span><span style={{color:C.green,fontWeight:700,fontSize:'0.65rem',marginRight:4}}>{hcMap[p]??'?'}</span>{p}</span>
                              <select defaultValue='' onChange={e=>{if(!e.target.value) return;const to=e.target.value;setDraftSkinsFlights(prev=>({...prev,[f]:prev[f].filter(x=>x!==p),[to]:[...(prev[to]||[]),p]}));e.target.value='';}}
                                style={{background:'transparent',border:'none',color:C.muted,fontSize:'0.63rem',cursor:'pointer'}}>
                                <option value=''>→</option>
                                {['A','B'].filter(x=>x!==f).map(x=><option key={x} value={x}>{x}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2MBD A/B + OH SHIT */}
                <div style={{background:C.light,borderRadius:8,padding:12,marginBottom:16,border:`1px solid ${C.border}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <div style={{fontWeight:700,fontSize:'0.82rem',color:C.green}}>🎲 2MBD Flights (A & B only)</div>
                    <Btn small outline onClick={()=>{
                      const all=[...selectedPlayers].sort((a,b)=>(hcMap[a]??0)-(hcMap[b]??0));
                      const mbdActive=doOhShitDraw(all);
                      const half=Math.floor(mbdActive.length/2);
                      const mbd={A:mbdActive.slice(0,half),B:mbdActive.slice(half)};
                      setDraftMbdFlights(mbd);
                      setDraftPairs(generateDraw(mbd.A,mbd.B));
                    }}>🎲 Re-draw Oh Shit</Btn>
                  </div>
                  {ohShitPlayer&&(
                    <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:6,padding:'6px 12px',marginBottom:8,fontSize:'0.78rem',color:C.red}}>
                      ⚠️ <strong>Oh Shit Draw:</strong> <strong>{ohShitPlayer}</strong> sits out this 2MBD draw — money refunded for this game
                    </div>
                  )}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    {['A','B'].map(f=>(
                      <div key={f}>
                        <div style={{marginBottom:4,display:'flex',alignItems:'center',gap:6}}>
                          <FlightBadge f={f}/>
                          <span style={{color:C.muted,fontSize:'0.68rem'}}>{draftMbdFlights[f]?.length}p</span>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:2,background:C.card,borderRadius:6,padding:6,border:`1px solid ${C.border}`,minHeight:40}}>
                          {([...(draftMbdFlights[f]||[])].sort((a,b)=>(hcMap[a]??0)-(hcMap[b]??0))).map(p=>(
                            <div key={p} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3px 6px',fontSize:'0.73rem',background:C.light,borderRadius:4}}>
                              <span><span style={{color:C.green,fontWeight:700,fontSize:'0.65rem',marginRight:4}}>{hcMap[p]??'?'}</span>{p}</span>
                              <select defaultValue='' onChange={e=>{if(!e.target.value) return;const to=e.target.value;setDraftMbdFlights(prev=>({...prev,[f]:prev[f].filter(x=>x!==p),[to]:[...(prev[to]||[]),p]}));e.target.value='';}}
                                style={{background:'transparent',border:'none',color:C.muted,fontSize:'0.63rem',cursor:'pointer'}}>
                                <option value=''>→</option>
                                {['A','B'].filter(x=>x!==f).map(x=><option key={x} value={x}>{x}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{display:'flex',gap:8}}>
                  <Btn outline onClick={()=>setNewRoundStep(1)}>← Back</Btn>
                  <Btn onClick={()=>{setDraftPairs(generateDraw(draftMbdFlights.A,draftMbdFlights.B));setNewRoundStep(3);}}>Next — Draw Pairings →</Btn>
                </div>
              </Card>
            )}

            {newRoundStep===3&&(
              <Card style={{padding:20,marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{color:C.green,fontWeight:700}}>Step 3 — Build Foursomes</div>
                  <Btn small outline onClick={()=>setDraftGroups(autoGenerateGroups(selectedPlayers))}>🔀 Auto-shuffle</Btn>
                </div>
                <p style={{color:C.muted,fontSize:'0.75rem',marginBottom:14}}>
                  Tap a player then tap a group to move them. Groups of 4 — foursomes play together on the course. 2MBD partners are drawn separately.
                </p>

                {(()=>{
                  const allInGroups = draftGroups.flat();
                  const unassigned = selectedPlayers.filter(p=>!allInGroups.includes(p));

                  const moveToGroup = (player, groupIdx) => {
                    setDraftGroups(prev => {
                      const next = prev.map(g=>g.filter(p=>p!==player));
                      if(groupIdx==='unassigned') return next;
                      const target = [...next[groupIdx], player];
                      next[groupIdx] = target;
                      return next;
                    });
                    setMovingPlayer(null);
                  };

                  const addGroup = () => setDraftGroups(prev=>[...prev,[]]);
                  const removeGroup = (gi) => {
                    setDraftGroups(prev=>prev.filter((_,i)=>i!==gi));
                  };

                  return (
                    <div>
                      {/* Unassigned pool */}
                      {unassigned.length>0&&(
                        <div style={{marginBottom:14,background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:10}}>
                          <div style={{fontSize:'0.72rem',fontWeight:700,color:'#c2410c',marginBottom:6}}>⚠️ Unassigned ({unassigned.length})</div>
                          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                            {unassigned.map(p=>(
                              <button key={p} onClick={()=>setMovingPlayer(movingPlayer===p?null:p)}
                                style={{background:movingPlayer===p?'#c2410c':'#fff',color:movingPlayer===p?'#fff':'#c2410c',border:'1.5px solid #fed7aa',borderRadius:6,padding:'4px 10px',fontSize:'0.76rem',cursor:'pointer',fontWeight:movingPlayer===p?700:400}}>
                                {movingPlayer===p?'✓ ':''}{p} <span style={{opacity:0.7}}>HC{hcMap[p]??'?'}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Group grid */}
                      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:12}}>
                        {draftGroups.map((grp,gi)=>{
                          const isTarget = movingPlayer && grp.length<4 && !grp.includes(movingPlayer);
                          const isFull = grp.length>=4;
                          return (
                            <div key={gi} onClick={()=>{ if(movingPlayer && !grp.includes(movingPlayer) && grp.length<4) moveToGroup(movingPlayer,gi); }}
                              style={{background:isTarget?'#dcfce7':C.light,borderRadius:8,padding:10,border:`2px solid ${isTarget?C.green:C.border}`,cursor:isTarget?'pointer':'default',transition:'all .15s'}}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                                <span style={{fontSize:'0.74rem',fontWeight:700,color:C.green}}>GROUP {gi+1}</span>
                                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                                  <span style={{fontSize:'0.68rem',color:isFull?C.green:C.muted}}>{grp.length}/4 {isFull?'✅':''}</span>
                                  {isTarget&&<span style={{fontSize:'0.68rem',color:C.green,fontWeight:700}}>← Add here</span>}
                                  <button onClick={e=>{e.stopPropagation();removeGroup(gi);}}
                                    style={{background:'transparent',border:'none',color:C.muted,cursor:'pointer',fontSize:'0.75rem',padding:0}}>✕</button>
                                </div>
                              </div>
                              <div style={{display:'flex',flexDirection:'column',gap:3}}>
                                {grp.map(p=>{
                                  const f=draftFlights.A?.includes(p)?'A':draftFlights.B?.includes(p)?'B':'C';
                                  return (
                                    <div key={p} onClick={e=>{e.stopPropagation();setMovingPlayer(movingPlayer===p?null:p);}}
                                      style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:movingPlayer===p?C.green:C.card,borderRadius:5,padding:'5px 8px',cursor:'pointer',border:`1px solid ${movingPlayer===p?C.green:C.border}`}}>
                                      <span style={{display:'flex',alignItems:'center',gap:6}}>
                                        <FlightBadge f={f}/>
                                        <span style={{fontWeight:600,fontSize:'0.8rem',color:movingPlayer===p?'#fff':C.text}}>{p}</span>
                                        <span style={{color:movingPlayer===p?'rgba(255,255,255,0.7)':C.muted,fontSize:'0.67rem'}}>HC{hcMap[p]??'?'}</span>
                                      </span>
                                      {movingPlayer===p&&<span style={{color:'#fff',fontSize:'0.68rem'}}>tap group to move</span>}
                                    </div>
                                  );
                                })}
                                {grp.length===0&&<div style={{color:C.muted,fontSize:'0.74rem',textAlign:'center',padding:'8px 0'}}>{isTarget?'Drop here':'Empty group'}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button onClick={addGroup}
                        style={{width:'100%',background:'transparent',border:`1.5px dashed ${C.border}`,borderRadius:8,padding:'8px',fontSize:'0.78rem',color:C.muted,cursor:'pointer',marginBottom:14}}>
                        + Add Group
                      </button>

                      <div style={{display:'flex',gap:8}}>
                        <Btn outline onClick={()=>setNewRoundStep(2)}>← Back</Btn>
                        <Btn onClick={()=>setNewRoundStep(4)} disabled={unassigned.length>0}>
                          {unassigned.length>0?`${unassigned.length} players unassigned`:'Next — 2MBD Draw →'}
                        </Btn>
                      </div>
                    </div>
                  );
                })()}
              </Card>
            )}

            {newRoundStep===4&&(
              <Card style={{padding:20,marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{color:C.green,fontWeight:700}}>Step 4 — 2MBD Draws (3 Segments)</div>
                </div>
                <p style={{color:C.muted,fontSize:'0.75rem',marginBottom:10}}>
                  Each 6-hole segment has a <strong>fully random draw</strong> — anyone can be paired with anyone. Lowest combined score wins each segment. {fmt$0((payouts?.twoMbdPot||0)/3)} per segment.
                </p>
                {ohShitPlayer&&(
                  <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:6,padding:'7px 12px',marginBottom:12,fontSize:'0.78rem',color:C.red}}>
                    ⚠️ <strong>Oh Shit:</strong> <strong>{ohShitPlayer}</strong> sits out all 3 draws — refund their 2MBD portion
                  </div>
                )}

                {/* 3 segment draws */}
                {[
                  {label:'1st 6 — Holes 1–6',    seg:mbdSeg1, setSeg:setMbdSeg1},
                  {label:'2nd 6 — Holes 7–12',   seg:mbdSeg2, setSeg:setMbdSeg2},
                  {label:'3rd 6 — Holes 13–18',  seg:mbdSeg3, setSeg:setMbdSeg3},
                ].map(({label,seg},si)=>(
                  <div key={si} style={{marginBottom:14}}>
                    <div style={{marginBottom:6}}>
                      <div style={{fontWeight:700,fontSize:'0.8rem',color:C.green}}>{label}</div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6}}>
                      {seg.map((pair,pi)=>(
                        <div key={pi} style={{background:C.light,borderRadius:6,padding:'8px 10px',border:`1px solid ${C.border}`,display:'flex',gap:8,alignItems:'center'}}>
                          {(pair||[]).filter(Boolean).map(n=>{
                            const f=draftMbdFlights.A?.includes(n)?'A':'B';
                            return (
                              <span key={n} style={{display:'flex',alignItems:'center',gap:4}}>
                                <FlightBadge f={f}/>
                                <span style={{fontWeight:600,fontSize:'0.8rem'}}>{n}</span>
                                <span style={{color:C.muted,fontSize:'0.67rem'}}>HC{hcMap[n]??'?'}</span>
                              </span>
                            );
                          })}
                          {(pair||[]).filter(Boolean).length<2&&<span style={{color:C.red,fontSize:'0.72rem'}}>⚠ Solo</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div style={{display:'flex',gap:8}}>
                  <Btn outline onClick={()=>setNewRoundStep(3)}>← Back</Btn>
                  <Btn onClick={()=>setNewRoundStep(5)}>Next — Super Skins →</Btn>
                </div>
              </Card>
            )}

            {newRoundStep===5&&(
              <Card style={{padding:20,marginBottom:14}}>
                <div style={{color:C.green,fontWeight:700,marginBottom:4}}>Step 5 — Super Skins</div>
                <p style={{color:C.muted,fontSize:'0.75rem',marginBottom:14}}>
                  Tap players who are opting in to Super Skins this week. Each pays the ${' '}
                  <strong>Super Skin fee</strong> separately from the buy-in.
                  {draftSuperSkins.length>0&&<span style={{color:C.green,fontWeight:700}}> {draftSuperSkins.length} opted in so far.</span>}
                </p>
                <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                  <button onClick={()=>setDraftSuperSkins(selectedPlayers)}
                    style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:5,padding:'4px 12px',fontSize:'0.74rem',cursor:'pointer',color:C.text}}>
                    Select All
                  </button>
                  <button onClick={()=>setDraftSuperSkins([])}
                    style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:5,padding:'4px 12px',fontSize:'0.74rem',cursor:'pointer',color:C.text}}>
                    Clear
                  </button>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}}>
                  {[...selectedPlayers].sort((a,b)=>(hcMap[a]??0)-(hcMap[b]??0)).map(p=>{
                    const opted=draftSuperSkins.includes(p);
                    return (
                      <button key={p}
                        onClick={()=>setDraftSuperSkins(prev=>opted?prev.filter(x=>x!==p):[...prev,p])}
                        style={{
                          background:opted?'#1a3a0e':C.card,
                          color:opted?'#f0e8c8':C.text,
                          border:`1.5px solid ${opted?C.gold:C.border}`,
                          borderRadius:8,padding:'8px 14px',cursor:'pointer',
                          fontWeight:opted?600:400,
                          display:'flex',alignItems:'center',gap:8,
                          transition:'all .12s',
                        }}>
                        <div style={{textAlign:'left'}}>
                          <div style={{fontSize:'0.85rem'}}>{p}</div>
                          <div style={{fontSize:'0.68rem',opacity:0.7}}>HC {hcMap[p]??'?'}</div>
                        </div>
                        {opted&&<span style={{color:C.gold,fontSize:'0.85rem'}}>★</span>}
                      </button>
                    );
                  })}
                </div>
                <div style={{background:C.light,borderRadius:6,padding:'10px 14px',marginBottom:14,fontSize:'0.78rem',color:C.muted,border:`1px solid ${C.border}`}}>
                  {draftSuperSkins.length>0
                    ?<span style={{color:C.green,fontWeight:600}}>★ {draftSuperSkins.length} players opted in — Super Skins pot will be ${draftSuperSkins.length * 10}</span>
                    :'No one opted in yet — you can also set this in Setup after the round starts.'
                  }
                </div>
                <div style={{display:'flex',gap:8}}>
                  <Btn outline onClick={()=>setNewRoundStep(4)}>← Back</Btn>
                  <Btn onClick={()=>setNewRoundStep(6)}>Next — Review →</Btn>
                </div>
              </Card>
            )}

            {newRoundStep===6&&(
              <Card style={{padding:20,marginBottom:14}}>
                <div style={{color:C.green,fontWeight:700,marginBottom:14}}>Step 6 — Review & Start</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  {/* Foursomes summary */}
                  <div>
                    <div style={{fontSize:'0.75rem',fontWeight:700,color:C.muted,marginBottom:8,letterSpacing:'0.05em'}}>⛳ FOURSOMES ({draftGroups.length} groups)</div>
                    {draftGroups.map((grp,gi)=>(
                      <div key={gi} style={{background:C.light,borderRadius:6,padding:'7px 10px',marginBottom:5,border:`1px solid ${C.border}`}}>
                        <div style={{fontSize:'0.68rem',color:C.muted,marginBottom:3}}>Group {gi+1}</div>
                        <div style={{fontSize:'0.8rem',fontWeight:500}}>{grp.join(', ')}</div>
                      </div>
                    ))}
                  </div>
                  {/* 2MBD summary */}
                  <div>
                    <div style={{fontSize:'0.75rem',fontWeight:700,color:C.muted,marginBottom:8,letterSpacing:'0.05em'}}>🎲 2MBD PAIRS</div>
                    {ohShitPlayer&&(
                      <div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:6,padding:'5px 8px',marginBottom:6,fontSize:'0.72rem',color:C.red}}>
                        ⚠️ {ohShitPlayer} sits out
                      </div>
                    )}
                    {draftPairs.map((grp,gi)=>grp.map((pair,ti)=>(
                      <div key={`${gi}-${ti}`} style={{background:C.light,borderRadius:6,padding:'5px 8px',marginBottom:4,border:`1px solid ${C.border}`,fontSize:'0.78rem'}}>
                        {pair.filter(Boolean).join(' & ')}
                      </div>
                    )))}
                  </div>
                </div>
                <div style={{background:C.light,borderRadius:6,padding:'10px 12px',marginBottom:14,fontSize:'0.75rem',color:C.muted}}>
                  📍 {round?.course?.name||dbCourses.find(c=>c.id===Number(newRound.courseId))?.name} · {newRound.date} · {selectedPlayers.length} players · {newRound.numFlights} Low Net flights
                  {ohShitPlayer&&` · ${ohShitPlayer} sits 2MBD`}
                  {draftSuperSkins.length>0&&<span style={{color:C.gold,fontWeight:600}}> · ★ {draftSuperSkins.length} Super Skins</span>}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <Btn outline onClick={()=>setNewRoundStep(5)}>← Back</Btn>
                  <Btn onClick={submitNewRound} disabled={saving} style={{flex:1}}>
                    {saving?'Creating round…':'🚀 Start Round!'}
                  </Btn>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ══════ SETUP (Admin) ════════════════════════════ */}
        {view==='setup'&&adminMode&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4,color:C.green}}>⚙️ Round Setup</h2>
            {!round?.config
              ?<Card style={{padding:40,textAlign:'center'}}><p style={{color:C.muted}}>Create a round first.</p></Card>
              :(()=>{
                const cfg=cfgEdit||round.config;
                const setC=(k,v)=>setCfgEdit(prev=>({...(prev||round.config),[k]:v}));
                const allPlayers=([
                  ...(cfg.flight_a||[]),
                  ...(cfg.flight_b||[]),
                  ...(cfg.flight_c||[]),
                ].filter(Boolean).length > 0
                  ? [...(cfg.flight_a||[]),...(cfg.flight_b||[]),...(cfg.flight_c||[])]
                  : Object.keys(round.scores||{})
                ).filter(Boolean).sort();
                return (
                  <div>
                    <Card style={{marginBottom:14}}>
                      <CardHead>Buy-In & Pot Split</CardHead>
                      <div style={{padding:16,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                        <div>
                          <label style={{display:'block',color:C.muted,fontSize:'0.72rem',marginBottom:4}}>Buy-In ($)</label>
                          <input type="number" defaultValue={cfg.buy_in||25} onBlur={e=>setC('buy_in',Number(e.target.value))}
                            style={{width:'100%',border:`1.5px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}/>
                        </div>
                        <div>
                          <label style={{display:'block',color:C.muted,fontSize:'0.72rem',marginBottom:4}}>Super Skin Fee ($)</label>
                          <input type="number" defaultValue={cfg.super_skin_fee||10} onBlur={e=>setC('super_skin_fee',Number(e.target.value))}
                            style={{width:'100%',border:`1.5px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}/>
                        </div>
                        <div>
                          <label style={{display:'block',color:C.muted,fontSize:'0.72rem',marginBottom:4}}>Flights</label>
                          <select value={cfg.num_flights||3} onChange={e=>setC('num_flights',Number(e.target.value))}
                            style={{width:'100%',border:`1.5px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}>
                            <option value={2}>2 Flights</option>
                            <option value={3}>3 Flights</option>
                          </select>
                        </div>
                        {[{label:'% CTP',k:'pct_ctp'},{label:'% Low Net',k:'pct_low_net'},{label:'% Skins',k:'pct_skins'},{label:'% 2MBD',k:'pct_2mbd'}].map(f=>(
                          <div key={f.k}>
                            <label style={{display:'block',color:C.muted,fontSize:'0.72rem',marginBottom:4}}>{f.label}</label>
                            <input type="number" defaultValue={cfg[f.k]||0} min="0" max="100" onBlur={e=>setC(f.k,Number(e.target.value))}
                              style={{width:'100%',border:`1.5px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}/>
                          </div>
                        ))}
                        <div style={{display:'flex',alignItems:'flex-end'}}>
                          <div style={{color:((cfg.pct_ctp||0)+(cfg.pct_low_net||0)+(cfg.pct_skins||0)+(cfg.pct_2mbd||0))===100?'#16a34a':C.red,fontWeight:700,fontSize:'0.82rem'}}>
                            Total: {(cfg.pct_ctp||0)+(cfg.pct_low_net||0)+(cfg.pct_skins||0)+(cfg.pct_2mbd||0)}% {((cfg.pct_ctp||0)+(cfg.pct_low_net||0)+(cfg.pct_skins||0)+(cfg.pct_2mbd||0))===100?'✓':'≠ 100!'}
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card style={{marginBottom:14}}>
                      <CardHead>Super Skins Roster ({(cfg.super_skin_players||[]).length} opted in)</CardHead>
                      <div style={{padding:14,display:'flex',flexWrap:'wrap',gap:6}}>
                        {allPlayers.sort().map(p=>{
                          const opted=(cfg.super_skin_players||[]).includes(p);
                          return (
                            <button key={p} onClick={()=>setC('super_skin_players',opted?(cfg.super_skin_players||[]).filter(x=>x!==p):[...(cfg.super_skin_players||[]),p])}
                              style={{background:opted?C.green:C.light,color:opted?'#fff':C.text,border:`1.5px solid ${opted?C.green:C.border}`,borderRadius:6,padding:'5px 12px',fontSize:'0.76rem',cursor:'pointer',fontWeight:opted?600:400}}>
                              {opted?'✓ ':''}{p}
                            </button>
                          );
                        })}
                      </div>
                    </Card>

                    <div style={{display:'flex',gap:8}}>
                      <Btn onClick={saveConfig} disabled={saving}>{saving?'Saving…':'Save Configuration →'}</Btn>
                      {cfgEdit&&<Btn outline onClick={()=>setCfgEdit(null)}>Cancel</Btn>}
                    </div>
                  </div>
                );
              })()
            }
          </div>
        )}

        {/* ══════ ROSTER (Admin) ════════════════════════════ */}
        {view==='roster'&&adminMode&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4,color:C.green}}>👥 Player Roster</h2>
            <p style={{color:C.muted,fontSize:'0.75rem',marginBottom:14}}>{players.length} players in season roster · Sorted by handicap</p>

            {/* GHIN HC update */}
            {rounds.filter(r=>r.status==='locked').length>0&&(
              <Card style={{marginBottom:14,border:`1px solid ${C.green}40`}}>
                <div style={{padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:'0.85rem',color:C.green}}>🧮 GHIN Handicap Calculator</div>
                    <div style={{color:C.muted,fontSize:'0.72rem',marginTop:2}}>
                      WHS formula: (Gross − CR) × 113 / Slope × 0.96 · Run manually when ready
                    </div>
                  </div>
                  <Btn small onClick={async()=>{
                    setSaving(true);
                    try {
                      for(const player of players){
                        const diffs=[];
                        rounds.filter(r=>r.status==='locked').forEach(r=>{
                          const sc=r.scores[player.name];
                          if(!sc||!r.course) return;
                          const gross=sumArr(sc.map((s,i)=>s>0?s:r.par[i]));
                          const cr=parseFloat(r.course.course_rating)||72;
                          const sl=parseInt(r.course.slope)||113;
                          diffs.push(calcScoreDifferential(gross,cr,sl));
                        });
                        if(!diffs.length) continue;
                        const newHc=calcGHINHandicap(diffs);
                        if(newHc!==null&&Math.round(newHc)!==player.hc)
                          await sb(`players?id=eq.${player.id}`,'PATCH',{hc:Math.round(newHc)});
                      }
                      await loadAll(selRound);
                    } catch(e){setErr(e.message);}
                    setSaving(false);
                  }}>{saving?'Updating…':'Update All HCs'}</Btn>
                </div>
              </Card>
            )}

            {/* Add new player to season roster */}
            <Card style={{marginBottom:14}}>
              <CardHead>Add New Player to Season Roster</CardHead>
              <div style={{padding:14,display:'flex',gap:10,flexWrap:'wrap'}}>
                <input defaultValue={addPlayerName} onBlur={e=>setAddPlayerName(e.target.value)}
                  placeholder="Full name (adds permanently to roster)"
                  onKeyDown={e=>e.key==='Enter'&&addPlayer()}
                  style={{flex:2,minWidth:200,border:`1.5px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}/>
                <input type="number" defaultValue={addPlayerHc} onBlur={e=>setAddPlayerHc(e.target.value)}
                  placeholder="HC" onKeyDown={e=>e.key==='Enter'&&addPlayer()}
                  style={{flex:1,minWidth:70,border:`1.5px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}/>
                <Btn onClick={addPlayer} disabled={saving}>Add to Roster</Btn>
              </div>
            </Card>

            {/* Weekly field selector */}
            <Card style={{marginBottom:14}}>
              <CardHead>
                This Sunday's Field — {weeklyField.length} selected
              </CardHead>
              <div style={{padding:14}}>
                <p style={{color:C.muted,fontSize:'0.76rem',marginBottom:12,marginTop:0}}>
                  Tap players to add/remove them from this Sunday's field. Then click <strong>Build Round</strong> to set up foursomes.
                </p>

                {/* Quick select buttons */}
                <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                  <button onClick={()=>setWeeklyField(players.map(p=>p.name))}
                    style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:5,padding:'4px 12px',fontSize:'0.74rem',cursor:'pointer',color:C.text}}>
                    Select All ({players.length})
                  </button>
                  <button onClick={()=>setWeeklyField([])}
                    style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:5,padding:'4px 12px',fontSize:'0.74rem',cursor:'pointer',color:C.text}}>
                    Clear
                  </button>
                  {weeklyField.length>0&&(
                    <span style={{color:C.green,fontSize:'0.74rem',padding:'4px 0',fontWeight:600}}>
                      ✓ {weeklyField.length} players selected
                    </span>
                  )}
                </div>

                {/* Player grid — tap to select */}
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}}>
                  {[...players].sort((a,b)=>a.hc-b.hc).map(p=>{
                    const sel=weeklyField.includes(p.name);
                    return (
                      <button key={p.id}
                        onClick={()=>setWeeklyField(prev=>sel?prev.filter(n=>n!==p.name):[...prev,p.name])}
                        style={{
                          background:sel?C.green:C.card,
                          color:sel?'#fff':C.text,
                          border:`1.5px solid ${sel?C.green:C.border}`,
                          borderRadius:8,padding:'8px 14px',
                          cursor:'pointer',fontWeight:sel?600:400,
                          display:'flex',alignItems:'center',gap:8,
                          transition:'all .12s',
                          boxShadow:sel?'0 2px 6px rgba(30,92,40,0.25)':'none',
                        }}>
                        <div style={{textAlign:'left'}}>
                          <div style={{fontSize:'0.85rem'}}>{p.name}</div>
                          <div style={{fontSize:'0.68rem',opacity:0.75}}>HC {p.hc}</div>
                        </div>
                        {sel&&<span style={{fontSize:'0.8rem'}}>✓</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Build Round button */}
                <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{color:C.muted,fontSize:'0.76rem'}}>
                    {weeklyField.length<4
                      ?'Select at least 4 players to build a round'
                      :`${weeklyField.length} players · ${Math.floor(weeklyField.length/4)} full groups`
                    }
                  </div>
                  <Btn
                    disabled={weeklyField.length<4}
                    onClick={()=>{
                      setSelectedPlayers(weeklyField);
                      setView('newround');
                      setNewRoundStep(1);
                    }}>
                    Build Round with {weeklyField.length} Players →
                  </Btn>
                </div>
              </div>
            </Card>

            {/* Season roster — edit HCs */}
            <Card>
              <CardHead>Season Roster — Edit Handicaps</CardHead>
              <div style={{padding:12,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                {[...players].sort((a,b)=>a.hc-b.hc).map(p=>(
                  <div key={p.id} style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:7,padding:'8px 12px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                    <div>
                      <div style={{fontSize:'0.82rem',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
                      {weeklyField.includes(p.name)&&<div style={{fontSize:'0.62rem',color:C.green,fontWeight:600}}>✓ In Sunday's field</div>}
                    </div>
                    <input type="number" defaultValue={p.hc} min="0" max="54"
                      onBlur={async e=>{if(Number(e.target.value)!==p.hc){try{await sb(`players?id=eq.${p.id}`,'PATCH',{hc:Number(e.target.value)});await loadAll(selRound,true);}catch(e2){setErr(e2.message);}}}}
                      onKeyDown={async e=>{if(e.key==='Enter'){try{await sb(`players?id=eq.${p.id}`,'PATCH',{hc:Number(e.target.value)});await loadAll(selRound,true);}catch(e2){setErr(e2.message);}}}}
                      style={{width:52,border:`1.5px solid ${C.border}`,borderRadius:4,padding:'3px 6px',fontSize:'0.8rem',fontFamily:"'DM Mono',monospace",textAlign:'center',color:C.green,fontWeight:700,flexShrink:0}}/>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

      </main>
    </div>
  );
}
