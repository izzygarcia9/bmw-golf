import { useState, useEffect, useMemo, useCallback } from "react";

// ╔══════════════════════════════════════════════════════╗
//  Replace with your Supabase credentials
// ╚══════════════════════════════════════════════════════╝
const SUPABASE_URL      = 'https://xwgzjfxippkxswgouobf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bnd0Z3l0dWFwY21xemxkZnlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTExOTQsImV4cCI6MjA4OTQ2NzE5NH0.w-bs6xIqsP1WER0zQq4UxZMJYuanCo8Sktdt0D4T5aU';

// ── ALAMO CITY GOLF TRAIL — White Tees (Men) ────────────
// Source: alamocitygolftrail.com/usga-ratings
const ALAMO_COURSES = [
  { name:'Olmos Basin',       rating:69.4, slope:125, par:72, yardage:'6,026 yds' },
  { name:'Brackenridge Park', rating:67.7, slope:124, par:71, yardage:'5,807 yds' },
  { name:'Cedar Creek',       rating:73.4, slope:139, par:72, yardage:'6,660 yds' },
  { name:'Mission Del Lago',  rating:71.0, slope:128, par:72, yardage:'6,378 yds' },
  { name:'Northern Hills',    rating:70.1, slope:121, par:72, yardage:'6,193 yds' },
  { name:'Riverside',         rating:69.3, slope:117, par:72, yardage:'5,892 yds' },
  { name:'Willow Springs',    rating:72.4, slope:127, par:72, yardage:'6,529 yds' },
];

// ── HELPERS ──────────────────────────────────────────────
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
      'Prefer': 'return=representation',
    },
    ...(body!==null?{body:JSON.stringify(body)}:{}),
  });
  if(res.status===204) return null;
  const data = await res.json();
  if(!res.ok) throw new Error(data.message||data.hint||JSON.stringify(data));
  return data;
};

const scoreColor = (s,p) => {
  const d=s-p;
  if(d<=-2) return '#fbbf24';
  if(d===-1) return '#f87171';
  if(d===0)  return '#86efac';
  if(d===1)  return '#e2e8f0';
  return '#fb923c';
};

const computeSkins = (scores, players) => {
  const skins = Object.fromEntries(players.map(p=>[p,0]));
  const holes  = Array(18).fill(null).map(()=>({winner:null,tied:false,skins:0}));
  let carry = 0;
  for(let h=0;h<18;h++){
    const hs = players.filter(p=>scores[p]).map(p=>({name:p,score:scores[p][h]}));
    if(!hs.length){ holes[h]={winner:null,tied:false,skins:0,carry:carry>0}; continue; }
    const min = Math.min(...hs.map(s=>s.score));
    const winners = hs.filter(s=>s.score===min);
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

const computeBestBall = (scores,pair) => {
  if(!scores[pair[0]]||!scores[pair[1]]) return null;
  return Array.from({length:18},(_,h)=>Math.min(scores[pair[0]][h],scores[pair[1]][h]));
};

const assembleRound = (r, scores, ctps, pairings, configs, courses) => {
  const scoresMap = Object.fromEntries(scores.filter(s=>s.round_id===r.id).map(s=>[s.player_name,s.holes]));
  const ctpObj = {h3:'',h6:'',h12:''};
  ctps.filter(c=>c.round_id===r.id).forEach(c=>{ ctpObj[c.hole_key]=c.player_name||''; });
  const rPairings = pairings.filter(p=>p.round_id===r.id);
  const groupNums = [...new Set(rPairings.map(p=>p.group_num))].sort((a,b)=>a-b);
  const pairStruct = groupNums.map(gn=>
    rPairings.filter(p=>p.group_num===gn).sort((a,b)=>a.team_num-b.team_num).map(p=>[p.player1,p.player2])
  );
  const groups = pairStruct.map(g=>g.flat().filter(Boolean));
  const cfg    = configs.find(c=>c.round_id===r.id)||null;
  const course = courses.find(c=>c.id===r.course_id)||null;
  const par    = course?.holes_par||[4,4,3,4,5,3,4,4,5,4,4,3,4,4,4,4,4,5];
  return {id:r.id,date:r.date,course,par,parTotal:sumArr(par),scores:scoresMap,groups,pairings:pairStruct,ctp:ctpObj,config:cfg};
};

const calcPayouts = (config, scores, ctp, pairings, hcMap, parTotal) => {
  if(!config) return null;
  const {buy_in,super_skin_fee,pct_ctp,pct_low_net,pct_skins,pct_2mbd,
         flight_a,flight_b,flight_c,super_skin_players,odd_player} = config;
  const allFlighted = [...(flight_a||[]),...(flight_b||[]),...(flight_c||[])];
  const fieldSize   = allFlighted.length;
  if(!fieldSize) return null;
  const totalPot     = fieldSize * buy_in;
  const ctpPot       = totalPot * pct_ctp / 100;
  const lowNetPot    = totalPot * pct_low_net / 100;
  const skinsPot     = totalPot * pct_skins / 100;
  const twoMbdPot    = totalPot * pct_2mbd / 100;
  const superSkinPot = (super_skin_players||[]).length * super_skin_fee;
  const ctpPerHole   = ctpPot / 3;

  const flightLowNet = {};
  [{key:'A',players:flight_a||[]},{key:'B',players:flight_b||[]},{key:'C',players:flight_c||[]}].forEach(({key,players})=>{
    const flightPot = lowNetPot / 3;
    const lb = players.filter(p=>scores[p])
      .map(p=>({name:p,net:sumArr(scores[p])-(hcMap[p]??0),gross:sumArr(scores[p])}))
      .sort((a,b)=>a.net-b.net);
    flightLowNet[key]={pot:flightPot,places:lb.slice(0,3).map((p,i)=>({...p,payout:flightPot*[0.5,0.3,0.2][i]}))};
  });

  const flightSkins = {};
  const skinsPotPerFlight = skinsPot / 3;
  [{key:'A',players:flight_a||[]},{key:'B',players:flight_b||[]},{key:'C',players:flight_c||[]}].forEach(({key,players})=>{
    const active = players.filter(p=>scores[p]);
    const {skins,holes,totalCarry} = computeSkins(scores,active);
    const winners = Object.entries(skins).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
    const total   = Object.values(skins).reduce((a,b)=>a+b,0)||1;
    flightSkins[key]={pot:skinsPotPerFlight,winners:winners.map(([name,count])=>({name,count,payout:skinsPotPerFlight*(count/total)})),holes,totalCarry,perSkin:skinsPotPerFlight/(total)};
  });

  const ssp = (super_skin_players||[]).filter(p=>scores[p]);
  const {skins:sSkins,holes:ssHoles,totalCarry:ssTotalCarry} = computeSkins(scores,ssp);
  const ssTot = Object.values(sSkins).reduce((a,b)=>a+b,0)||1;
  const superSkins = {
    pot:superSkinPot,players:super_skin_players||[],
    winners:Object.entries(sSkins).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count,payout:superSkinPot*(count/ssTot)})),
    holes:ssHoles,totalCarry:ssTotalCarry,perSkin:superSkinPot/(ssTot),
  };

  const teams=[];
  (pairings||[]).forEach(grp=>grp.forEach(pair=>{
    const bb=computeBestBall(scores,pair);
    if(bb) teams.push({pair,total:sumArr(bb)});
  }));
  teams.sort((a,b)=>a.total-b.total);
  const twoMbd={pot:twoMbdPot,winner:teams[0]||null,runnerUp:teams[1]||null,payFirst:twoMbdPot*0.6,paySecond:twoMbdPot*0.4};

  return {totalPot,ctpPot,lowNetPot,skinsPot,twoMbdPot,superSkinPot,ctpPerHole,
          flightLowNet,flightSkins,superSkins,twoMbd,
          fieldSize,oddPlayer:odd_player,
          breakdown:{ctp:pct_ctp,lowNet:pct_low_net,skins:pct_skins,twoMbd:pct_2mbd}};
};

// ── THEME ────────────────────────────────────────────────
const C = {
  bg:'#060e08', card:'#0a1a0c', card2:'#0d1f0f',
  border:'#162a18', gold:'#c8973a', goldL:'#dba94a',
  cream:'#eee8d5', muted:'#637a6a', green:'#18401e',
  accent:'#1f4f25',
  fA:'#60a5fa', fB:'#c084fc', fC:'#fb923c',
};
const FC = {A:C.fA, B:C.fB, C:C.fC};

// ── BMW LOGO ─────────────────────────────────────────────
const Logo = ({size=44}) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <polygon points="24,2 44,10 44,30 24,46 4,30 4,10" fill="#080f09" stroke={C.gold} strokeWidth="1.6"/>
    <polygon points="24,6 40,13 40,28 24,42 8,28 8,13" fill="none" stroke={C.gold} strokeWidth="0.5" strokeOpacity="0.3"/>
    {/* Golf ball dimple pattern */}
    <circle cx="24" cy="21" r="9" fill="none" stroke={C.gold} strokeWidth="0.8" strokeOpacity="0.35"/>
    <circle cx="24" cy="21" r="5.5" fill="none" stroke={C.gold} strokeWidth="0.5" strokeOpacity="0.2"/>
    {[[24,12],[31,16],[31,26],[24,30],[17,26],[17,16]].map(([x,y],i)=>(
      <circle key={i} cx={x} cy={y} r="0.9" fill={C.gold} fillOpacity="0.55"/>
    ))}
    <circle cx="24" cy="21" r="1.4" fill={C.gold} fillOpacity="0.7"/>
    <text x="24" y="23.5" textAnchor="middle" fill={C.gold}
      style={{fontSize:'7.5px',fontWeight:900,fontFamily:"Georgia,serif",letterSpacing:'1.5px'}}>BMW</text>
    <text x="24" y="36.5" textAnchor="middle" fill={C.muted}
      style={{fontSize:'3px',fontFamily:'sans-serif',letterSpacing:'1.4px',fontWeight:600,textTransform:'uppercase'}}>GOLF GROUP</text>
  </svg>
);

// ─────────────────────────────────────────────────────────
export default function App() {
  const configured = SUPABASE_URL !== 'YOUR_SUPABASE_URL';

  const [loading,   setLoading]  = useState(true);
  const [saving,    setSaving]   = useState(false);
  const [err,       setErr]      = useState('');
  const [view,      setView]     = useState('live');
  const [adminMode, setAdmin]    = useState(false);
  const [adminPw,   setAdminPw]  = useState('');
  const [showPwBox, setShowPwBox]= useState(false);
  const ADMIN_PW = 'bmw2024'; // Change this!

  const [players,   setPlayers]  = useState([]);
  const [dbCourses, setDbCourses]= useState([]);
  const [rounds,    setRounds]   = useState([]);
  const [selRound,  setSelRound] = useState(null);
  const [scorecardOpen, setScorecardOpen] = useState(false);

  // Entry state
  const [newRound,    setNewRound]    = useState({date:'',courseId:'',scores:{}});
  const [entryPlayer, setEntryPlayer] = useState('');
  const [entryScores, setEntryScores] = useState(Array(18).fill(''));
  const [cfgEdit,     setCfgEdit]     = useState(null);
  const [addPlayerName, setAddPlayerName] = useState('');
  const [addPlayerHc,   setAddPlayerHc]   = useState('');

  const loadAll = useCallback(async (keepRound=null) => {
    setLoading(true); setErr('');
    try {
      const [pls,crs,rds,scs,ctps,pairs,cfgs] = await Promise.all([
        sb('players?order=hc'),
        sb('courses?order=name'),
        sb('rounds?order=id.desc'),
        sb('scores?select=*'),
        sb('ctp?select=*'),
        sb('pairings?select=*&order=group_num,team_num'),
        sb('round_config?select=*'),
      ]);
      setPlayers(pls); setDbCourses(crs);
      const assembled = rds.map(r=>assembleRound(r,scs,ctps,pairs,cfgs,crs));
      setRounds(assembled);
      if(assembled.length) setSelRound(keepRound??assembled[0].id);
    } catch(e){ setErr('DB error: '+e.message); }
    setLoading(false);
  },[]);

  useEffect(()=>{ if(configured) loadAll(); else setLoading(false); },[]);

  const round    = rounds.find(r=>r.id===selRound)||rounds[0];
  const hcMap    = Object.fromEntries(players.map(p=>[p.name,p.hc]));
  const par      = round?.par||[4,4,3,4,5,3,4,4,5,4,4,3,4,4,4,4,4,5];
  const parTotal = round?.parTotal||72;
  const par3Idx  = par.reduce((a,p,i)=>p===3?[...a,i]:a,[]);

  const payouts = useMemo(()=>round
    ?calcPayouts(round.config,round.scores,round.ctp,round.pairings,hcMap,parTotal)
    :null,[round,players]);

  const flightedLB = useMemo(()=>{
    if(!round?.config) return {A:[],B:[],C:[]};
    const res={};
    [{k:'A',p:round.config.flight_a||[]},{k:'B',p:round.config.flight_b||[]},{k:'C',p:round.config.flight_c||[]}].forEach(({k,p})=>{
      res[k]=p.filter(n=>round.scores[n]).map(n=>({
        name:n,gross:sumArr(round.scores[n]),hc:hcMap[n]??0,
        net:sumArr(round.scores[n])-(hcMap[n]??0),toPar:sumArr(round.scores[n])-parTotal,
      })).sort((a,b)=>a.net-b.net);
    });
    return res;
  },[round,players]);

  const teamResults = useMemo(()=>{
    if(!round) return [];
    return round.pairings.map((pairs,gi)=>({group:gi+1,teams:pairs.map(pair=>{
      const bb=computeBestBall(round.scores,pair);
      return {pair,bestBall:bb?sumArr(bb):null,scores:bb};
    })}));
  },[round]);

  const seasonStandings = useMemo(()=>{
    const stats={};
    rounds.forEach(r=>{
      const names=Object.keys(r.scores);
      const {skins} = computeSkins(r.scores,names);
      const lb=names.map(n=>({name:n,net:sumArr(r.scores[n])-(hcMap[n]??0)})).sort((a,b)=>a.net-b.net);
      names.forEach(n=>{
        if(!stats[n]) stats[n]={name:n,rounds:0,totalGross:0,totalNet:0,skins:0,wins:0};
        stats[n].rounds++;
        stats[n].totalGross+=sumArr(r.scores[n]);
        stats[n].totalNet+=sumArr(r.scores[n])-(hcMap[n]??0);
        stats[n].skins+=skins[n]??0;
        if(n===lb[0]?.name) stats[n].wins++;
      });
    });
    return Object.values(stats).sort((a,b)=>(a.totalNet/a.rounds)-(b.totalNet/b.rounds));
  },[rounds,players]);

  // ── MUTATIONS ─────────────────────────────────────────
  const saveCtp = async (key,val) => {
    if(!round) return;
    try { await sb(`ctp?round_id=eq.${round.id}&hole_key=eq.${key}`,'PATCH',{player_name:val}); await loadAll(selRound); }
    catch(e){ setErr(e.message); }
  };

  const saveConfig = async () => {
    if(!cfgEdit||!round) return;
    setSaving(true);
    try {
      await sb(`round_config?round_id=eq.${round.id}`,'PATCH',{
        buy_in:cfgEdit.buy_in,super_skin_fee:cfgEdit.super_skin_fee,
        pct_ctp:cfgEdit.pct_ctp,pct_low_net:cfgEdit.pct_low_net,
        pct_skins:cfgEdit.pct_skins,pct_2mbd:cfgEdit.pct_2mbd,
        flight_a:cfgEdit.flight_a,flight_b:cfgEdit.flight_b,flight_c:cfgEdit.flight_c,
        super_skin_players:cfgEdit.super_skin_players,odd_player:cfgEdit.odd_player||null,
      });
      setCfgEdit(null); await loadAll(selRound);
    } catch(e){ setErr(e.message); }
    setSaving(false);
  };

  const saveEntryScore = () => {
    if(!entryPlayer||entryScores.some(s=>s===''||isNaN(Number(s)))) return;
    setNewRound(nr=>({...nr,scores:{...nr.scores,[entryPlayer]:entryScores.map(Number)}}));
    setEntryPlayer(''); setEntryScores(Array(18).fill(''));
  };

  const submitRound = async () => {
    if(!newRound.date||!newRound.courseId||Object.keys(newRound.scores).length===0) return;
    setSaving(true);
    try {
      const [rRow] = await sb('rounds','POST',{date:newRound.date,course_id:Number(newRound.courseId)});
      const rid = rRow.id;
      await sb('scores','POST',Object.entries(newRound.scores).map(([name,holes])=>({round_id:rid,player_name:name,holes})));
      const names = Object.keys(newRound.scores);
      const pairRows=[];
      for(let i=0;i<names.length;i+=4){
        const g=names.slice(i,Math.min(i+4,names.length)),gi=Math.floor(i/4)+1;
        if(g.length>=4){ pairRows.push({round_id:rid,group_num:gi,team_num:1,player1:g[0],player2:g[1]}); pairRows.push({round_id:rid,group_num:gi,team_num:2,player1:g[2],player2:g[3]}); }
        else if(g.length>=2) pairRows.push({round_id:rid,group_num:gi,team_num:1,player1:g[0],player2:g[1]||''});
      }
      if(pairRows.length) await sb('pairings','POST',pairRows);
      await sb('ctp','POST',[{round_id:rid,hole_key:'h3',player_name:''},{round_id:rid,hole_key:'h6',player_name:''},{round_id:rid,hole_key:'h12',player_name:''}]);
      const sorted=[...names].sort((a,b)=>(hcMap[a]??0)-(hcMap[b]??0));
      const third=Math.floor(sorted.length/3);
      const odd=sorted.length%3!==0?sorted[sorted.length-1]:null;
      const fc=sorted.slice(third*2);
      await sb('round_config','POST',{
        round_id:rid,buy_in:25,super_skin_fee:10,pct_ctp:20,pct_low_net:30,pct_skins:20,pct_2mbd:30,
        flight_a:sorted.slice(0,third),flight_b:sorted.slice(third,third*2),
        flight_c:odd?fc.filter(p=>p!==odd):fc,odd_player:odd,super_skin_players:[],
      });
      setNewRound({date:'',courseId:'',scores:{}}); setSelRound(rid);
      await loadAll(rid); setView('live');
    } catch(e){ setErr(e.message); }
    setSaving(false);
  };

  const shufflePairings = async () => {
    if(!round) return; setSaving(true);
    try {
      await sb(`pairings?round_id=eq.${round.id}`,'DELETE');
      const rows=[];
      round.groups.forEach((g,gi)=>{
        const s=[...g].sort(()=>Math.random()-.5);
        if(s.length>=4){ rows.push({round_id:round.id,group_num:gi+1,team_num:1,player1:s[0],player2:s[1]}); rows.push({round_id:round.id,group_num:gi+1,team_num:2,player1:s[2],player2:s[3]}); }
        else if(s.length>=2) rows.push({round_id:round.id,group_num:gi+1,team_num:1,player1:s[0],player2:s[1]||''});
      });
      if(rows.length) await sb('pairings','POST',rows);
      await loadAll(selRound);
    } catch(e){ setErr(e.message); }
    setSaving(false);
  };

  const addPlayer = async () => {
    if(!addPlayerName.trim()||addPlayerHc==='') return;
    setSaving(true);
    try { await sb('players','POST',{name:addPlayerName.trim(),hc:Number(addPlayerHc)}); setAddPlayerName(''); setAddPlayerHc(''); await loadAll(selRound); }
    catch(e){ setErr(e.message); } setSaving(false);
  };

  const updateHc = async (id,hc) => {
    try { await sb(`players?id=eq.${id}`,'PATCH',{hc:Number(hc)}); await loadAll(selRound); } catch(e){ setErr(e.message); }
  };

  // ── NAV ───────────────────────────────────────────────
  const nav = [
    {key:'live',    label:'Live $',     icon:'💵'},
    {key:'board',   label:'Leaderboard',icon:'🏆'},
    {key:'skins',   label:'Super Skins',icon:'💀'},
    {key:'draw',    label:'2MBD',       icon:'🎲'},
    {key:'season',  label:'Season',     icon:'📊'},
    ...(adminMode?[
      {key:'entry',  label:'Add Round', icon:'✏️'},
      {key:'setup',  label:'Setup',     icon:'⚙️'},
      {key:'roster', label:'Roster',    icon:'👥'},
    ]:[]),
  ];

  // ── UI HELPERS ─────────────────────────────────────────
  const Card = ({children,style:s={}}) => <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',...s}}>{children}</div>;
  const CardHead = ({children,right}) => (
    <div style={{background:C.card2,padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{color:C.gold,fontSize:'0.77rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase'}}>{children}</span>
      {right&&<span>{right}</span>}
    </div>
  );
  const FlightBadge = ({f}) => (
    <span style={{background:FC[f]+'28',color:FC[f],borderRadius:4,padding:'2px 9px',fontSize:'0.7rem',fontWeight:700,border:`1px solid ${FC[f]}35`}}>Flight {f}</span>
  );
  const MoneyTag = ({val,big}) => (
    <span style={{color:C.gold,fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:big?'1.3rem':'0.88rem'}}>{fmt$0(val)}</span>
  );

  // ── SETUP SCREEN ──────────────────────────────────────
  if(!configured) return (
    <div style={{background:C.bg,minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{maxWidth:560,width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:36}}>
        <div style={{textAlign:'center',marginBottom:28}}><Logo size={72}/>
          <h1 style={{fontFamily:"'Playfair Display',serif",color:C.gold,fontSize:'1.6rem',margin:'12px 0 6px'}}>BMW Golf Group</h1>
          <p style={{color:C.muted,fontSize:'0.82rem',margin:0}}>Connect your Supabase database to get started</p>
        </div>
        {[
          ['1','Create free project at','supabase.com','https://supabase.com'],
          ['2','SQL Editor → paste & run bmw-setup.sql','',''],
          ['3','Project Settings → API → copy URL & anon key','',''],
          ['4','Replace the two constants at the top of this file','',''],
        ].map(([n,text,link,href])=>(
          <div key={n} style={{display:'flex',gap:12,alignItems:'flex-start',background:'#040a05',borderRadius:8,padding:'11px 14px',marginBottom:8}}>
            <div style={{minWidth:24,height:24,borderRadius:'50%',background:C.gold,color:'#040a05',fontWeight:700,fontSize:'0.75rem',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{n}</div>
            <p style={{margin:0,color:C.cream,fontSize:'0.82rem',lineHeight:1.6}}>{text}{' '}{link&&(href?<a href={href} target="_blank" style={{color:C.gold}}>{link}</a>:link)}</p>
          </div>
        ))}
        <div style={{marginTop:16,background:'#040a05',border:`1px solid ${C.gold}30`,borderRadius:8,padding:14,fontFamily:"'DM Mono',monospace",fontSize:'0.74rem'}}>
          <div style={{color:C.muted,marginBottom:4}}>// top of bmw-golf.jsx</div>
          <div style={{color:C.cream}}>const SUPABASE_URL = <span style={{color:'#86efac'}}>'https://xxxx.supabase.co'</span>;</div>
          <div style={{color:C.cream}}>const SUPABASE_ANON_KEY = <span style={{color:'#86efac'}}>'eyJhbGci...'</span>;</div>
        </div>
      </div>
    </div>
  );

  if(loading) return (
    <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{textAlign:'center'}}>
        <div style={{display:'inline-block',animation:'spin 1.4s linear infinite',fontSize:'2rem',marginBottom:12}}>⛳</div>
        <div style={{color:C.muted,fontSize:'0.84rem'}}>Loading BMW Golf Group…</div>
      </div>
    </div>
  );

  return (
    <div style={{background:C.bg,minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",color:C.cream}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {err&&<div style={{background:'#2a0808',borderBottom:'1px solid #5a1818',padding:'7px 20px',display:'flex',justifyContent:'space-between'}}>
        <span style={{color:'#f87171',fontSize:'0.8rem'}}>⚠️ {err}</span>
        <button onClick={()=>setErr('')} style={{background:'transparent',border:'none',color:'#f87171',cursor:'pointer'}}>✕</button>
      </div>}
      {saving&&<div style={{background:C.gold,padding:'4px',textAlign:'center',fontSize:'0.72rem',color:'#040a05',fontWeight:700,letterSpacing:'0.05em'}}>SAVING…</div>}

      {/* Admin password modal */}
      {showPwBox&&(
        <div style={{position:'fixed',inset:0,background:'#000000aa',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:28,minWidth:280}}>
            <div style={{color:C.gold,fontWeight:700,marginBottom:12}}>🔒 Admin Password</div>
            <input type="password" value={adminPw} onChange={e=>setAdminPw(e.target.value)} placeholder="Enter password"
              onKeyDown={e=>{ if(e.key==='Enter'){ if(adminPw===ADMIN_PW){setAdmin(true);setShowPwBox(false);setAdminPw('');} else setErr('Wrong password'); }}}
              style={{width:'100%',background:'#040a05',color:C.cream,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 12px',fontSize:'0.9rem',boxSizing:'border-box',marginBottom:10}}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{ if(adminPw===ADMIN_PW){setAdmin(true);setShowPwBox(false);setAdminPw('');}else setErr('Wrong password');}}
                style={{flex:1,background:C.gold,color:'#040a05',border:'none',borderRadius:6,padding:'8px',fontWeight:700,cursor:'pointer'}}>Unlock</button>
              <button onClick={()=>{setShowPwBox(false);setAdminPw('');}}
                style={{flex:1,background:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{borderBottom:`1px solid ${C.border}`,position:'sticky',top:0,zIndex:50,backdropFilter:'blur(14px)',backgroundColor:'rgba(6,14,8,0.94)'}}>
        <div style={{maxWidth:1060,margin:'0 auto',padding:'0 16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:56,gap:10}}>
            <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
              <Logo size={38}/>
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",color:C.gold,fontSize:'1rem',lineHeight:1.1}}>BMW Golf Group</div>
                <div style={{color:C.muted,fontSize:'0.62rem',marginTop:1}}>
                  {round?.course?.name||'—'} · {round?.course?.rating} / {round?.course?.slope} · {round?.date||'—'}
                </div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',justifyContent:'flex-end'}}>
              <select value={selRound??''} onChange={e=>setSelRound(Number(e.target.value))}
                style={{background:C.card,color:C.cream,border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 8px',fontSize:'0.72rem',maxWidth:130}}>
                {rounds.map(r=><option key={r.id} value={r.id}>{r.date}</option>)}
              </select>
              {nav.map(n=>(
                <button key={n.key} onClick={()=>setView(n.key)} style={{
                  background:view===n.key?C.gold:'transparent',color:view===n.key?'#040a05':C.muted,
                  border:`1px solid ${view===n.key?C.gold:C.border}`,borderRadius:6,
                  padding:'4px 9px',fontSize:'0.71rem',fontWeight:view===n.key?700:400,cursor:'pointer',
                  display:'flex',alignItems:'center',gap:3,
                }}><span>{n.icon}</span><span>{n.label}</span></button>
              ))}
              <button onClick={()=>adminMode?setAdmin(false):setShowPwBox(true)} style={{
                background:adminMode?'#1a3a1020':'transparent',color:adminMode?'#4ade80':C.muted,
                border:`1px solid ${adminMode?'#2a6a20':C.border}`,borderRadius:6,padding:'4px 9px',fontSize:'0.71rem',cursor:'pointer',
              }}>{adminMode?'🔓 Admin':'🔒'}</button>
            </div>
          </div>
        </div>
      </header>

      <main style={{maxWidth:1060,margin:'0 auto',padding:'20px 16px'}}>

        {/* ══════════════════════ LIVE PAYOUTS ══════════════════════ */}
        {view==='live'&&(
          <div>
            <div style={{marginBottom:18}}>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4}}>💵 Live Payout Board</h2>
              <p style={{color:C.muted,fontSize:'0.75rem',margin:0}}>
                {round?.course?.name} · White Tees · CR {round?.course?.rating} / {round?.course?.slope}
                {payouts&&<> · <span style={{color:C.cream}}>{payouts.fieldSize} players</span> · Total pot <MoneyTag val={payouts.totalPot}/></>}
                {payouts?.superSkinPot>0&&<> · Super Skins <span style={{color:'#fbbf24',fontWeight:700}}>{fmt$0(payouts.superSkinPot)}</span></>}
                {payouts?.oddPlayer&&<span style={{color:'#f87171'}}> · ⚠️ {payouts.oddPlayer} refunded (odd field)</span>}
              </p>
            </div>

            {!payouts&&<div style={{color:C.muted,textAlign:'center',padding:'48px 0',fontSize:'0.85rem'}}>
              No configuration yet.<br/>Admin → Setup to assign flights and buy-in.
            </div>}

            {payouts&&(<>
              {/* Pot summary */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
                {[
                  {icon:'📍',label:'CTP',         pot:payouts.ctpPot,     sub:`${fmt$0(payouts.ctpPerHole)}/hole`},
                  {icon:'🏅',label:'Low Net',      pot:payouts.lowNetPot,  sub:`${fmt$0(payouts.lowNetPot/3)}/flight`},
                  {icon:'🎯',label:'Skins',        pot:payouts.skinsPot,   sub:`${fmt$0(payouts.skinsPot/3)}/flight`},
                  {icon:'🎲',label:'2MBD',         pot:payouts.twoMbdPot,  sub:'60% / 40%'},
                ].map(x=>(
                  <Card key={x.label}>
                    <div style={{padding:'14px',textAlign:'center'}}>
                      <div style={{fontSize:'1.2rem',marginBottom:4}}>{x.icon}</div>
                      <div style={{color:C.muted,fontSize:'0.65rem',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:3}}>{x.label}</div>
                      <MoneyTag val={x.pot} big/>
                      <div style={{color:C.muted,fontSize:'0.64rem',marginTop:3}}>{payouts.breakdown[x.label==='Low Net'?'lowNet':x.label==='2MBD'?'twoMbd':x.label.toLowerCase()]}% · {x.sub}</div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Super Skins tracker */}
              {payouts.superSkinPot>0&&(
                <Card style={{marginBottom:18,border:`1px solid #fbbf2435`}}>
                  <CardHead>💀 Super Skins — {fmt$0(payouts.superSkinPot)} pot · {payouts.superSkins.players.length} players · {fmt$(payouts.superSkins.perSkin)}/skin</CardHead>
                  <div style={{padding:'12px 16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                    <div>
                      <div style={{color:C.muted,fontSize:'0.68rem',letterSpacing:'0.06em',marginBottom:8}}>STANDINGS</div>
                      {payouts.superSkins.winners.length===0
                        ?<p style={{color:C.muted,fontSize:'0.8rem',margin:0}}>All tied — pot carrying</p>
                        :payouts.superSkins.winners.map(({name,count,payout},i)=>(
                          <div key={name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,padding:'6px 10px',background:i===0?'#14280e':'#040a05',borderRadius:6}}>
                            <span style={{fontSize:'0.82rem',color:i===0?C.cream:C.muted}}>{i===0?'🏆 ':''}{name}</span>
                            <div>
                              <span style={{color:'#fbbf24',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{fmt$0(payout)}</span>
                              <span style={{color:C.muted,fontSize:'0.67rem',marginLeft:6}}>{count}×</span>
                            </div>
                          </div>
                        ))
                      }
                      {payouts.superSkins.totalCarry>0&&<div style={{color:'#f87171',fontSize:'0.72rem',marginTop:6}}>⚡ {payouts.superSkins.totalCarry} skin{payouts.superSkins.totalCarry>1?'s':''} carrying over</div>}
                    </div>
                    <div>
                      <div style={{color:C.muted,fontSize:'0.68rem',letterSpacing:'0.06em',marginBottom:8}}>HOLE BY HOLE</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:3,marginBottom:6}}>
                        {payouts.superSkins.holes.slice(0,9).map((h,i)=>(
                          <div key={i} style={{background:h.winner?'#1a320e':h.tied?'#2a1e08':'#040a05',borderRadius:4,padding:'5px 2px',textAlign:'center',border:`1px solid ${h.winner?'#2a5018':h.tied?'#4a3808':C.border}`}}>
                            <div style={{color:C.muted,fontSize:'0.56rem'}}>{i+1}</div>
                            <div style={{color:h.winner?'#86efac':h.tied?'#fbbf24':'#2a3a2a',fontSize:'0.58rem',fontWeight:700,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {h.winner?h.winner.split(' ')[0]:h.tied?'TIE':'—'}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:3}}>
                        {payouts.superSkins.holes.slice(9).map((h,i)=>(
                          <div key={i+9} style={{background:h.winner?'#1a320e':h.tied?'#2a1e08':'#040a05',borderRadius:4,padding:'5px 2px',textAlign:'center',border:`1px solid ${h.winner?'#2a5018':h.tied?'#4a3808':C.border}`}}>
                            <div style={{color:C.muted,fontSize:'0.56rem'}}>{i+10}</div>
                            <div style={{color:h.winner?'#86efac':h.tied?'#fbbf24':'#2a3a2a',fontSize:'0.58rem',fontWeight:700,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {h.winner?h.winner.split(' ')[0]:h.tied?'TIE':'—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Per-flight breakdown */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
                {['A','B','C'].map(f=>(
                  <Card key={f}>
                    <CardHead><span style={{display:'flex',alignItems:'center',gap:6}}><FlightBadge f={f}/> <span style={{color:C.muted,fontSize:'0.72rem',fontWeight:400}}>{fmt$0((payouts.flightLowNet[f]?.pot||0)+(payouts.flightSkins[f]?.pot||0))} pot</span></span></CardHead>
                    <div style={{padding:12}}>
                      {/* Low Net */}
                      <div style={{marginBottom:12}}>
                        <div style={{color:C.muted,fontSize:'0.65rem',letterSpacing:'0.06em',marginBottom:6}}>🏅 LOW NET — {fmt$0(payouts.flightLowNet[f]?.pot||0)}</div>
                        {(payouts.flightLowNet[f]?.places||[]).map((p,i)=>(
                          <div key={p.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5,padding:'5px 9px',background:i===0?'#12200e':'#040a05',borderRadius:5}}>
                            <span style={{fontSize:'0.78rem',color:i===0?C.cream:C.muted}}>{['🥇','🥈','🥉'][i]} {p.name}</span>
                            <div style={{textAlign:'right'}}>
                              <span style={{color:C.gold,fontWeight:700,fontFamily:"'DM Mono',monospace",fontSize:'0.82rem'}}>{fmt$0(p.payout)}</span>
                              <span style={{color:C.muted,fontSize:'0.65rem',marginLeft:5}}>{p.net}</span>
                            </div>
                          </div>
                        ))}
                        {(payouts.flightLowNet[f]?.places||[]).length===0&&<p style={{color:C.muted,fontSize:'0.74rem',margin:0}}>No scores yet</p>}
                      </div>
                      {/* Skins */}
                      <div>
                        <div style={{color:C.muted,fontSize:'0.65rem',letterSpacing:'0.06em',marginBottom:6}}>🎯 SKINS — {fmt$0(payouts.flightSkins[f]?.pot||0)} · {fmt$(payouts.flightSkins[f]?.perSkin||0)}/skin</div>
                        {(payouts.flightSkins[f]?.winners||[]).slice(0,4).map((w,i)=>(
                          <div key={w.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5,padding:'5px 9px',background:'#040a05',borderRadius:5}}>
                            <span style={{fontSize:'0.77rem',color:C.muted}}>{w.name}</span>
                            <div>
                              <span style={{color:'#86efac',fontWeight:700,fontFamily:"'DM Mono',monospace",fontSize:'0.82rem'}}>{fmt$0(w.payout)}</span>
                              <span style={{color:C.muted,fontSize:'0.65rem',marginLeft:5}}>×{w.count}</span>
                            </div>
                          </div>
                        ))}
                        {(payouts.flightSkins[f]?.winners||[]).length===0&&<p style={{color:C.muted,fontSize:'0.74rem',margin:0}}>No outright winners</p>}
                        {(payouts.flightSkins[f]?.totalCarry||0)>0&&<div style={{color:'#f87171',fontSize:'0.69rem',marginTop:4}}>⚡ {payouts.flightSkins[f].totalCarry} carrying over</div>}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* CTP + 2MBD */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <Card>
                  <CardHead>📍 Closest to Pin — {fmt$0(payouts.ctpPot)}</CardHead>
                  <div style={{padding:'12px 16px'}}>
                    {[{label:'Hole 3 (Par 3)',key:'h3'},{label:'Hole 6 (Par 3)',key:'h6'},{label:'Hole 12 (Par 3)',key:'h12'}].map(({label,key})=>(
                      <div key={key} style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                          <span style={{color:C.muted,fontSize:'0.72rem'}}>{label}</span>
                          <span style={{color:C.gold,fontSize:'0.72rem',fontWeight:600}}>{fmt$0(payouts.ctpPerHole)}</span>
                        </div>
                        {adminMode?(
                          <select value={round?.ctp?.[key]||''} onChange={e=>saveCtp(key,e.target.value)}
                            style={{width:'100%',background:'#040a05',color:C.cream,border:`1px solid ${C.border}`,borderRadius:5,padding:'5px 8px',fontSize:'0.78rem'}}>
                            <option value=''>— Select winner —</option>
                            {Object.keys(round?.scores||{}).sort().map(n=><option key={n} value={n}>{n}</option>)}
                          </select>
                        ):(
                          <div style={{color:round?.ctp?.[key]?C.gold:C.muted,fontSize:'0.82rem',fontWeight:round?.ctp?.[key]?700:400}}>
                            {round?.ctp?.[key]?`🏆 ${round.ctp[key]}`:'Not yet determined'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <CardHead>🎲 2MBD — {fmt$0(payouts.twoMbdPot)}</CardHead>
                  <div style={{padding:'12px 16px'}}>
                    {payouts.twoMbd.winner?(
                      <>
                        <div style={{background:'#122010',borderRadius:8,padding:'10px 14px',marginBottom:8,border:`1px solid ${C.gold}25`}}>
                          <div style={{color:C.muted,fontSize:'0.66rem',marginBottom:3}}>🥇 1ST — {fmt$0(payouts.twoMbd.payFirst)}</div>
                          <div style={{color:C.gold,fontWeight:700}}>{payouts.twoMbd.winner.pair[0]} & {payouts.twoMbd.winner.pair[1]}</div>
                          <div style={{color:C.muted,fontSize:'0.72rem',marginTop:2}}>Best ball: {payouts.twoMbd.winner.total} ({toPar(payouts.twoMbd.winner.total-parTotal)})</div>
                        </div>
                        {payouts.twoMbd.runnerUp&&(
                          <div style={{background:'#040a05',borderRadius:8,padding:'10px 14px'}}>
                            <div style={{color:C.muted,fontSize:'0.66rem',marginBottom:3}}>🥈 2ND — {fmt$0(payouts.twoMbd.paySecond)}</div>
                            <div style={{color:C.cream,fontSize:'0.88rem'}}>{payouts.twoMbd.runnerUp.pair[0]} & {payouts.twoMbd.runnerUp.pair[1]}</div>
                            <div style={{color:C.muted,fontSize:'0.72rem',marginTop:2}}>Best ball: {payouts.twoMbd.runnerUp.total}</div>
                          </div>
                        )}
                      </>
                    ):<p style={{color:C.muted,fontSize:'0.8rem',margin:0}}>No scores yet</p>}
                  </div>
                </Card>
              </div>
            </>)}
          </div>
        )}

        {/* ══════════════════════ LEADERBOARD ══════════════════════ */}
        {view==='board'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:16,flexWrap:'wrap',gap:10}}>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',margin:0}}>🏆 Leaderboard</h2>
              <button onClick={()=>setScorecardOpen(v=>!v)} style={{background:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:'5px 12px',fontSize:'0.74rem',cursor:'pointer'}}>
                {scorecardOpen?'Hide':'Show'} Full Scorecard
              </button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
              {['A','B','C'].map(f=>(
                <Card key={f}>
                  <CardHead><FlightBadge f={f}/></CardHead>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'DM Mono',monospace",fontSize:'0.78rem'}}>
                      <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                        {['#','Player','HC','Gross','Net'].map(h=>(
                          <th key={h} style={{padding:'7px 10px',color:C.muted,fontWeight:500,textAlign:h==='Player'?'left':'center',fontSize:'0.67rem'}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {(flightedLB[f]||[]).map((p,i)=>(
                          <tr key={p.name} style={{borderBottom:`1px solid ${C.border}12`,background:i===0?'#14260e':'transparent'}}>
                            <td style={{padding:'7px 10px',textAlign:'center',color:i<3?C.gold:C.muted,fontWeight:i===0?700:400,fontSize:i<3?'0.9rem':'0.78rem'}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                            <td style={{padding:'7px 10px',color:i===0?C.gold:C.cream,fontWeight:i===0?700:400,fontFamily:"'DM Sans',sans-serif",fontSize:'0.79rem'}}>{p.name}</td>
                            <td style={{padding:'7px 10px',textAlign:'center',color:C.muted}}>{p.hc}</td>
                            <td style={{padding:'7px 10px',textAlign:'center'}}>{p.gross}</td>
                            <td style={{padding:'7px 10px',textAlign:'center',color:i===0?C.gold:C.cream,fontWeight:i===0?700:400}}>{p.net}</td>
                          </tr>
                        ))}
                        {!(flightedLB[f]||[]).length&&<tr><td colSpan={5} style={{padding:'14px',textAlign:'center',color:C.muted,fontSize:'0.76rem'}}>No scores yet</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>

            {/* Full scorecard */}
            {scorecardOpen&&(
              <Card>
                <CardHead>Full Scorecard · {round?.course?.name} · White Tees CR {round?.course?.rating}/{round?.course?.slope}</CardHead>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'DM Mono',monospace",fontSize:'0.72rem'}}>
                    <thead>
                      <tr style={{background:C.card2,borderBottom:`1px solid ${C.border}`}}>
                        <th style={{padding:'7px 12px',textAlign:'left',color:C.muted,position:'sticky',left:0,background:C.card2,minWidth:90,fontSize:'0.68rem'}}>PLAYER</th>
                        {par.map((p,i)=><th key={i} style={{padding:'6px 5px',textAlign:'center',color:par3Idx.includes(i)?'#86efac':C.muted,minWidth:24,fontSize:'0.66rem'}}>{i+1}</th>)}
                        <th style={{padding:'6px 9px',textAlign:'center',color:C.gold,fontSize:'0.68rem'}}>OUT</th>
                        <th style={{padding:'6px 9px',textAlign:'center',color:C.gold,fontSize:'0.68rem'}}>IN</th>
                        <th style={{padding:'6px 9px',textAlign:'center',color:C.gold,fontSize:'0.68rem'}}>TOT</th>
                        <th style={{padding:'6px 9px',textAlign:'center',color:C.gold,fontSize:'0.68rem'}}>NET</th>
                      </tr>
                      <tr style={{background:'#040a05',borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:'5px 12px',color:C.muted,position:'sticky',left:0,background:'#040a05',fontSize:'0.68rem'}}>PAR</td>
                        {par.map((p,i)=><td key={i} style={{padding:'5px 5px',textAlign:'center',color:C.muted}}>{p}</td>)}
                        <td style={{padding:'5px 9px',textAlign:'center',color:C.muted}}>{sumArr(par.slice(0,9))}</td>
                        <td style={{padding:'5px 9px',textAlign:'center',color:C.muted}}>{sumArr(par.slice(9))}</td>
                        <td style={{padding:'5px 9px',textAlign:'center',color:C.muted}}>{parTotal}</td>
                        <td style={{padding:'5px 9px',textAlign:'center',color:C.muted}}>—</td>
                      </tr>
                    </thead>
                    <tbody>
                      {['A','B','C'].flatMap(f=>(flightedLB[f]||[]).map((pl,ri)=>{
                        const sc=round.scores[pl.name]||[];
                        return (
                          <tr key={pl.name} style={{borderBottom:`1px solid ${C.border}10`,background:ri%2===0?'#0b180d':C.card}}>
                            <td style={{padding:'6px 12px',position:'sticky',left:0,background:ri%2===0?'#0b180d':C.card,fontSize:'0.75rem',fontFamily:"'DM Sans',sans-serif",fontWeight:500}}>
                              <span style={{color:FC[f],fontSize:'0.6rem',marginRight:4}}>{f}</span>{pl.name}
                            </td>
                            {sc.map((s,hi)=><td key={hi} style={{padding:'6px 5px',textAlign:'center',color:scoreColor(s,par[hi]),fontWeight:Math.abs(s-par[hi])>=2?700:400}}>{s}</td>)}
                            <td style={{padding:'6px 9px',textAlign:'center',color:C.gold,fontWeight:600}}>{sumArr(sc.slice(0,9))}</td>
                            <td style={{padding:'6px 9px',textAlign:'center',color:C.gold,fontWeight:600}}>{sumArr(sc.slice(9))}</td>
                            <td style={{padding:'6px 9px',textAlign:'center',color:C.gold,fontWeight:700}}>{pl.gross}</td>
                            <td style={{padding:'6px 9px',textAlign:'center',color:C.cream,fontWeight:700}}>{pl.net}</td>
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ══════════════════════ SUPER SKINS ══════════════════════ */}
        {view==='skins'&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4}}>💀 Super Skins</h2>
            <p style={{color:C.muted,fontSize:'0.75rem',marginBottom:16}}>
              Non-flighted · {payouts?.superSkins?.players?.length||0} players opted in · {fmt$0(payouts?.superSkinPot||0)} pot
            </p>
            {!payouts?.superSkinPot
              ?<div style={{color:C.muted,textAlign:'center',padding:'40px',fontSize:'0.84rem'}}>No super skins players for this round yet.<br/>Admin → Setup to add players.</div>
              :(
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <Card>
                  <CardHead>Standings · {fmt$(payouts.superSkins.perSkin)}/skin</CardHead>
                  <div style={{padding:14}}>
                    {payouts.superSkins.winners.length===0
                      ?<p style={{color:C.muted,fontSize:'0.8rem',margin:0}}>All tied — {payouts.superSkins.totalCarry} skin{payouts.superSkins.totalCarry!==1?'s':''} carrying over</p>
                      :payouts.superSkins.winners.map(({name,count,payout},i)=>(
                        <div key={name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'8px 12px',background:i===0?'#14280e':'#040a05',borderRadius:7,border:i===0?`1px solid ${C.gold}20`:`1px solid ${C.border}`}}>
                          <div>
                            <div style={{color:i===0?C.cream:C.muted,fontWeight:i===0?600:400,fontSize:'0.85rem'}}>{i===0?'🏆 ':''}{name}</div>
                            <div style={{color:C.muted,fontSize:'0.68rem'}}>{count} skin{count>1?'s':''}</div>
                          </div>
                          <span style={{color:'#fbbf24',fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:'1.05rem'}}>{fmt$0(payout)}</span>
                        </div>
                      ))
                    }
                  </div>
                </Card>
                <Card>
                  <CardHead>Hole by Hole</CardHead>
                  <div style={{padding:14}}>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:4,marginBottom:6}}>
                      {payouts.superSkins.holes.slice(0,9).map((h,i)=>(
                        <div key={i} style={{background:h.winner?'#1a340e':h.tied?'#2a1e06':'#040a05',borderRadius:5,padding:'6px 3px',textAlign:'center',border:`1px solid ${h.winner?'#2d521a':h.tied?'#4a3a08':C.border}`}}>
                          <div style={{color:C.muted,fontSize:'0.58rem',marginBottom:2}}>{i+1}</div>
                          <div style={{color:h.winner?'#86efac':h.tied?'#fbbf24':'#2a3a2a',fontSize:'0.6rem',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {h.winner?h.winner.split(' ')[0]:h.tied?'TIE':'—'}
                          </div>
                          {h.skins>1&&<div style={{color:'#fbbf24',fontSize:'0.55rem'}}>×{h.skins}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:4}}>
                      {payouts.superSkins.holes.slice(9).map((h,i)=>(
                        <div key={i+9} style={{background:h.winner?'#1a340e':h.tied?'#2a1e06':'#040a05',borderRadius:5,padding:'6px 3px',textAlign:'center',border:`1px solid ${h.winner?'#2d521a':h.tied?'#4a3a08':C.border}`}}>
                          <div style={{color:C.muted,fontSize:'0.58rem',marginBottom:2}}>{i+10}</div>
                          <div style={{color:h.winner?'#86efac':h.tied?'#fbbf24':'#2a3a2a',fontSize:'0.6rem',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {h.winner?h.winner.split(' ')[0]:h.tied?'TIE':'—'}
                          </div>
                          {h.skins>1&&<div style={{color:'#fbbf24',fontSize:'0.55rem'}}>×{h.skins}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:12,padding:'8px 10px',background:'#040a05',borderRadius:6,display:'flex',justifyContent:'space-between'}}>
                      <span style={{color:C.muted,fontSize:'0.72rem'}}>Pot remaining / carrying</span>
                      <span style={{color:'#fbbf24',fontWeight:700,fontFamily:"'DM Mono',monospace",fontSize:'0.82rem'}}>
                        {fmt$0(payouts.superSkins.totalCarry * payouts.superSkins.perSkin)}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════ 2MBD DRAW ══════════════════════ */}
        {view==='draw'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:16,flexWrap:'wrap',gap:10}}>
              <div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:2}}>🎲 2 Man Blind Draw</h2>
                <p style={{color:C.muted,fontSize:'0.75rem',margin:0}}>{round?.date} · Best ball per hole · {fmt$0(payouts?.twoMbdPot||0)} pot</p>
              </div>
              {adminMode&&<button onClick={shufflePairings} style={{background:C.gold,color:'#040a05',border:'none',borderRadius:6,padding:'8px 18px',fontWeight:700,fontSize:'0.84rem',cursor:'pointer'}}>🎲 Redraw</button>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12}}>
              {teamResults.map(({group,teams})=>{
                const w=teams[0]?.bestBall!=null&&teams[1]?.bestBall!=null?(teams[0].bestBall<teams[1].bestBall?0:teams[0].bestBall>teams[1].bestBall?1:-1):null;
                return (
                  <Card key={group}>
                    <CardHead>Group {group}</CardHead>
                    <div style={{padding:10,display:'flex',flexDirection:'column',gap:8}}>
                      {teams.map((team,ti)=>(
                        <div key={ti} style={{background:w===ti?'#16280e':'#040a05',borderRadius:8,padding:'10px 14px',border:`1px solid ${w===ti?C.gold+'30':C.border}`}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <div>
                              <div style={{color:w===ti?C.gold:C.muted,fontSize:'0.74rem',fontWeight:600,marginBottom:4}}>{w===ti?'🏆 ':''}{team.pair[0]} & {team.pair[1]}</div>
                              <div style={{display:'flex',gap:6}}>
                                {team.pair.map(n=><span key={n} style={{background:C.green+'50',borderRadius:4,padding:'1px 7px',fontSize:'0.66rem',color:C.muted}}>HC {hcMap[n]??'?'}</span>)}
                              </div>
                            </div>
                            {team.bestBall!=null&&(
                              <div style={{textAlign:'right'}}>
                                <div style={{color:C.muted,fontSize:'0.62rem',marginBottom:1}}>Best Ball</div>
                                <div style={{color:w===ti?C.gold:C.cream,fontSize:'1.35rem',fontWeight:700,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{team.bestBall}</div>
                                <div style={{color:C.muted,fontSize:'0.68rem',marginTop:1}}>{toPar(team.bestBall-parTotal)}</div>
                              </div>
                            )}
                          </div>
                          {team.scores&&(
                            <div style={{marginTop:8,display:'flex',gap:2,flexWrap:'wrap'}}>
                              {team.scores.map((s,hi)=>(
                                <div key={hi} style={{textAlign:'center',minWidth:20}}>
                                  <div style={{color:C.muted,fontSize:'0.52rem'}}>{hi+1}</div>
                                  <div style={{color:scoreColor(s,par[hi]),fontSize:'0.68rem',fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{s}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {w===-1&&<p style={{textAlign:'center',color:C.muted,fontSize:'0.74rem',margin:0}}>🤝 Tied</p>}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════ SEASON ══════════════════════ */}
        {view==='season'&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4}}>📊 Season Standings</h2>
            <p style={{color:C.muted,fontSize:'0.75rem',marginBottom:16}}>{rounds.length} round{rounds.length!==1?'s':''} · Ranked by avg net</p>
            <Card>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'DM Mono',monospace",fontSize:'0.8rem'}}>
                  <thead><tr style={{background:C.card2,borderBottom:`1px solid ${C.border}`}}>
                    {['#','Player','HC','Rds','Avg Gross','Avg Net','Skins','Wins'].map(h=>(
                      <th key={h} style={{padding:'9px 11px',color:C.muted,fontWeight:500,textAlign:h==='Player'?'left':'center',fontSize:'0.69rem',letterSpacing:'0.04em'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {seasonStandings.map((p,i)=>(
                      <tr key={p.name} style={{borderBottom:`1px solid ${C.border}15`,background:i===0?'#14260e':i%2===0?'#0b180d':C.card}}>
                        <td style={{padding:'8px 11px',textAlign:'center',color:i<3?C.gold:C.muted,fontWeight:i===0?700:400,fontSize:i<3?'0.9rem':'0.8rem'}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                        <td style={{padding:'8px 11px',color:i===0?C.gold:C.cream,fontWeight:i===0?700:400,fontFamily:"'DM Sans',sans-serif"}}>{p.name}</td>
                        <td style={{padding:'8px 11px',textAlign:'center',color:C.muted}}>{hcMap[p.name]??'—'}</td>
                        <td style={{padding:'8px 11px',textAlign:'center',color:C.muted}}>{p.rounds}</td>
                        <td style={{padding:'8px 11px',textAlign:'center'}}>{(p.totalGross/p.rounds).toFixed(1)}</td>
                        <td style={{padding:'8px 11px',textAlign:'center',color:i===0?C.gold:C.cream,fontWeight:i===0?700:400}}>{(p.totalNet/p.rounds).toFixed(1)}</td>
                        <td style={{padding:'8px 11px',textAlign:'center',color:p.skins>0?'#4ade80':C.muted}}>{p.skins}</td>
                        <td style={{padding:'8px 11px',textAlign:'center',color:p.wins>0?C.gold:C.muted}}>{p.wins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════════ ADD ROUND (Admin) ══════════════ */}
        {view==='entry'&&adminMode&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4}}>✏️ Add New Round</h2>
            <p style={{color:C.muted,fontSize:'0.76rem',marginBottom:18}}>Select course · CR/Slope auto-fills from White tee data</p>

            <Card style={{marginBottom:14}}>
              <CardHead>Round Details</CardHead>
              <div style={{padding:16,display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{display:'block',color:C.muted,fontSize:'0.71rem',marginBottom:4}}>Date</label>
                  <input type="text" value={newRound.date} placeholder="May 11, 2025"
                    onChange={e=>setNewRound(nr=>({...nr,date:e.target.value}))}
                    style={{width:'100%',background:'#040a05',color:C.cream,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem',boxSizing:'border-box'}}/>
                </div>
                <div>
                  <label style={{display:'block',color:C.muted,fontSize:'0.71rem',marginBottom:4}}>Course</label>
                  <select value={newRound.courseId} onChange={e=>{setNewRound(nr=>({...nr,courseId:e.target.value}));}}
                    style={{width:'100%',background:'#040a05',color:C.cream,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}>
                    <option value=''>— Select course —</option>
                    {/* Alamo City Golf Trail courses first */}
                    <optgroup label="Alamo City Golf Trail (White Tees)">
                      {ALAMO_COURSES.map(c=>{
                        const match = dbCourses.find(d=>d.name===c.name);
                        return match?<option key={match.id} value={match.id}>{c.name} · CR {c.rating}/{c.slope} · Par {c.par}</option>:null;
                      })}
                    </optgroup>
                    <optgroup label="Other Courses">
                      {dbCourses.filter(d=>!ALAMO_COURSES.find(a=>a.name===d.name)).map(c=>(
                        <option key={c.id} value={c.id}>{c.name} · CR {c.course_rating}/{c.slope}</option>
                      ))}
                    </optgroup>
                  </select>
                  {newRound.courseId&&(()=>{
                    const c=dbCourses.find(d=>d.id===Number(newRound.courseId));
                    const a=c?ALAMO_COURSES.find(ac=>ac.name===c.name):null;
                    return c?<div style={{color:C.muted,fontSize:'0.7rem',marginTop:4}}>
                      CR {c.course_rating} · Slope {c.slope} · Par {c.par}{a?` · ${a.yardage} (White Men)`:''}</div>:null;
                  })()}
                </div>
              </div>
            </Card>

            <Card style={{marginBottom:14}}>
              <CardHead>Score Entry</CardHead>
              <div style={{padding:16}}>
                <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'flex-end',flexWrap:'wrap'}}>
                  <div style={{flex:1,minWidth:180}}>
                    <label style={{display:'block',color:C.muted,fontSize:'0.71rem',marginBottom:4}}>Player</label>
                    <select value={entryPlayer} onChange={e=>{setEntryPlayer(e.target.value);setEntryScores(Array(18).fill(''));}}
                      style={{width:'100%',background:'#040a05',color:C.cream,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}>
                      <option value=''>— Choose player —</option>
                      {players.filter(p=>!newRound.scores[p.name]).map(p=>(
                        <option key={p.name} value={p.name}>{p.name} (HC {p.hc})</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={saveEntryScore} disabled={!entryPlayer}
                    style={{background:entryPlayer?C.gold:C.border,color:entryPlayer?'#040a05':C.muted,border:'none',borderRadius:6,padding:'9px 18px',fontWeight:700,fontSize:'0.84rem',cursor:entryPlayer?'pointer':'default'}}>
                    Save ✓
                  </button>
                </div>
                {entryPlayer&&(
                  <div>
                    <div style={{color:C.muted,fontSize:'0.71rem',marginBottom:10}}>Scores for <span style={{color:C.gold,fontWeight:600}}>{entryPlayer}</span> (HC {hcMap[entryPlayer]??'?'})</div>
                    {[{label:'FRONT 9',start:0},{label:'BACK 9',start:9}].map(({label,start})=>(
                      <div key={label} style={{marginBottom:10}}>
                        <div style={{color:C.muted,fontSize:'0.65rem',letterSpacing:'0.07em',marginBottom:6}}>{label}</div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:5}}>
                          {Array.from({length:9},(_,i)=>{
                            const hi=start+i;
                            const c=newRound.courseId?dbCourses.find(d=>d.id===Number(newRound.courseId)):null;
                            const hpar=c?.holes_par?.[hi]||par[hi];
                            return (
                              <div key={hi} style={{textAlign:'center'}}>
                                <div style={{color:hpar===3?'#86efac':C.muted,fontSize:'0.6rem',marginBottom:2}}>H{hi+1} P{hpar}</div>
                                <input type="number" min="1" max="15" value={entryScores[hi]}
                                  onChange={e=>{const n=[...entryScores];n[hi]=e.target.value;setEntryScores(n);}}
                                  style={{width:'100%',background:'#040a05',color:C.cream,border:`1px solid ${entryScores[hi]?C.accent:C.border}`,borderRadius:4,padding:'7px 2px',textAlign:'center',fontSize:'0.9rem',fontFamily:"'DM Mono',monospace",boxSizing:'border-box'}}/>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {entryScores.every(s=>s!=='')&&(
                      <div style={{color:C.muted,fontSize:'0.8rem',marginTop:6}}>
                        Gross <span style={{color:C.gold,fontWeight:700}}>{entryScores.reduce((a,b)=>a+Number(b),0)}</span>
                        {' '}· Net <span style={{color:C.cream}}>{entryScores.reduce((a,b)=>a+Number(b),0)-(hcMap[entryPlayer]??0)}</span>
                      </div>
                    )}
                  </div>
                )}
                {Object.keys(newRound.scores).length>0&&(
                  <div style={{marginTop:14,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                    <div style={{color:C.muted,fontSize:'0.71rem',marginBottom:8}}>Entered ({Object.keys(newRound.scores).length}):</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {Object.entries(newRound.scores).map(([name,sc])=>(
                        <div key={name} style={{background:'#040a05',border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 10px',fontSize:'0.77rem',display:'flex',alignItems:'center',gap:6}}>
                          <span>{name}</span><span style={{color:C.gold,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{sumArr(sc)}</span>
                          <button onClick={()=>setNewRound(nr=>{const s={...nr.scores};delete s[name];return{...nr,scores:s};})}
                            style={{background:'transparent',border:'none',color:C.muted,cursor:'pointer',fontSize:'0.78rem',padding:0}}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
            <button onClick={submitRound} disabled={Object.keys(newRound.scores).length===0||!newRound.date||!newRound.courseId||saving}
              style={{width:'100%',background:Object.keys(newRound.scores).length>0&&newRound.date&&newRound.courseId?C.gold:C.border,color:Object.keys(newRound.scores).length>0?'#040a05':C.muted,border:'none',borderRadius:8,padding:'13px',fontWeight:700,fontSize:'0.9rem',cursor:'pointer',letterSpacing:'0.03em'}}>
              {saving?'Saving…':`Submit Round (${Object.keys(newRound.scores).length} players) →`}
            </button>
          </div>
        )}

        {/* ══════════════════════ SETUP (Admin) ══════════════════ */}
        {view==='setup'&&adminMode&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4}}>⚙️ Round Setup</h2>
            <p style={{color:C.muted,fontSize:'0.76rem',marginBottom:18}}>Configure flights, buy-ins, and super skins for the selected round</p>
            {!round?.config
              ?<div style={{color:C.muted,textAlign:'center',padding:'40px'}}>No round selected or no config. Create a round first.</div>
              :(()=>{
                const cfg = cfgEdit || round.config;
                const setC = (key,val) => setCfgEdit(prev=>({...(prev||round.config),[key]:val}));
                const allPlayers = Object.keys(round.scores);
                const allFlighted = [...(cfg.flight_a||[]),...(cfg.flight_b||[]),...(cfg.flight_c||[])];
                const unflighted = allPlayers.filter(p=>!allFlighted.includes(p)&&p!==cfg.odd_player);
                const moveTo = (player,from,to) => {
                  const remove = f => (cfg[`flight_${f.toLowerCase()}`]||[]).filter(p=>p!==player);
                  const newCfg = {...(cfgEdit||round.config),
                    flight_a: from==='a'?remove('a'):[...(cfg.flight_a||[]),...(to==='a'?[player]:[])],
                    flight_b: from==='b'?remove('b'):[...(cfg.flight_b||[]),...(to==='b'?[player]:[])],
                    flight_c: from==='c'?remove('c'):[...(cfg.flight_c||[]),...(to==='c'?[player]:[])],
                    odd_player: to==='odd'?player:(cfg.odd_player===player?null:cfg.odd_player),
                  };
                  if(from==='odd') newCfg.odd_player=null;
                  setCfgEdit(newCfg);
                };
                return (
                  <div>
                    {/* Buy-in controls */}
                    <Card style={{marginBottom:14}}>
                      <CardHead>Buy-In & Pot Split</CardHead>
                      <div style={{padding:16,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                        {[
                          {label:'Buy-In ($)',key:'buy_in'},
                          {label:'Super Skin Fee ($)',key:'super_skin_fee'},
                        ].map(f=>(
                          <div key={f.key}>
                            <label style={{display:'block',color:C.muted,fontSize:'0.71rem',marginBottom:4}}>{f.label}</label>
                            <input type="number" value={cfg[f.key]||0} onChange={e=>setC(f.key,Number(e.target.value))}
                              style={{width:'100%',background:'#040a05',color:C.cream,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem',boxSizing:'border-box'}}/>
                          </div>
                        ))}
                        <div style={{display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                          <div style={{color:C.muted,fontSize:'0.71rem',marginBottom:4}}>Total Pot</div>
                          <div style={{color:C.gold,fontWeight:700,fontSize:'1.1rem',fontFamily:"'DM Mono',monospace"}}>{fmt$0(allFlighted.length*(cfg.buy_in||25))}</div>
                        </div>
                        {[
                          {label:'% CTP',key:'pct_ctp'},
                          {label:'% Low Net',key:'pct_low_net'},
                          {label:'% Skins',key:'pct_skins'},
                          {label:'% 2MBD',key:'pct_2mbd'},
                        ].map(f=>(
                          <div key={f.key}>
                            <label style={{display:'block',color:C.muted,fontSize:'0.71rem',marginBottom:4}}>{f.label}</label>
                            <input type="number" value={cfg[f.key]||0} min="0" max="100" onChange={e=>setC(f.key,Number(e.target.value))}
                              style={{width:'100%',background:'#040a05',color:C.cream,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem',boxSizing:'border-box'}}/>
                          </div>
                        ))}
                        <div style={{display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                          <div style={{color:(cfg.pct_ctp||0)+(cfg.pct_low_net||0)+(cfg.pct_skins||0)+(cfg.pct_2mbd||0)===100?'#4ade80':'#f87171',fontSize:'0.78rem',fontWeight:700}}>
                            Total: {(cfg.pct_ctp||0)+(cfg.pct_low_net||0)+(cfg.pct_skins||0)+(cfg.pct_2mbd||0)}% {((cfg.pct_ctp||0)+(cfg.pct_low_net||0)+(cfg.pct_skins||0)+(cfg.pct_2mbd||0))===100?'✓':'≠ 100'}
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Flight assignment */}
                    <Card style={{marginBottom:14}}>
                      <CardHead>Flight Assignment · {allPlayers.length} players</CardHead>
                      <div style={{padding:16}}>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
                          {['a','b','c'].map(f=>(
                            <div key={f}>
                              <div style={{marginBottom:6}}><FlightBadge f={f.toUpperCase()}/> <span style={{color:C.muted,fontSize:'0.7rem',marginLeft:4}}>{(cfg[`flight_${f}`]||[]).length} players</span></div>
                              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                                {(cfg[`flight_${f}`]||[]).map(p=>(
                                  <div key={p} style={{background:'#040a05',borderRadius:5,padding:'5px 8px',fontSize:'0.76rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                    <span>{p} <span style={{color:C.muted,fontSize:'0.65rem'}}>HC{hcMap[p]??'?'}</span></span>
                                    <select defaultValue='' onChange={e=>{ if(e.target.value) moveTo(p,f,e.target.value); e.target.value=''; }}
                                      style={{background:'transparent',border:'none',color:C.muted,fontSize:'0.65rem',cursor:'pointer'}}>
                                      <option value=''>→</option>
                                      {['a','b','c'].filter(x=>x!==f).map(x=><option key={x} value={x}>Flight {x.toUpperCase()}</option>)}
                                      <option value='odd'>Odd / Refund</option>
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div>
                            <div style={{marginBottom:6,color:'#f87171',fontSize:'0.7rem',fontWeight:600}}>⚠️ Odd / Refund</div>
                            <div style={{display:'flex',flexDirection:'column',gap:4}}>
                              {cfg.odd_player&&(
                                <div style={{background:'#2a0808',borderRadius:5,padding:'5px 8px',fontSize:'0.76rem',border:'1px solid #5a1818',display:'flex',justifyContent:'space-between'}}>
                                  <span style={{color:'#f87171'}}>{cfg.odd_player}</span>
                                  <select defaultValue='' onChange={e=>{ if(e.target.value) moveTo(cfg.odd_player,'odd',e.target.value); e.target.value=''; }}
                                    style={{background:'transparent',border:'none',color:C.muted,fontSize:'0.65rem',cursor:'pointer'}}>
                                    <option value=''>→</option>
                                    {['a','b','c'].map(x=><option key={x} value={x}>Flight {x.toUpperCase()}</option>)}
                                  </select>
                                </div>
                              )}
                              {unflighted.map(p=>(
                                <div key={p} style={{background:'#040a05',borderRadius:5,padding:'5px 8px',fontSize:'0.76rem',border:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between'}}>
                                  <span style={{color:C.muted}}>{p}</span>
                                  <select defaultValue='' onChange={e=>{ if(e.target.value) moveTo(p,'none',e.target.value); e.target.value=''; }}
                                    style={{background:'transparent',border:'none',color:C.muted,fontSize:'0.65rem',cursor:'pointer'}}>
                                    <option value=''>Add →</option>
                                    {['a','b','c'].map(x=><option key={x} value={x}>Flight {x.toUpperCase()}</option>)}
                                    <option value='odd'>Odd</option>
                                  </select>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Super skins roster */}
                    <Card style={{marginBottom:14}}>
                      <CardHead>Super Skins Roster ({(cfg.super_skin_players||[]).length} opted in · {fmt$0((cfg.super_skin_players||[]).length*(cfg.super_skin_fee||10))} pot)</CardHead>
                      <div style={{padding:16,display:'flex',flexWrap:'wrap',gap:6}}>
                        {allPlayers.sort().map(p=>{
                          const opted = (cfg.super_skin_players||[]).includes(p);
                          return (
                            <button key={p} onClick={()=>setC('super_skin_players',opted?(cfg.super_skin_players||[]).filter(x=>x!==p):[...(cfg.super_skin_players||[]),p])}
                              style={{background:opted?'#1a3a0a':'#040a05',color:opted?'#86efac':C.muted,border:`1px solid ${opted?'#2a6a1a':C.border}`,borderRadius:6,padding:'5px 12px',fontSize:'0.76rem',cursor:'pointer',fontWeight:opted?600:400}}>
                              {opted?'✓ ':''}{p} <span style={{opacity:0.6,fontSize:'0.65rem'}}>HC{hcMap[p]??'?'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </Card>

                    <div style={{display:'flex',gap:10}}>
                      <button onClick={saveConfig} disabled={saving}
                        style={{flex:1,background:C.gold,color:'#040a05',border:'none',borderRadius:8,padding:'12px',fontWeight:700,fontSize:'0.88rem',cursor:'pointer'}}>
                        {saving?'Saving…':'Save Configuration →'}
                      </button>
                      {cfgEdit&&<button onClick={()=>setCfgEdit(null)}
                        style={{background:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 18px',cursor:'pointer',fontSize:'0.84rem'}}>
                        Cancel
                      </button>}
                    </div>
                  </div>
                );
              })()
            }
          </div>
        )}

        {/* ══════════════════════ ROSTER (Admin) ══════════════════ */}
        {view==='roster'&&adminMode&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:'1.4rem',marginBottom:4}}>👥 Player Roster</h2>
            <p style={{color:C.muted,fontSize:'0.76rem',marginBottom:18}}>{players.length} players · Click HC to edit</p>
            <Card style={{marginBottom:14}}>
              <CardHead>Add Player</CardHead>
              <div style={{padding:14,display:'flex',gap:10,flexWrap:'wrap'}}>
                <input value={addPlayerName} onChange={e=>setAddPlayerName(e.target.value)} placeholder="Full name"
                  onKeyDown={e=>e.key==='Enter'&&addPlayer()}
                  style={{flex:2,minWidth:160,background:'#040a05',color:C.cream,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}/>
                <input type="number" value={addPlayerHc} onChange={e=>setAddPlayerHc(e.target.value)} placeholder="HC" min="0" max="54"
                  onKeyDown={e=>e.key==='Enter'&&addPlayer()}
                  style={{flex:1,minWidth:70,background:'#040a05',color:C.cream,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px',fontSize:'0.85rem'}}/>
                <button onClick={addPlayer} disabled={saving}
                  style={{background:C.gold,color:'#040a05',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:700,fontSize:'0.84rem',cursor:'pointer'}}>Add</button>
              </div>
            </Card>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {[...players].sort((a,b)=>a.hc-b.hc).map(p=>(
                <div key={p.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 13px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <span style={{fontSize:'0.81rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</span>
                  <input type="number" defaultValue={p.hc} min="0" max="54"
                    onBlur={e=>{ if(Number(e.target.value)!==p.hc) updateHc(p.id,e.target.value); }}
                    onKeyDown={e=>{ if(e.key==='Enter') updateHc(p.id,e.target.value); }}
                    style={{width:52,background:'#040a05',color:C.gold,border:`1px solid ${C.border}`,borderRadius:4,padding:'3px 6px',fontSize:'0.8rem',fontFamily:"'DM Mono',monospace",textAlign:'center'}}/>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
