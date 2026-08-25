const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);
const API_BASE='';
const pageStart=performance.now();
const fmt=n=>Math.floor(n).toLocaleString('en-US');

let toastTimer;
function toast(msg,type='info'){
  const t=$('#toast');
  t.textContent=msg;
  t.className='show '+type;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{t.className=''},2600);
}

let AC=null;
function beep(f=600,d=.08,type='sine',v=.05,delay=0){
  if(localStorage.getItem('elitebet_muted')==='1')return;
  try{
    AC=AC||new(window.AudioContext||window.webkitAudioContext)();
    const t=AC.currentTime+delay;
    const o=AC.createOscillator(),g=AC.createGain();
    o.type=type;o.frequency.value=f;
    g.gain.setValueAtTime(v,t);
    g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g);g.connect(AC.destination);
    o.start(t);o.stop(t+d);
  }catch(e){}
}
const sndWin=()=>{beep(700,.12);beep(1050,.14,'sine',.05,.12);beep(1400,.18,'sine',.05,.24)};
const sndLose=()=>{beep(220,.25,'sawtooth',.04)};
const sndClick=()=>{beep(500,.05,'square',.03)};

const DEFAULT_STATE={
  balance:1000,name:'Player'+Math.floor(1000+Math.random()*9000),
  wagered:0,betsCount:0,winsCount:0,bestWin:0,deposited:0,
  firstDepositDone:false,tx:[],
  clientSeed:'my-seed',nonce:0,dayLimit:0,excludeUntil:0,fair:[],
  gamesPlayed:[],missions:{},stats:{crashBest:0,greenHit:false,chessBest:''}
};
function loadState(){
  try{
    const s=JSON.parse(localStorage.getItem('elitebet_state'));
    if(s&&typeof s.balance==='number')return Object.assign({},DEFAULT_STATE,s,{tx:Array.isArray(s.tx)?s.tx:[]});
  }catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
let state=loadState();
let CFG={edge:{dice:1,crash:2,roulette:1,slots:0}};
function crashBase(){return Math.max(0.90,0.97-CFG.edge.crash/100)}
async function loadCFG(){
  const d=await apiCall('/api/config');
  if(d&&d.ok&&d.cfg)CFG=d.cfg;
}
function saveState(){localStorage.setItem('elitebet_state',JSON.stringify(state))}
function setBalance(v){state.balance=Math.max(0,Math.floor(v));saveState();renderTop()}
function addBalance(v){setBalance(state.balance+v)}
function renderTop(){
  $('#balance').textContent=fmt(state.balance);
  $('#avatar').textContent=((AUTH?AUTH.user.username:state.name)[0]||'P').toUpperCase();
  const ab=$('#authBtn');
  if(ab)ab.textContent=AUTH?'👤 '+AUTH.user.username:'Login';
}
function logTx(type,amount,details){
  state.tx.unshift({t:Date.now(),type,amount,details});
  if(state.tx.length>150)state.tx.length=150;
  saveState();
  if(AUTH&&type==='bet')apiCall('/api/tournament/track',{amount:Math.abs(amount),win:false}).catch(()=>{});
  if(AUTH&&type==='win')apiCall('/api/tournament/track',{amount:Math.abs(amount),win:true}).catch(()=>{});
}
function todayNet(){
  const today=new Date().toDateString();
  return state.tx
    .filter(t=>new Date(t.t).toDateString()===today&&(t.type==='bet'||t.type==='win'))
    .reduce((a,t)=>a+t.amount,0);
}
function limitBlocked(){
  if(state.excludeUntil&&Date.now()<state.excludeUntil){
    toast('Self-exclusion active until '+new Date(state.excludeUntil).toLocaleString(),'err');
    return true;
  }
  if(state.dayLimit>0&&-todayNet()>=state.dayLimit){
    toast('Daily loss limit ('+fmt(state.dayLimit)+' CR) reached — betting paused until tomorrow 🧘','err');
    return true;
  }
  return false;
}
function takeBet(bet,label){
  if(limitBlocked())return false;
  setBalance(state.balance-bet);
  state.wagered+=bet;state.betsCount++;
  saveState();logTx('bet',-bet,label);
  return true;
}
function giveWin(ret,label){
  addBalance(ret);
  state.winsCount++;
  if(ret>state.bestWin)state.bestWin=ret;
  saveState();logTx('win',ret,label);
}
function getBet(id,label){
  const v=Math.floor(+$(id).value);
  if(!Number.isFinite(v)||v<10){toast('Minimum bet is 10 CR','err');return null}
  if(v>state.balance){toast('Insufficient balance! Make a deposit 💳','err');return null}
  return v;
}

$$('.navbtn').forEach(b=>b.addEventListener('click',()=>{
  $$('.navbtn').forEach(x=>x.classList.toggle('active',x===b));
  $$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+b.dataset.page));
  if(b.dataset.page==='account'){renderAccount();renderAccountExtended()}
  if(b.dataset.page==='leaders')loadLeaders();
  if(b.dataset.page==='wallet'){renderWallet();loadMyWd()}
  sndClick();
}));
function activatePage(name){
  $$('.navbtn').forEach(x=>x.classList.toggle('active',x.dataset.page===name));
  $$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));
}
function selectCGame(g){
  $$('.ctab').forEach(t=>t.classList.toggle('active',t.dataset.game===g));
  $$('.cgame').forEach(c=>c.classList.toggle('active',c.id==='cgame-'+g));
}
$$('.ctab').forEach(t=>t.addEventListener('click',()=>{selectCGame(t.dataset.game);sndClick()}));
$$('.goto-game').forEach(el=>el.addEventListener('click',()=>{activatePage('casino');selectCGame(el.dataset.game);sndClick()}));
$('#gotoSports').addEventListener('click',()=>{activatePage('sports');sndClick()});
$('#cardSports').addEventListener('click',()=>{activatePage('sports');sndClick()});

const NAMES=['Alex_M','LuckyJoe','Sarah_K','MikeT','Dragon88','AnnaP','CasinoKing','Nour99','JohnD','Maria_G','Zizo77','Kevin_W','Hassan_A','Tomas_B','Ivan_Petrov','Leo_Gaming'];
const GAMES=['Crash','Slots','Roulette','Blackjack','Dice'];
function randWin(){
  return{n:NAMES[Math.floor(Math.random()*NAMES.length)],
    g:GAMES[Math.floor(Math.random()*GAMES.length)],
    a:Math.floor(200+Math.random()*9800)};
}
function fillTicker(){
  const items=[];
  for(let i=0;i<9;i++){
    const w=randWin();
    items.push(`<span class="tick-item">🏆 <b>${w.n}</b> won $${fmt(w.a)} on ${w.g}</span>`);
  }
  $('#tickerTrack').innerHTML=items.join('')+items.join('');
}
function renderWinners(){
  $('#winnersList').innerHTML=Array.from({length:5},()=>randWin())
    .sort((a,b)=>b.a-a.a)
    .map(w=>`<div class="winner-row"><span>🏆 <b>${w.n}</b> · ${w.g}</span><span class="tx-amt-pos">+$${fmt(w.a)}</span></div>`).join('');
}

let depMethod='card';
const PM_LABELS={card:'Visa/Mastercard',crypto:'Crypto USDT',wallet:'Skrill/Neteller',bank:'Bank Transfer'};
function resetDepSteps(){
  $('#depStep1').classList.remove('hidden');
  $('#depStep2').classList.add('hidden');
  $('#depStep3').classList.add('hidden');
  $('#bonusNote').classList.toggle('hidden',state.firstDepositDone);
}
function goWallet(){activatePage('wallet');resetDepSteps();renderWallet()}
$('#depositBtn').addEventListener('click',goWallet);
$('#promoDeposit').addEventListener('click',goWallet);
$('#balanceChip').addEventListener('click',goWallet);
$$('#depStep1 .pm').forEach(m=>m.addEventListener('click',()=>{
  $$('#depStep1 .pm').forEach(x=>x.classList.remove('active'));
  m.classList.add('active');
  depMethod=m.dataset.pm;
  sndClick();
}));
$$('#depStep1 .preset').forEach(p=>p.addEventListener('click',()=>{$('#depAmount').value=p.dataset.amt;sndClick()}));
$('#depConfirm').addEventListener('click',async()=>{
  const amt=Math.floor(+$('#depAmount').value);
  if(!Number.isFinite(amt)||amt<10){toast('Minimum deposit is 10 CR','err');return}
  $('#depStep1').classList.add('hidden');
  $('#depStep2').classList.remove('hidden');
  sndClick();
  const real=await tryRealDeposit(depMethod,amt);
  setTimeout(()=>processDepositResult(real,amt),1200);
});
async function tryRealDeposit(method,amount){
  try{
    const r=await fetch(API_BASE+'/api/deposit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({method,amount})
    });
    if(!r.ok)return null;
    const d=await r.json();
    if(d&&d.ok)return d;
    if(d&&d.error==='psp_not_configured')toast('Demo Mode — no payment provider configured','info');
    return null;
  }catch(e){return null}
}
function processDepositResult(res,amount){
  let bonus=0;
  if(!state.firstDepositDone)bonus=Math.min(amount,5000);
  const total=amount+bonus;
  addBalance(total);
  state.deposited+=total;
  state.firstDepositDone=true;
  const via=res?(PM_LABELS[res.method]||PM_LABELS[depMethod]):(PM_LABELS[depMethod]+' (Demo)');
  logTx('deposit',amount,'via '+via+(res&&res.ref?' · ref '+res.ref:''));
  if(bonus>0)logTx('bonus',bonus,'First deposit +100% bonus');
  renderTop();
  $('#depStep2').classList.add('hidden');
  $('#depStep3').classList.remove('hidden');
  $('#depSuccessMsg').textContent='$'+fmt(amount)+' credits added'+(res?' via '+via:' (Demo Mode)')+(bonus?' + $'+fmt(bonus)+' welcome bonus':'');
  renderWallet();
  sndWin();
  toast('+$'+fmt(total)+' CR 💰','win');
}
$('#depDone').addEventListener('click',resetDepSteps);

/* ===== WITHDRAW ===== */
let wdMethod='card';
const WD_MIN=1000;
function renderWallet(){
  const wBal=$('#wBal');if(!wBal)return;
  wBal.textContent=fmt(state.balance);
  $('#wDep').textContent=fmt(state.deposited);
  let wdTotal=0,bonusTotal=0;
  state.tx.forEach(t=>{
    if(t.type==='withdraw')wdTotal+=Math.abs(t.amt);
    if(t.type==='bonus')bonusTotal+=t.amt;
  });
  $('#wWithd').textContent=fmt(wdTotal);
  $('#wBonus').textContent=fmt(bonusTotal);
}
$$('.wpm').forEach(m=>m.addEventListener('click',()=>{
  $$('.wpm').forEach(x=>x.classList.remove('active'));
  m.classList.add('active');
  wdMethod=m.dataset.wm;
  sndClick();
}));
$$('.wpreset').forEach(p=>p.addEventListener('click',()=>{
  $('#wdAmount').value=p.dataset.amt==='max'?Math.max(WD_MIN,Math.floor(state.balance)):p.dataset.amt;
  sndClick();
}));
function setWdMsg(txt,cls){
  const m=$('#wdMsg');
  m.textContent=txt;
  m.className='result '+(cls||'');
  m.classList.toggle('hidden',!txt);
}
function updWdState(){
  const btn=$('#wdConfirm');
  if(!btn)return;
  btn.disabled=!AUTH;
  btn.textContent=AUTH?'Request Withdrawal':'👤 LOGIN TO WITHDRAW';
}
$('#wdConfirm').addEventListener('click',async()=>{
  if(!AUTH){toast('Login required to withdraw — create a free account from the header 👤','err');return}
  const amt=Math.floor(+$('#wdAmount').value);
  if(!Number.isFinite(amt)||amt<WD_MIN){toast('Minimum withdrawal is '+fmt(WD_MIN)+' CR','err');return}
  if(amt>state.balance){toast('Insufficient balance — max available: '+fmt(state.balance)+' CR','err');return}
  const btn=$('#wdConfirm');
  btn.disabled=true;btn.textContent='Processing…';
  setWdMsg('');
  const d=await apiCall('/api/withdraw',{amount:amt,method:wdMethod});
  btn.disabled=false;btn.textContent='Request Withdrawal';
  if(d&&d.ok){
    setBalance(d.balance);
    logTx('withdraw',-amt,'via '+(PM_LABELS[wdMethod]||wdMethod));
    saveState();
    renderWallet();
    loadMyWd();
    setWdMsg('⏳ Request submitted! '+fmt(amt)+' CR will arrive via '+(PM_LABELS[wdMethod]||wdMethod)+' within 24 hours.','win');
    toast('⏳ Withdrawal request sent — arrives within 24h','win');
    beep(700,.1);
  }else if(d&&d.error==='min_withdraw'){
    setWdMsg('❌ Minimum withdrawal is '+fmt(WD_MIN)+' CR','err');
  }else if(d&&d.error==='insufficient'){
    setWdMsg('❌ Insufficient server-side balance','err');
  }else if(d&&d.reason==='banned'){
    lockNow();
  }else{
    setWdMsg('❌ Withdrawal failed — try again','err');
  }
});
async function loadMyWd(){
  if(!AUTH)return;
  const d=await apiCall('/api/my-withdrawals');
  const box=$('#wdList');
  if(!box)return;
  if(!d||!d.ok||!d.items.length){
    box.innerHTML='<div class="wd-empty">No withdrawal requests yet</div>';
    return;
  }
  const chip={pending:'⏳ Pending',paid:'✅ Paid',rejected:'❌ Rejected · refunded'};
  box.innerHTML='<div class="wd-list-title">Your recent requests</div>'+d.items.map(w=>{
    const st=w.status==='paid'?'paid':w.status==='rejected'?'rejected':'pending';
    return '<div class="wd-row">'
      +'<span class="wd-amt">'+fmt(w.amount)+' CR</span>'
      +'<span class="wd-mth">'+(PM_LABELS[w.method]||w.method)+'</span>'
      +'<span class="wd-chip '+st+'">'+chip[st]+'</span>'
      +'<span class="wd-time">'+timeAgo(w.t)+'</span></div>';
  }).join('');
}

const SLOT_SYMS=[
  {s:'🍒',w:26,pay:5},
  {s:'🍋',w:22,pay:6},
  {s:'🔔',w:18,pay:8},
  {s:'⭐',w:14,pay:10},
  {s:'7️⃣',w:11,pay:15},
  {s:'💎',w:7,pay:25},
];
const SLOT_TOTAL=SLOT_SYMS.reduce((a,x)=>a+x.w,0);
const slotReels=[$('#reel0'),$('#reel1'),$('#reel2')];
let slotSpinning=false;
function slotPick(){
  let r=Math.random()*SLOT_TOTAL;
  for(const x of SLOT_SYMS){r-=x.w;if(r<0)return x}
  return SLOT_SYMS[0];
}
$('#slotSpin').addEventListener('click',()=>{
  if(slotSpinning)return;
  const bet=getBet('#slotBet');
  if(bet===null)return;
  slotSpinning=true;
  $('#slotSpin').disabled=true;
  $('#slotResult').textContent='';
  $('#slotResult').className='result';
  if(!takeBet(bet,'Slots spin'))return;
  sndClick();
  const picks=[slotPick(),slotPick(),slotPick()];
  const ivals=slotReels.map(r=>setInterval(()=>{
    r.textContent=SLOT_SYMS[Math.floor(Math.random()*SLOT_SYMS.length)].s;
  },80));
  [900,1500,2100].forEach((ms,i)=>setTimeout(()=>{
    clearInterval(ivals[i]);
    slotReels[i].textContent=picks[i].s;
    beep(400+i*120,.06,'square',.04);
  },ms));
  setTimeout(()=>{
    slotSpinning=false;
    $('#slotSpin').disabled=false;
    const [a,b,c]=picks;
    let mult=0;
    if(a.s===b.s&&b.s===c.s)mult=a.pay;
    else if(a.s===b.s||b.s===c.s||a.s===c.s)mult=2;
    if(mult>0){
      const win=bet*mult;
      giveWin(win,'Slots x'+mult);
      sndWin();
      $('#slotResult').textContent='🎉 You won '+fmt(win)+' CR ('+mult+'x)!';
      $('#slotResult').className='result win';
      toast('+'+fmt(win)+' CR 💰','win');
    }else{
      sndLose();
      $('#slotResult').textContent='😅 Try again!';
      $('#slotResult').className='result lose';
    }
  },2300);
});

const WHEEL_ORDER=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const SEG=360/37;
let rot=0,roulSpinning=false;
const roulHistory=[];
function colorOf(n){return n===0?'green':(RED.has(n)?'red':'black')}
(function buildWheel(){
  const stops=WHEEL_ORDER.map((n,i)=>{
    const c=n===0?'#1fab54':(RED.has(n)?'#c0392b':'#141414');
    return `${c} ${(i*SEG).toFixed(3)}deg ${((i+1)*SEG).toFixed(3)}deg`;
  });
  $('#wheel').style.background=`conic-gradient(${stops.join(',')})`;
})();
$$('#cgame-roulette .bet-opt').forEach(b=>b.addEventListener('click',()=>{
  $$('#cgame-roulette .bet-opt').forEach(x=>x.classList.remove('selected'));
  b.classList.add('selected');
  sndClick();
}));
function renderRoulHistory(){
  $('#roulHistory').innerHTML=roulHistory.slice(0,12)
    .map(n=>`<span class="hist ${colorOf(n)}">${n}</span>`).join('');
}
$('#roulSpin').addEventListener('click',()=>{
  if(roulSpinning)return;
  const sel=$('#cgame-roulette .bet-opt.selected');
  if(!sel){toast('Pick a bet type first','err');return}
  const bet=getBet('#roulBet');
  if(bet===null)return;
  roulSpinning=true;
  $('#roulSpin').disabled=true;
  if(!takeBet(bet,'Roulette '+sel.dataset.bet))return;
  sndClick();
  const n=Math.floor(Math.random()*37);
  const idx=WHEEL_ORDER.indexOf(n);
  const center=idx*SEG+SEG/2;
  rot+=5*360+(((-center-rot)%360)+360)%360;
  $('#wheel').style.transform=`rotate(${rot}deg)`;
  setTimeout(()=>{
    roulSpinning=false;
    $('#roulSpin').disabled=false;
    const col=colorOf(n);
    $('#wheelNum').textContent=n;
    $('#wheelNum').className='hub '+col;
    roulHistory.unshift(n);
    renderRoulHistory();
    const type=sel.dataset.bet;
    let mult=0;
    if(type==='red'&&col==='red')mult=2;
    else if(type==='black'&&col==='black')mult=2;
    else if(type==='green'&&n===0){mult=Math.max(2,36-CFG.edge.roulette);state.stats.greenHit=true;renderMissions()}
    else if(type==='even'&&n!==0&&n%2===0)mult=2;
    else if(type==='odd'&&n%2===1)mult=2;
    if(mult>0){
      const win=bet*mult;
      giveWin(win,'Roulette x'+mult);
      sndWin();
      toast(n+' '+col+' — won '+fmt(win)+' CR 🏆','win');
    }else{
      sndLose();
      toast(n+' '+col+' — bet lost','err');
    }
  },4200);
});

const SUITS=['♠','♥','♦','♣'];
const RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
let bjDeck=[],bjPlayer=[],bjDealer=[],bjBet=0,bjPhase='idle';
function newDeck(){
  bjDeck=[];
  for(const s of SUITS)for(const r of RANKS)bjDeck.push({r,s});
  for(let i=bjDeck.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [bjDeck[i],bjDeck[j]]=[bjDeck[j],bjDeck[i]];
  }
}
function handVal(h){
  let v=0,aces=0;
  for(const c of h){
    if(c.r==='A'){v+=11;aces++}
    else if(c.r==='J'||c.r==='Q'||c.r==='K')v+=10;
    else v+=+c.r;
  }
  while(v>21&&aces>0){v-=10;aces--}
  return v;
}
function cardHTML(c,hidden){
  if(hidden)return '<div class="card back"></div>';
  const red=c.s==='♥'||c.s==='♦';
  return `<div class="card${red?' red':''}"><span>${c.r}</span><span>${c.s}</span></div>`;
}
function renderBJ(hideHole){
  $('#bjDealerCards').innerHTML=bjDealer.map((c,i)=>cardHTML(c,hideHole&&i===1)).join('');
  $('#bjPlayerCards').innerHTML=bjPlayer.map(c=>cardHTML(c,false)).join('');
  $('#bjDealerVal').textContent=hideHole&&bjDealer.length?handVal([bjDealer[0]]):handVal(bjDealer);
  $('#bjPlayerVal').textContent=handVal(bjPlayer);
}
function bjButtons(deal,hit,stand){
  $('#bjDeal').disabled=!deal;
  $('#bjHit').disabled=!hit;
  $('#bjStand').disabled=!stand;
}
$('#bjDeal').addEventListener('click',()=>{
  if(bjPhase!=='idle')return;
  const bet=getBet('#bjBet');
  if(bet===null)return;
  bjBet=bet;
  if(!takeBet(bet,'Blackjack deal'))return;
  newDeck();
  bjPlayer=[bjDeck.pop(),bjDeck.pop()];
  bjDealer=[bjDeck.pop(),bjDeck.pop()];
  bjPhase='play';
  $('#bjMsg').textContent='';
  $('#bjMsg').className='result';
  renderBJ(true);
  sndClick();
  if(handVal(bjPlayer)===21)setTimeout(()=>bjSettle(true),400);
  else bjButtons(false,true,true);
});
$('#bjHit').addEventListener('click',()=>{
  if(bjPhase!=='play')return;
  bjPlayer.push(bjDeck.pop());
  renderBJ(true);
  beep(600,.05,'square',.03);
  if(handVal(bjPlayer)>21)bjSettle(false);
});
$('#bjStand').addEventListener('click',()=>{
  if(bjPhase!=='play')return;
  while(handVal(bjDealer)<17)bjDealer.push(bjDeck.pop());
  bjSettle(false);
});
function bjSettle(natural){
  bjPhase='idle';
  bjButtons(true,false,false);
  renderBJ(false);
  const pv=handVal(bjPlayer),dv=handVal(bjDealer);
  const msg=$('#bjMsg');
  if(pv>21){
    msg.textContent='💥 Bust! You lost '+fmt(bjBet)+' CR';
    msg.className='result lose';
    sndLose();
  }else if(natural&&!(dv===21&&bjDealer.length===2)){
    const win=Math.floor(bjBet*2.5);
    giveWin(win,'Blackjack natural');
    msg.textContent='🃏 BLACKJACK! You won '+fmt(win)+' CR';
    msg.className='result win';
    sndWin();
    toast('+'+fmt(win)+' CR 💰','win');
  }else if(dv>21||pv>dv){
    const win=bjBet*2;
    giveWin(win,'Blackjack win');
    msg.textContent='🎉 You won '+fmt(win)+' CR! ('+pv+' vs '+dv+')';
    msg.className='result win';
    sndWin();
    toast('+'+fmt(win)+' CR 💰','win');
  }else if(pv===dv){
    addBalance(bjBet);
    msg.textContent='🤝 Push — stake returned';
    msg.className='result';
    beep(500,.1);
  }else{
    msg.textContent='😔 Dealer wins '+dv+' vs '+pv;
    msg.className='result lose';
    sndLose();
  }
}

let crashState='idle',crashPoint=0,crashStart=0,crashRAF=0,crashBet=0,crashCashed=false,pendingCrashNonce=0;
const crashHistory=[];
function renderCrashHistory(){
  $('#crashHistory').innerHTML=crashHistory.slice(0,12)
    .map(v=>{
      const cls=parseFloat(v)>=2?'green':(parseFloat(v)>=1.5?'red':'black');
      return `<span class="hist ${cls}">${v}x</span>`;
    }).join('');
}
$('#crashStart').addEventListener('click',async()=>{
  if(crashState!=='idle')return;
  const bet=getBet('#crashBet');
  if(bet===null)return;
  crashBet=bet;
  crashCashed=false;
  const{float:f}=await hmacFloat(serverSeed,state.clientSeed,state.nonce);
  pendingCrashNonce=state.nonce;
  state.nonce++;
  saveState();
  crashPoint=Math.max(1.01,Math.min(150,Math.floor((crashBase()/(1-f))*100)/100));
  crashState='flying';
  $('#crashStart').disabled=true;
  $('#crashCashout').disabled=false;
  $('#crashMsg').textContent='';
  $('#crashMsg').className='result';
  $('#crashStage').classList.remove('crashed','cashed');
  $('#crashStage').classList.add('flying');
  $('#rocket').style.left='2%';
  $('#rocket').style.bottom='6%';
  if(!takeBet(bet,'Crash launch')){crashState='idle';$('#crashStart').disabled=true;return}
  sndClick();
  crashStart=performance.now();
  crashRAF=requestAnimationFrame(crashLoop);
});
function crashLoop(now){
  const t=(now-crashStart)/1000;
  const m=Math.exp(0.13*t);
  if(m>=crashPoint){crashEnd();return}
  $('#crashMult').textContent=m.toFixed(2)+'x';
  const p=Math.min(1,Math.log(m)/Math.log(30));
  $('#rocket').style.left=(2+p*78)+'%';
  $('#rocket').style.bottom=(6+p*p*70)+'%';
  crashRAF=requestAnimationFrame(crashLoop);
}
$('#crashCashout').addEventListener('click',()=>{
  if(crashState!=='flying'||crashCashed)return;
  crashCashed=true;
  cancelAnimationFrame(crashRAF);
  const m=Math.exp(0.13*(performance.now()-crashStart)/1000);
  state.stats.crashBest=Math.max(state.stats.crashBest||0,+m.toFixed(2));
  renderMissions();
  const win=Math.floor(crashBet*m);
  giveWin(win,'Crash cashout '+m.toFixed(2)+'x');
  crashState='idle';
  $('#crashCashout').disabled=true;
  $('#crashStart').disabled=false;
  $('#crashStage').classList.remove('flying');
  $('#crashStage').classList.add('cashed');
  $('#crashMult').textContent=m.toFixed(2)+'x';
  $('#crashMsg').textContent='✅ Cashed out at '+m.toFixed(2)+'x — won '+fmt(win)+' CR';
  $('#crashMsg').className='result win';
  sndWin();
  toast('+'+fmt(win)+' CR 💰','win');
});
function crashEnd(){
  cancelAnimationFrame(crashRAF);
  crashHistory.unshift(crashPoint.toFixed(2));
  renderCrashHistory();
  pushFair('Crash',crashPoint.toFixed(2)+'x',pendingCrashNonce);
  $('#crashMult').textContent=crashPoint.toFixed(2)+'x';
  const stage=$('#crashStage');
  stage.classList.remove('flying');
  stage.classList.add('crashed');
  const rl=$('#rocket');const rx=rl.style.left;const ry=rl.style.bottom;
  for(let i=0;i<12;i++){const p=document.createElement('div');p.className='crash-particle';p.style.left=rx;p.style.bottom=ry;p.style.setProperty('--dx',(Math.random()-.5)*80+'px');p.style.setProperty('--dy',(Math.random()-.5)*80+'px');p.style.background=['#f39c12','#e74c3c','#ff4500','#f1c40f'][i%4];stage.appendChild(p);setTimeout(()=>p.remove(),600)}
  $('#crashCashout').disabled=true;
  $('#crashStart').disabled=false;
  crashState='idle';
  if(!crashCashed){
    $('#crashMsg').textContent='💥 Crashed at '+crashPoint.toFixed(2)+'x — you lost';
    $('#crashMsg').className='result lose';
    sndLose();
  }
}

let diceMode='under';
$$('#cgame-dice .dm-btn').forEach(b=>b.addEventListener('click',()=>{
  diceMode=b.dataset.mode;
  $$('#cgame-dice .dm-btn').forEach(x=>x.classList.toggle('active',x===b));
  updateDiceInfo();
  sndClick();
}));
$('#diceTarget').addEventListener('input',updateDiceInfo);
function updateDiceInfo(){
  const t=+$('#diceTarget').value;
  const chance=diceMode==='under'?t:100-t;
  $('#diceChance').textContent=chance+'%';
  $('#diceMult').textContent=(99/chance).toFixed(2)+'x';
}
$('#dicePlay').addEventListener('click',async()=>{
  const bet=getBet('#diceBet');
  if(bet===null)return;
  const t=+$('#diceTarget').value;
  const chance=diceMode==='under'?t:100-t;
  const mult=Math.max(1.01,(99-CFG.edge.dice)/chance);
  const{float:f}=await hmacFloat(serverSeed,state.clientSeed,state.nonce);
  const nonceUsed=state.nonce;
  state.nonce++;
  saveState();
  const roll=+(f*100).toFixed(2);
  const win=diceMode==='under'?roll<t:roll>t;
  if(!takeBet(bet,'Dice '+diceMode+' '+t))return;
  beep(win?800:300,.15,win?'sine':'sawtooth',.05);
  pushFair('Dice',roll.toFixed(2),nonceUsed);
  const rollEl=$('#diceRoll');
  rollEl.textContent=roll.toFixed(2);
  rollEl.className='dice-roll '+(win?'win':'lose');
  const res=$('#diceResult');
  if(win){
    const ret=Math.floor(bet*mult);
    giveWin(ret,'Dice win '+mult.toFixed(2)+'x');
    res.textContent='🎉 Rolled '+roll.toFixed(2)+' — you won '+fmt(ret)+' CR ('+mult.toFixed(2)+'x)! 🔒';
    res.className='result win';
    toast('+'+fmt(ret)+' CR 💰','win');
  }else{
    res.textContent='😔 Rolled '+roll.toFixed(2)+' — you lost 🔒 verifiable in Provably Fair';
    res.className='result lose';
    sndLose();
  }
});

const FIXTURES=[
  {league:'Premier League',home:'Liverpool',away:'Man City',base:[2.45,3.60,2.60]},
  {league:'La Liga',home:'Real Madrid',away:'Barcelona',base:[2.30,3.50,2.85]},
  {league:'Serie A',home:'Inter',away:'AC Milan',base:[2.20,3.25,3.30]},
  {league:'Bundesliga',home:'Bayern Munich',away:'Dortmund',base:[1.85,3.90,3.80]},
  {league:'Ligue 1',home:'PSG',away:'Marseille',base:[1.55,4.10,5.40]},
  {league:'Premier League',home:'Man United',away:'Arsenal',base:[2.70,3.45,2.55]},
  {league:'UCL',home:'Juventus',away:'Chelsea',base:[2.60,3.30,2.70]},
  {league:'Saudi League',home:'Al Hilal',away:'Al Nassr',base:[2.35,3.40,2.95]},
];
const PICK_LABELS=['1','X','2'];
let matches=[],activeBets=[],slip=null;
function newMatch(f,id){
  return{id,league:f.league,home:f.home,away:f.away,
    odds:f.base.map(o=>+Math.max(1.10,o*(0.95+Math.random()*0.1)).toFixed(2)),
    base:f.base,
    resolveAt:Date.now()+(45+Math.random()*120)*1000,
    status:'upcoming'};
}
function initMatches(){
  matches=FIXTURES.map((f,i)=>newMatch(f,i));
  renderMatches();
}
function oddHTML(m,i){
  const sel=slip&&slip.mid===m.id&&slip.pick===i;
  return `<button class="odd${sel?' selected':''}" data-mid="${m.id}" data-pick="${i}"><small>${PICK_LABELS[i]}</small>${m.odds[i].toFixed(2)}</button>`;
}
function renderMatches(){
  $('#matchList').innerHTML=matches.map(m=>{
    if(m.status==='done'){
      return `<div class="match done">
        <div class="m-league">${m.league}</div>
        <div class="m-main">
          <div class="m-teams">${m.home} vs ${m.away}</div>
          <div class="m-result">FT · Winner: ${m.winner===0?m.home:m.winner===1?'Draw':m.away}</div>
        </div></div>`;
    }
    return `<div class="match">
      <div class="m-league">${m.league}</div>
      <div class="m-main">
        <div class="m-teams">${m.home} vs ${m.away}</div>
        <div class="m-time" data-time="${m.id}"></div>
      </div>
      <div class="m-odds">${m.odds.map((o,i)=>oddHTML(m,i)).join('')}</div>
    </div>`;
  }).join('');
  $$('#matchList .odd').forEach(b=>b.addEventListener('click',onOddClick));
  updateTimes();
}
function onOddClick(e){
  const mid=+e.currentTarget.dataset.mid;
  const pick=+e.currentTarget.dataset.pick;
  const m=matches[mid];
  if(m.status==='done')return;
  slip={mid,pick,odds:m.odds[pick],name:`${m.home} vs ${m.away}`};
  renderMatches();
  renderSlip();
  sndClick();
}
function renderSlip(){
  if(!slip){$('#betSlip').classList.add('hidden');return}
  $('#betSlip').classList.remove('hidden');
  $('#slipMatch').textContent=slip.name;
  $('#slipPick').textContent=PICK_LABELS[slip.pick];
  $('#slipOdds').textContent='@ '+slip.odds.toFixed(2);
}
$('#slipCancel').addEventListener('click',()=>{slip=null;renderSlip();renderMatches()});
$('#slipPlace').addEventListener('click',()=>{
  if(!slip)return;
  const stake=Math.floor(+$('#slipStake').value);
  if(!Number.isFinite(stake)||stake<10){toast('Minimum stake is 10 CR','err');return}
  if(stake>state.balance){toast('Insufficient balance!','err');return}
  if(!takeBet(stake,slip.name+' '+PICK_LABELS[slip.pick]))return;
  activeBets.push(Object.assign({},slip,{stake}));
  toast('Bet placed! ⚽','win');
  sndClick();
  slip=null;
  renderSlip();
  renderMatches();
  renderMyBets();
});
function renderMyBets(){
  $('#myBets').innerHTML=activeBets.map(b=>
    `<div class="bet-chip">⚽ ${b.name} <b>${PICK_LABELS[b.pick]}</b> ${fmt(b.stake)} → ${fmt(b.stake*b.odds)}</div>`
  ).join('');
}
function updateTimes(){
  matches.forEach(m=>{
    const el=document.querySelector(`[data-time="${m.id}"]`);
    if(!el)return;
    const left=m.resolveAt-Date.now();
    if(left<=15000){el.textContent='🔴 LIVE';el.classList.add('live')}
    else{
      const s=Math.ceil(left/1000);
      el.textContent='Kick-off in '+Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
      el.classList.remove('live');
    }
  });
}
function updateOddCells(){
  matches.forEach(m=>{
    if(m.status==='done')return;
    m.odds.forEach((o,i)=>{
      const cell=document.querySelector(`#matchList .odd[data-mid="${m.id}"][data-pick="${i}"]`);
      if(cell)cell.innerHTML=`<small>${PICK_LABELS[i]}</small>${o.toFixed(2)}`;
    });
  });
  if(slip){
    const m=matches[slip.mid];
    if(m&&m.status!=='done'){
      slip.odds=m.odds[slip.pick];
      renderSlip();
    }
  }
}
function driftOdds(){
  let changed=false;
  matches.forEach(m=>{
    if(m.status==='done')return;
    m.odds=m.odds.map((o,i)=>{
      const target=m.base[i];
      const nv=+Math.max(1.10,Math.min(target*1.35,o+(Math.random()-0.5)*0.22)).toFixed(2);
      if(nv!==o)changed=true;
      return nv;
    });
  });
  if(changed)updateOddCells();
}
function resolveMatch(m){
  m.status='done';
  const probs=m.odds.map(o=>1/o);
  const sum=probs.reduce((a,b)=>a+b,0);
  let r=Math.random()*sum,winner=0;
  for(let i=0;i<3;i++){r-=probs[i];if(r<=0){winner=i;break}}
  m.winner=winner;
  activeBets.filter(b=>b.mid===m.id).forEach(b=>{
    if(b.pick===winner){
      const ret=Math.floor(b.stake*b.odds);
      giveWin(ret,'Sports '+b.name+' '+PICK_LABELS[b.pick]);
      toast('You won '+fmt(ret)+' CR! 🏆','win');
      sndWin();
    }else{
      toast('Lost '+fmt(b.stake)+' CR 😔','err');
      sndLose();
    }
  });
  activeBets=activeBets.filter(b=>b.mid!==m.id);
  if(slip&&slip.mid===m.id){slip=null;renderSlip()}
  renderMyBets();
  setTimeout(()=>{
    matches[m.id]=newMatch(FIXTURES[m.id],m.id);
    renderMatches();
  },8000);
}
setInterval(()=>{
  let resolved=false;
  matches.forEach(m=>{
    if(m.status!=='done'&&m.resolveAt-Date.now()<=0){resolveMatch(m);resolved=true}
  });
  if(resolved)renderMatches();
  else updateTimes();
  if(Math.random()<0.04)driftOdds();
},1000);

const VIP=[['Bronze',0,'#cd7f32'],['Silver',5000,'#c0c0c0'],['Gold',25000,'#ffd700'],['Platinum',100000,'#e5e4e2'],['Diamond',500000,'#7ef9ff']];
function renderAccount(){
  $('#avatarBig').textContent=(state.name[0]||'P').toUpperCase();
  $('#nameInput').value=state.name;
  let cur=VIP[0],next=VIP[1];
  for(let i=0;i<VIP.length;i++){
    if(state.wagered>=VIP[i][1]){cur=VIP[i];next=VIP[i+1]||null}
  }
  $('#vipName').textContent=cur[0];
  $('#vipName').style.color=cur[2];
  $('#vipNext').textContent=next?(fmt(next[1]-state.wagered)+' CR to '+next[0]):'Max level reached!';
  $('#vipFill').style.width=next?Math.min(100,((state.wagered-cur[1])/(next[1]-cur[1]))*100)+'%':'100%';
  $('#vipWagered').textContent=fmt(state.wagered);
  $('#stBets').textContent=fmt(state.betsCount);
  $('#stWins').textContent=fmt(state.winsCount);
  $('#stBest').textContent='$'+fmt(state.bestWin);
  $('#stDep').textContent='$'+fmt(state.deposited);
  $('#rgLimit').value=state.dayLimit||0;
  const net=-todayNet();
  $('#rgNet').textContent=fmt(net);
  $('#rgNet').style.color=net>0?'#ff6b5e':'#2fd06d';
  const META={deposit:'📥 Deposit',bonus:'🎁 Bonus',win:'🏆 Win',bet:'🎲 Bet'};
  $('#txBody').innerHTML=state.tx.length?state.tx.map(t=>{
    const d=new Date(t.t);
    const pos=t.amount>=0;
    return `<tr>
      <td>${d.toLocaleDateString()} ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
      <td>${META[t.type]||t.type}</td>
      <td class="${pos?'tx-amt-pos':'tx-amt-neg'}">${pos?'+':''}${fmt(t.amount)} CR</td>
      <td class="muted">${t.details||''}</td>
    </tr>`;
  }).join(''):'<tr><td colspan="4" class="center muted">No transactions yet</td></tr>';
}
$('#saveName').addEventListener('click',()=>{
  const v=$('#nameInput').value.trim();
  if(v.length<2){toast('Name must be at least 2 characters','err');return}
  state.name=v.slice(0,16);
  saveState();
  renderTop();
  renderAccount();
  toast('Saved ✅');
});
$('#resetAcc').addEventListener('click',()=>{
  if(confirm('Reset account? All progress and balance will be lost.')){
    localStorage.removeItem('elitebet_state');
    location.reload();
  }
});

function newServerSeed(){
  const arr=new Uint8Array(16);
  if(window.crypto&&crypto.getRandomValues)crypto.getRandomValues(arr);
  else for(let i=0;i<16;i++)arr[i]=Math.floor(Math.random()*256);
  return[...arr].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function sha256hex(str){
  if(!(window.crypto&&crypto.subtle))return 'unavailable (insecure context)';
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function hmacFloat(serverSeed,clientSeed,nonce){
  if(!(window.crypto&&crypto.subtle))return{float:Math.random(),hash:'unavailable'};
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(serverSeed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(clientSeed+':'+nonce));
  const hex=[...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return{float:parseInt(hex.slice(0,8),16)/4294967296,hash:hex};
}
let serverSeed=newServerSeed();
let serverHash='';
function pushFair(game,result,nonceUsed){
  state.fair.unshift({g:game,r:result,n:nonceUsed,s:serverSeed,c:state.clientSeed});
  if(state.fair.length>20)state.fair.length=20;
  saveState();
}
async function initFair(){
  serverHash=await sha256hex(serverSeed);
  renderFairPanel();
}
function shortSeed(s){return s?s.slice(0,10)+'…'+s.slice(-6):'-'}
function renderFairPanel(){
  $('#fairHash').textContent=serverHash;
  $('#fairClient').value=state.clientSeed;
  $('#fairNonce').textContent=state.nonce;
  $('#fairTable').innerHTML=state.fair.length?state.fair.map(f=>
    `<tr><td>${f.g}</td><td>${f.r}</td><td>${f.n}</td><td title="client: ${f.c}">${shortSeed(f.s)}</td></tr>`
  ).join(''):'<tr><td colspan="4" class="center muted">Play Dice or Crash to generate verifiable rounds</td></tr>';
}
$('#fairSaveClient').addEventListener('click',()=>{
  const v=$('#fairClient').value.trim()||'my-seed';
  state.clientSeed=v.slice(0,32);
  state.nonce=0;
  saveState();
  renderFairPanel();
  toast('Client seed saved — nonce reset ✅');
});
$('#vRun').addEventListener('click',async()=>{
  const s=$('#vServer').value.trim(),c=$('#vClient').value.trim(),n=Math.floor(+$('#vNonce').value);
  if(!s||!c||!Number.isFinite(n)){toast('Fill all three fields','err');return}
  const{float:f}=await hmacFloat(s,c,n);
  const dice=(f*100).toFixed(2);
  const crash=Math.max(1.01,Math.min(150,Math.floor((crashBase()/(1-f))*100)/100)).toFixed(2);
  $('#vResult').textContent=`✅ HMAC float ${f.toFixed(8)} → Dice roll ${dice} · Crash point ${crash}x`;
  $('#vResult').className='result win';
});
$('#fairClose').addEventListener('click',()=>$('#fairModal').classList.add('hidden'));
$('#fairModal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.classList.add('hidden')});
$('#fairLink').addEventListener('click',()=>{renderFairPanel();$('#fairModal').classList.remove('hidden');sndClick()});

const LEGAL={
  terms:{t:'Terms & Conditions',h:`<h4>1. Demo Platform</h4><p>ELITE BET is a demonstration platform. All balances are virtual credits ("CR") with no monetary value. The platform cannot accept or pay out real money.</p><h4>2. Eligibility</h4><p>The platform is intended for users aged 18 and over. Access is void where real-money gaming is prohibited by local law.</p><h4>3. Fair Play</h4><p>Game outcomes are produced by the Provably Fair scheme described in the Fairness section. Any attempt to manipulate the client may result in account reset.</p><h4>4. Changes</h4><p>These terms may be updated at any time; continued use constitutes acceptance.</p>`},
  privacy:{t:'Privacy Policy',h:`<h4>Data we store</h4><p>All data (balance, name, transaction history, seeds) is stored <b>locally in your browser</b> via localStorage. Nothing leaves your device.</p><h4>No third-party tracking</h4><p>The demo build contains no analytics, ads or trackers.</p><h4>Your control</h4><p>You can erase all data instantly via Account → Reset Account, or by clearing site data in your browser.</p>`},
  rg:{t:'Responsible Gaming',h:`<h4>Play responsibly</h4><p>Gaming can be addictive. Treat this platform as entertainment, never as income.</p><h4>Tools available</h4><ul><li>Daily loss limit — pauses betting when reached</li><li>24h self-exclusion break — one click from your Account page</li><li>Session timer — always visible in Account</li></ul><h4>Get help</h4><p>If gaming stops being fun, contact a local support organisation. Real-money help lines exist in most countries (e.g. BeGambleAware, GamCare).</p>`},
  faq:{t:'FAQ',h:`<h4>Is this real money?</h4><p>No. Everything runs on virtual credits in Demo Mode.</p><h4>Are games rigged?</h4><p>No — Dice and Crash rounds are Provably Fair and independently verifiable via HMAC-SHA256.</p><h4>How do deposits work?</h4><p>In Demo Mode they credit virtual coins instantly. With a licensed payment provider configured on the server, the same flow routes through it.</p><h4>How do I reset my progress?</h4><p>Account → Reset Account wipes all local data.</p>`}
};
$$('.flink[data-legal]').forEach(b=>b.addEventListener('click',()=>{
  const l=LEGAL[b.dataset.legal];
  $('#legalTitle').textContent=l.t;
  $('#legalBody').innerHTML=l.h;
  $('#legalModal').classList.remove('hidden');
  sndClick();
}));
$('#legalClose').addEventListener('click',()=>$('#legalModal').classList.add('hidden'));
$('#legalModal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.classList.add('hidden')});

const BOT_REPLIES=[
  [/deposit|payment|pay|buy/i,'Deposits are instant in Demo Mode — any method in the Deposit window credits virtual CR. A licensed PSP connects through /api/deposit when configured.'],
  [/withdraw|cash ?out|payout/i,'Withdrawals are disabled in Demo Mode because credits have no monetary value.'],
  [/fair|rng|rigged|honest/i,'Every Dice & Crash round is Provably Fair: result = HMAC-SHA256(server seed, client seed:nonce). Open 🔒 Provably Fair in the footer to verify any round yourself.'],
  [/bonus|promo|free/i,'Your first deposit gets +100% up to 5,000 CR automatically. VIP levels unlock as you wager more.'],
  [/kyc|verif|document/i,'Account verification is simulated in Demo Mode — no documents needed.'],
  [/hello|hi\b|hey|salam|سلام/i,'Hey! 👋 How can I help you today? Ask about deposits, fairness or bonuses.'],
  [/limit|addict|break|stop/i,'You can set a daily loss limit or take a 24h break from Account → Responsible Gaming. Stay safe! 🧘']
];
const BOT_FALLBACK=[
  'A human agent will reply shortly. Ticket #EB-{n}',
  'Thanks for reaching out! You can also email support@elitebet.example 📧',
  'Our team is online 24/7 — average reply time under 2 minutes.'
];
let botFbIdx=0,chatGreeted=false;
function chatMsg(text,who){
  const d=document.createElement('div');
  d.className='cm cm-'+who;
  d.textContent=text;
  $('#chatBody').appendChild(d);
  $('#chatBody').scrollTop=$('#chatBody').scrollHeight;
}
$('#chatFab').addEventListener('click',()=>{
  $('#chatPanel').classList.toggle('hidden');
  if(!chatGreeted){
    chatGreeted=true;
    setTimeout(()=>chatMsg('Welcome to ELITE BET Support! 🎧 How can we help?','bot'),300);
  }
  sndClick();
});
$('#chatClose').addEventListener('click',()=>$('#chatPanel').classList.add('hidden'));
function sendChat(){
  const v=$('#chatText').value.trim();
  if(!v)return;
  chatMsg(v,'user');
  $('#chatText').value='';
  const hit=BOT_REPLIES.find(([re])=>re.test(v));
  setTimeout(()=>{
    chatMsg(hit?hit[1]:BOT_FALLBACK[botFbIdx++%BOT_FALLBACK.length].replace('{n}',Math.floor(1000+Math.random()*9000)),'bot');
  },600+Math.random()*600);
}
$('#chatSend').addEventListener('click',sendChat);
$('#chatText').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat()});

$('#rgSave').addEventListener('click',()=>{
  const v=Math.max(0,Math.floor(+$('#rgLimit').value||0));
  state.dayLimit=v;
  saveState();
  toast(v?('Daily limit set: '+fmt(v)+' CR 🛡️'):'Daily limit disabled');
});
$('#rgBreak').addEventListener('click',()=>{
  if(confirm('Pause all betting for 24 hours?')){
    state.excludeUntil=Date.now()+24*60*60*1000;
    saveState();
    toast('24h break started. Take care! 🧘');
    slip=null;renderSlip();
  }
});
setInterval(()=>{
  const el=$('#rgSession');
  if(el&&$('#page-account').classList.contains('active')){
    const mins=Math.floor((performance.now()-pageStart)/60000);
    el.textContent=mins+'m';
    const net=-todayNet();
    $('#rgNet').textContent=fmt(net);
  }
},15000);

const GLYPH={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const PV={p:100,n:320,b:330,r:500,q:900,k:0};
let cgame=null,chessSel=null,lastMove=null,chessActive=false,botThinking=false,chessStake=0;
const CHESS_MULT={easy:2,medium:3,hard:10,impossible:100};
let chessLevelUsed='medium';
const boardEl=$('#chessBoard');
(function buildChessBoard(){
  for(let r=8;r>=1;r--){
    for(let f=0;f<8;f++){
      const sq=String.fromCharCode(97+f)+r;
      const d=document.createElement('div');
      d.className='csq '+(((r+f)%2===0)?'light':'dark');
      d.dataset.sq=sq;
      d.addEventListener('click',()=>onSquare(sq));
      boardEl.appendChild(d);
    }
  }
})();
function setStatus(t){$('#chessStatus').textContent=t}
function renderChessMoves(){
  const h=cgame?cgame.history():[];
  let html='';
  for(let i=0;i<h.length;i+=2){
    html+='<div>'+(i/2+1)+'. '+h[i]+(h[i+1]?' '+h[i+1]:'')+'</div>';
  }
  $('#chessMoves').innerHTML=html||'<span class="muted">No moves yet</span>';
  $('#chessMoves').scrollTop=$('#chessMoves').scrollHeight;
}
function findKingSq(color){
  let found=null;
  cgame.board().forEach((row,ri)=>row.forEach((sq,fi)=>{
    if(sq&&sq.type==='k'&&sq.color===color)found=String.fromCharCode(97+fi)+(8-ri);
  }));
  return found;
}
function renderChess(){
  const pos={};
  if(cgame)cgame.board().forEach((row,ri)=>row.forEach((sq,fi)=>{
    if(sq)pos[String.fromCharCode(97+fi)+(8-ri)]=sq;
  }));
  [...boardEl.children].forEach(el=>{
    const sq=el.dataset.sq;
    el.innerHTML='';
    el.classList.remove('sel','cap','dot','last','checksq');
    if(lastMove&&(sq===lastMove.from||sq===lastMove.to))el.classList.add('last');
    const p=pos[sq];
    if(p){
      const s=document.createElement('span');
      s.className='pc '+p.color;
      s.textContent=GLYPH[p.type];
      el.appendChild(s);
    }
  });
  if(cgame&&chessSel){
    const el=boardEl.querySelector(`[data-sq="${chessSel}"]`);
    if(el)el.classList.add('sel');
  }
  if(cgame&&cgame.in_check()){
    const k=findKingSq(cgame.turn());
    const el=k?boardEl.querySelector(`[data-sq="${k}"]`):null;
    if(el)el.classList.add('checksq');
  }
}
function clearChessSel(){chessSel=null;renderChess()}
function onSquare(sq){
  if(pendingPromo)return;
  if(!chessActive||botThinking||!cgame||cgame.turn()!=='w'||cgame.game_over())return;
  const dests=chessSel?cgame.moves({square:chessSel,verbose:true}):[];
  const mv=dests.find(m=>m.to===sq);
  if(mv){doPlayerMove(mv);return}
  clearChessSel();
  const movesHere=cgame.moves({square:sq,verbose:true});
  if(movesHere.length){
    chessSel=sq;
    renderChess();
    movesHere.forEach(m=>{
      const el=boardEl.querySelector(`[data-sq="${m.to}"]`);
      if(el)el.classList.add(m.captured?'cap':'dot');
    });
    beep(650,.04,'square',.03);
  }
}
function applyMove(mv){
  const move=cgame.move({from:mv.from,to:mv.to,promotion:mv.promotion||'q'});
  lastMove={from:move.from,to:move.to};
  chessSel=null;
  beep(move.captured?300:520,.06,move.captured?'sawtooth':'square',.04);
  renderChess();
  renderChessMoves();
  return move;
}
let pendingPromo=null;
function doPlayerMove(mv){
  if(mv.piece==='p'&&mv.to[1]==='8'){
    pendingPromo={from:mv.from,to:mv.to};
    clearChessSel();
    $('#promoModal').classList.remove('hidden');
    return;
  }
  applyMove(mv);
  if(checkChessEnd())return;
  botTurn();
}
$$('#promoModal .promo-btn').forEach(b=>b.addEventListener('click',()=>{
  if(!pendingPromo)return;
  const p=b.dataset.p;
  const tgt=pendingPromo;
  pendingPromo=null;
  $('#promoModal').classList.add('hidden');
  beep(880,.08,'sine',.05);
  applyMove({from:tgt.from,to:tgt.to,promotion:p});
  if(checkChessEnd())return;
  botTurn();
}));
$('#promoModal').addEventListener('click',e=>{
  if(e.target===e.currentTarget){
    e.currentTarget.classList.add('hidden');
    pendingPromo=null;
  }
});
const PST={
 p:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
 n:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
 b:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
 r:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
 q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
 k:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]
};
function evaluate(){
  let s=0,bw=0,bb=0;
  cgame.board().forEach((row,ri)=>row.forEach((sq,fi)=>{
    if(!sq)return;
    const idx=sq.color==='w'?ri*8+fi:(7-ri)*8+fi;
    const v=PV[sq.type]+PST[sq.type][idx];
    if(sq.type==='b'){if(sq.color==='w')bw++;else bb++}
    s+=sq.color==='w'?v:-v;
  }));
  if(bw>=2)s+=30;
  if(bb>=2)s-=30;
  return s;
}
function capScore(m){
  return (m.captured?PV[m.captured]*10-PV[m.piece]:0)+(m.promotion?800:0);
}
function quiesce(alpha,beta){
  const stand=(cgame.turn()==='w'?1:-1)*evaluate();
  if(stand>=beta)return beta;
  if(stand>alpha)alpha=stand;
  const caps=cgame.moves({verbose:true}).filter(m=>m.captured||m.promotion);
  caps.sort((a,b)=>capScore(b)-capScore(a));
  for(const m of caps){
    cgame.move({from:m.from,to:m.to,promotion:m.promotion||'q'});
    const v=-quiesce(-beta,-alpha);
    cgame.undo();
    if(v>=beta)return beta;
    if(v>alpha)alpha=v;
  }
  return alpha;
}
function negamax(depth,alpha,beta){
  if(cgame.in_checkmate())return -(100000+depth);
  if(cgame.in_stalemate()||cgame.in_draw())return 0;
  if(depth===0)return quiesce(alpha,beta);
  let maxV=-Infinity;
  const moves=cgame.moves({verbose:true});
  moves.sort((a,b)=>capScore(b)-capScore(a));
  for(const m of moves){
    cgame.move({from:m.from,to:m.to,promotion:m.promotion||'q'});
    const v=-negamax(depth-1,-beta,-alpha);
    cgame.undo();
    if(v>maxV)maxV=v;
    if(v>alpha)alpha=v;
    if(alpha>=beta)break;
  }
  return maxV;
}
function searchRoot(depth){
  let best=null,bestV=-Infinity,alpha=-Infinity;
  const moves=cgame.moves({verbose:true});
  moves.sort((a,b)=>capScore(b)-capScore(a));
  for(const m of moves){
    cgame.move({from:m.from,to:m.to,promotion:m.promotion||'q'});
    const v=-negamax(depth-1,-Infinity,-alpha);
    cgame.undo();
    if(v>bestV){bestV=v;best=m}
    if(v>alpha)alpha=v;
  }
  return best;
}
function easyMove(){
  const moves=cgame.moves({verbose:true});
  if(Math.random()<0.5)return moves[Math.floor(Math.random()*moves.length)];
  let best=null,bestV=-Infinity;
  for(const m of moves){
    cgame.move({from:m.from,to:m.to,promotion:m.promotion||'q'});
    const v=(cgame.turn()==='w'?1:-1)*evaluate();
    cgame.undo();
    if(v>bestV){bestV=v;best=m}
  }
  return best;
}
function botTurn(){
  botThinking=true;
  setStatus('🤖 Bot is thinking DEEPLY (up to ~30s)...');
  setTimeout(()=>{
    if(!chessActive||!cgame){botThinking=false;return}
    const mv=searchRoot(4);
    if(mv)applyMove(mv);
    botThinking=false;
    if(checkChessEnd())return;
    setStatus('Your move'+(cgame.in_check()?' — CHECK! ⚠️':''));
  },350);
}
function checkChessEnd(){
  if(!cgame.game_over())return false;
  chessActive=false;
  $('#chessResign').classList.add('hidden');
  $('#chessStart').classList.remove('hidden');
  const st=$('#chessStatus');
  if(cgame.in_checkmate()){
    if(cgame.turn()==='b'){
      const m=CHESS_MULT[chessLevelUsed]||2;
      const win=chessStake*m;
      giveWin(win,'Chess victory vs bot ('+chessLevelUsed+' x'+m+')');
      state.stats.chessBest='won';
      renderMissions();
      st.textContent='🏆 CHECKMATE — you won '+fmt(win)+' CR! (x'+m+' '+chessLevelUsed+')';
      st.className='result win';
      toast('+'+fmt(win)+' CR 💰','win');
      sndWin();
    }else{
      st.textContent='💀 Checkmate — the bot wins. Stake lost.';
      st.className='result lose';
      sndLose();
    }
  }else{
    addBalance(chessStake);
    st.textContent='🤝 Draw ('+(cgame.in_stalemate()?'stalemate':cgame.in_threefold_repetition()?'repetition':'insufficient material')+') — stake refunded';
    st.className='result';
    toast('Stake refunded 🤝');
    beep(500,.12);
  }
  return true;
}
$('#chessStart').addEventListener('click',()=>{
  if(chessActive)return;
  if(typeof Chess==='undefined'){toast('Chess engine failed to load — check your internet connection and refresh','err');return}
  const bet=getBet('#chessStake');
  if(bet===null)return;
  chessStake=bet;
  chessLevelUsed=$('#chessLevel').value;
  if(!takeBet(bet,'Chess match vs bot ('+chessLevelUsed+')'))return;
  cgame=new Chess();
  chessSel=null;lastMove=null;chessActive=true;botThinking=false;
  $('#chessStart').classList.add('hidden');
  $('#chessResign').classList.remove('hidden');
  setStatus('Your move — you play White ♔');
  $('#chessStatus').className='result';
  renderChess();
  renderChessMoves();
  sndClick();
});
$('#chessResign').addEventListener('click',()=>{
  if(!chessActive)return;
  if(!confirm('Resign and forfeit your stake?'))return;
  chessActive=false;
  $('#chessResign').classList.add('hidden');
  $('#chessStart').classList.remove('hidden');
  setStatus('🏳️ You resigned — stake forfeited');
  $('#chessStatus').className='result lose';
  sndLose();
});
function updateChessPayout(){
  const m=CHESS_MULT[$('#chessLevel').value]||2;
  const stake=Math.max(0,Math.floor(+$('#chessStake').value||0));
  $('#chessPayout').textContent=fmt(stake*m);
  $('#chessMultV').textContent='x'+m;
}
$('#chessLevel').addEventListener('change',()=>{updateChessPayout();sndClick()});
$('#chessStake').addEventListener('input',updateChessPayout);
updateChessPayout();

let AUTH=null;
try{AUTH=JSON.parse(localStorage.getItem('elitebet_auth'))}catch(e){}
function saveAuth(){AUTH?localStorage.setItem('elitebet_auth',JSON.stringify(AUTH)):localStorage.removeItem('elitebet_auth')}
async function apiCall(path,body){
  try{
    const r=await fetch(API_BASE+path,{
      method:body?'POST':'GET',
      headers:Object.assign({'Content-Type':'application/json'},AUTH?{'x-token':AUTH.token}:{}),
      body:body?JSON.stringify(body):undefined
    });
    return await r.json().catch(()=>({ok:false}));
  }catch(e){return{ok:false,offline:true}}
}
let authMode='login';
function setAuthMode(m){
  authMode=m;
  $$('#authModal .atab').forEach(t=>t.classList.toggle('active',t.dataset.a===m));
  $('#authTitle').textContent=m==='login'?'Login to ELITE BET':'Create your account';
  $('#authGo').textContent=m==='login'?'LOGIN':'REGISTER';
  $('#authMsg').textContent='';
}
$$('.atab[data-a]').forEach(t=>t.addEventListener('click',()=>{setAuthMode(t.dataset.a);sndClick()}));
$('#authBtn').addEventListener('click',()=>{
  if(AUTH){toast('Logged in as '+AUTH.user.username+' — use Logout in Account tab');return}
  $('#authModal').classList.remove('hidden');
  setAuthMode('login');
  sndClick();
});
$('#authClose').addEventListener('click',()=>$('#authModal').classList.add('hidden'));
$('#authModal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.classList.add('hidden')});
$('#authGo').addEventListener('click',async()=>{
  const username=$('#auUser').value.trim();
  const password=$('#auPass').value;
  if(!username||!password){$('#authMsg').textContent='Fill both fields';return}
  await doAuth(username,password);
});
['auUser','auPass'].forEach(id=>$('#'+id).addEventListener('keydown',e=>{
  if(e.key==='Enter')$('#authGo').click();
}));
async function doAuth(username,password){
  $('#authGo').disabled=true;
  const d=await apiCall('/api/auth/'+authMode,{username,password});
  $('#authGo').disabled=false;
  if(!d.ok){$('#authMsg').textContent=d.error||'Failed';return}
  AUTH={token:d.token,user:d.user};
  saveAuth();
  state.name=d.user.username;
  if(Number.isFinite(d.user.balance))setBalance(d.user.balance);
  saveState();
  renderTop();
  renderAccount();
  $('#authModal').classList.add('hidden');
  $('#logoutBtn').classList.remove('hidden');
  $('#notifBtn').classList.remove('hidden');
  startSync();
  startNotifs();
  updWdState();
  toast(authMode==='register'?'Account created — ask admin to fund it 🎉':'Welcome back, '+d.user.username+'!','win');
  sndWin();
}
$('#logoutBtn').addEventListener('click',()=>{
  if(!confirm('Logout? Balance stays saved on the server.'))return;
  saveAuth();
  localStorage.removeItem('elitebet_auth');
  location.reload();
});
let syncTimer=null;
function startSync(){
  if(syncTimer)return;
  syncTimer=setInterval(async()=>{
    if(!AUTH)return;
    const d=await apiCall('/api/sync',{balance:state.balance,wagered:state.wagered});
    if(d&&!d.ok&&d.reason==='banned'){lockNow();return}
    if(d&&d.ok&&d.cfg){
      const next=JSON.stringify(d.cfg);
      if(next!==JSON.stringify(CFG)){CFG=d.cfg;toast('⚙️ Game odds updated by operator','info')}
    }
    if(d&&d.ok&&Number.isFinite(d.override)&&d.override!==state.balance){
      setBalance(d.override);
      toast('⚡ Admin updated your balance → '+fmt(d.override)+' CR','win');
      beep(900,.12,'sine',.05);
    }
    if(d&&d.ok&&d.user&&d.user.username!==AUTH.user.username){
      AUTH.user.username=d.user.username;
      renderTop();
    }
  },2500);
}
if(AUTH){
  (async()=>{
    const d=await apiCall('/api/me');
    if(d&&d.ok&&d.user){
      state.name=d.user.username;
      if(Number.isFinite(d.user.balance))setBalance(d.user.balance);
      $('#logoutBtn').classList.remove('hidden');
      $('#notifBtn').classList.remove('hidden');
      startSync();
      startNotifs();
      renderTop();
      updWdState();
    }else{
      if(d&&d.reason==='banned'){lockNow();return}
      AUTH=null;
      saveAuth();
    }
  })();
}

fillTicker();
renderWinners();
initMatches();
renderTop();
updateDiceInfo();
initFair();
loadCFG();

/* ===== Lock screen ===== */
function lockNow(){
  AUTH=null;
  saveAuth();
  localStorage.removeItem('elitebet_auth');
  $('#lockOverlay').classList.remove('hidden');
  if(syncTimer){clearInterval(syncTimer);syncTimer=null}
}

/* ===== Notifications ===== */
let notifTimer=null;
function escHtml(s){return String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c])}
function startNotifs(){
  if(notifTimer)return;
  notifTimer=setInterval(pollNotifs,15000);
  pollNotifs();
}
async function pollNotifs(){
  if(!AUTH)return;
  const d=await apiCall('/api/notifs');
  if(d&&d.ok){
    updNotifBadge(d.unread);
    renderNotifList(d.items);
  }
}
function updNotifBadge(n){
  const b=$('#notifBadge');
  b.textContent=n>99?'99+':n;
  b.classList.toggle('hidden',n<=0);
}
function renderNotifList(items){
  const el=$('#notifList');
  if(!items||!items.length){
    el.innerHTML='<div class="notif-empty">🔔 No notifications yet.<br>Bonuses & admin messages land here.</div>';
    return;
  }
  el.innerHTML=items.map(n=>{
    const ago=timeAgo(n.t);
    return '<div class="notif-item'+(n.read?'':' unread')+'">'+escHtml(n.txt)+'<span class="ntime">'+ago+'</span></div>';
  }).join('');
}
function timeAgo(t){
  const s=Math.floor((Date.now()-t)/1000);
  if(s<60)return'just now';
  if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';
  return new Date(t).toLocaleDateString();
}
$('#notifBtn').addEventListener('click',()=>{
  const p=$('#notifPanel');
  p.classList.toggle('hidden');
  if(!p.classList.contains('hidden')){
    pollNotifs().then(async()=>{
      await apiCall('/api/notifs/read',{});
      updNotifBadge(0);
      $$('#notifList .notif-item').forEach(i=>i.classList.remove('unread'));
    });
  }
});
$('#notifClose').addEventListener('click',()=>$('#notifPanel').classList.add('hidden'));
document.addEventListener('click',e=>{
  const p=$('#notifPanel');
  if(!p.classList.contains('hidden')&&!p.contains(e.target)&&e.target.id!=='notifBtn')
    p.classList.add('hidden');
});

/* ===== Daily Bonus Wheel ===== */
const WHEEL_PRIZES=[50,100,150,250,400,750,1500,5000];
const WHEEL_W=[22,20,18,15,12,8,4,1];
const WHEEL_COLORS=['#f0b90b','#c0392b','#2456a6','#1f8a4c','#7d3c98','#b9770e','#16a085','#8e44ad'];
let wheelRot=0,wheelSpinning=false,wheelCountdown=null;
(function buildWheel(){
  const segs=WHEEL_PRIZES.map((p,i)=>`${WHEEL_COLORS[i]} ${i*45}deg ${(i+1)*45}deg`).join(',');
  const w=$('#bigWheel');
  w.style.background='conic-gradient('+segs+')';
  WHEEL_PRIZES.forEach((p,i)=>{
    const lbl=document.createElement('div');
    lbl.textContent=p>=1000?'JACKPOT':p;
    lbl.style.cssText=`position:absolute;left:50%;top:50%;transform:rotate(${i*45+22.5}deg) translateY(-88px) translateX(-50%) rotate(-90deg);transform-origin:0 0;font-size:.62rem;font-weight:900;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8);white-space:nowrap`;
    w.appendChild(lbl);
  });
  const hub=document.createElement('div');
  hub.className='wheel-hub';
  hub.textContent='🎰';
  $('.wheel-stage').appendChild(hub);
  $('#wheelLegend').innerHTML=WHEEL_PRIZES.map((p,i)=>
    '<span class="wl-chip'+(p>=1000?' jack':'')+'" style="border-bottom:3px solid '+WHEEL_COLORS[i]+'">'+(p>=1000?'JACKPOT':p)+'</span>'
  ).join('');
})();
async function wheelAvail(){
  if(AUTH){
    const d=await apiCall('/api/daily',{check:true});
    return d&&d.ok?{avail:d.avail,next:d.next||0}:{avail:false,next:Date.now()+36e5};
  }
  const t=+(localStorage.getItem('elitebet_daily')||0);
  return{avail:!(t&&Date.now()-t<20*36e5),next:t?t+20*36e5:0};
}
function wheelCdTxt(next){
  const ms=Math.max(0,next-Date.now());
  const h=Math.floor(ms/36e5),m=Math.ceil(ms%36e5/6e4);
  return h>0?`Next spin in ${h}h ${m}m`:`Next spin in ${m}m`;
}
async function refreshWheelUI(){
  const btn=$('#spinWheel');
  const{avail,next}=await wheelAvail();
  clearInterval(wheelCountdown);
  if(avail&&!wheelSpinning){
    btn.disabled=false;
    btn.textContent='🎡 SPIN FREE!';
    $('#wheelMsg').textContent='You have a FREE SPIN waiting!';
    $('#wheelMsg').className='result win';
  }else{
    btn.disabled=true;
    const upd=()=>{btn.textContent=wheelSpinning?'SPINNING…':wheelCdTxt(next)};
    upd();
    wheelCountdown=setInterval(()=>{if(Date.now()>=next)refreshWheelUI();else upd()},30000);
  }
}
$('#dailyBtn').addEventListener('click',()=>{
  $('#wheelModal').classList.remove('hidden');
  refreshWheelUI();
});
$('#wheelClose').addEventListener('click',()=>{$('#wheelModal').classList.add('hidden');clearInterval(wheelCountdown)});
$('#wheelModal').addEventListener('click',e=>{if(e.target===e.currentTarget){e.currentTarget.classList.add('hidden');clearInterval(wheelCountdown)}});
$('#spinWheel').addEventListener('click',async()=>{
  if(wheelSpinning)return;
  wheelSpinning=true;
  const btn=$('#spinWheel');
  btn.disabled=true;
  btn.textContent='SPINNING…';
  let idx;
  if(AUTH){
    const d=await apiCall('/api/daily',{});
    if(!d.ok){
      wheelSpinning=false;
      toast(d.next?'Bonus already claimed today ⏳':'Failed to claim','err');
      refreshWheelUI();
      return;
    }
    idx=d.idx;
  }else{
    let r=Math.random()*WHEEL_W.reduce((a,b)=>a+b,0);idx=0;
    for(let i=0;i<WHEEL_W.length;i++){r-=WHEEL_W[i];if(r<=0){idx=i;break}}
    localStorage.setItem('elitebet_daily',String(Date.now()));
  }
  const c=idx*45+22.5;
  const delta=((((360-c)%360)-(wheelRot%360))%360+360)%360;
  wheelRot+=1440+delta;
  $('#bigWheel').style.transform='rotate('+wheelRot+'deg)';
  beep(400,.08,'square',.04);
  setTimeout(()=>{
    const prize=WHEEL_PRIZES[idx];
    addBalance(prize);
    $('#wheelMsg').textContent=(prize>=1000?'🎊 JACKPOT!! You won ':'🎉 You won ')+fmt(prize)+' CR!';
    $('#wheelMsg').className='result win';
    toast('🎁 Daily bonus: +'+fmt(prize)+' CR','win');
    sndWin();
    wheelSpinning=false;
    refreshWheelUI();
  },4350);
});

/* ===== Change password ===== */
$('#savePw').addEventListener('click',async()=>{
  const oldP=$('#pwOld').value,newP=$('#pwNew').value;
  const msg=$('#pwMsg');
  msg.classList.remove('hidden','win','err');
  if(newP.length<4){msg.textContent='New password too short (min 4)';msg.classList.add('err');return}
  const d=await apiCall('/api/auth/change-password',{oldP,newP});
  if(d.ok){
    msg.textContent='✅ Password updated';
    msg.classList.add('win');
    $('#pwOld').value='';$('#pwNew').value='';
    toast('🔐 Password changed successfully','win');
  }else{
    msg.textContent=d.error||'Failed';
    msg.classList.add('err');
  }
});

/* ===== v4: games tracking / Mines / Plinko / Hi-Lo / Leaderboard / Missions / i18n ===== */
function markGame(g){
  if(!state.gamesPlayed.includes(g)){
    state.gamesPlayed.push(g);
    saveState();
    renderMissions();
  }
}

/* ===== MINES ===== */
let mActive=false,mMines=0,mBet=0,mFound=0,mMult=1,mLayout=[];
function minesMultFor(k){
  let c=1;
  for(let i=0;i<k;i++)c*=(25-i)/(25-mMines-i);
  return Math.max(1,Math.floor(99*c)/100);
}
function buildMinesGrid(){
  const g=$('#minesGrid');
  g.innerHTML='';
  for(let i=0;i<25;i++){
    const c=document.createElement('div');
    c.className='mine-cell';
    c.dataset.i=i;
    c.addEventListener('click',()=>minePick(i));
    g.appendChild(c);
  }
}
buildMinesGrid();
$('#minesStart').addEventListener('click',()=>{
  if(mActive){toast('Finish the current round first','err');return}
  const bet=getBet('#minesBet','Mines');
  if(bet===null)return;
  mMines=+$('#minesCount').value;
  mBet=bet;mFound=0;mMult=1;mActive=true;
  setBalance(state.balance-bet);
  state.wagered+=bet;state.betsCount++;markGame('mines');
  logTx('bet',-bet,'Mines stake');
  mLayout=Array(25).fill(false);
  const idx=[...Array(25).keys()];
  for(let i=idx.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]]}
  idx.slice(0,mMines).forEach(i=>mLayout[i]=true);
  buildMinesGrid();
  $('#minesStart').classList.add('hidden');
  $('#minesCashout').classList.remove('hidden');
  $('#minesCashout').disabled=true;
  updMinesUI();
  $('#minesResult').textContent='';
  sndClick();
});
async function minePick(i){
  if(!mActive)return;
  const cell=$$('#minesGrid .mine-cell')[i];
  if(cell.classList.contains('revealed'))return;
  cell.classList.add('revealed');
  if(mLayout[i]){
    cell.classList.add('boom');cell.textContent='💥';
    mActive=false;
    $$('#minesGrid .mine-cell').forEach((c,j)=>{
      if(mLayout[j]){c.classList.add('revealed','boom');c.textContent='💣'}
      else if(!c.textContent)c.textContent='💎',c.classList.add('gem');
    });
    $('#minesStart').classList.remove('hidden');
    $('#minesCashout').classList.add('hidden');
    $('#minesResult').textContent='💥 BOOM! You hit a mine — lost '+fmt(mBet)+' CR';
    $('#minesResult').className='result lose';
    sndLose();
    return;
  }
  cell.classList.add('gem');cell.textContent='💎';
  beep(800+Math.random()*300,.07,'triangle',.05);
  mFound++;
  mMult=minesMultFor(mFound);
  $('#minesCashout').disabled=false;
  updMinesUI();
  if(mFound===25-mMines){
    minesCashout(true);
  }
}
function updMinesUI(){
  $('#minesFound').textContent=mFound+' / '+(25-mMines)+' gems';
  $('#minesMult').textContent=(mActive?mMult:1).toFixed(2)+'x';
  $('#minesValue').textContent=fmt(Math.floor(mBet*mMult))+' CR';
}
function minesCashout(auto){
  if(!mActive||mFound===0)return;
  mActive=false;
  const win=Math.floor(mBet*mMult);
  giveWin(win,'Mines cashout x'+mMult.toFixed(2));
  $$('#minesGrid .mine-cell').forEach((c,j)=>{
    c.classList.add('revealed');
    if(mLayout[j])c.textContent='💣';
    else if(!c.textContent){c.textContent='💎';c.classList.add('gem')}
  });
  $('#minesStart').classList.remove('hidden');
  $('#minesCashout').classList.add('hidden');
  $('#minesResult').textContent=(auto?'🏆 Board cleared! ':'✅ Cashed out at '+mMult.toFixed(2)+'x — ')+'won '+fmt(win)+' CR';
  $('#minesResult').className='result win';
  sndWin();
}
$('#minesCashout').addEventListener('click',()=>minesCashout(false));

/* ===== PLINKO ===== */
const PLINKO_MULTS=[12,5,2.5,1.4,1,0.5,1,1.4,2.5,5,12];
const PLINKO_ROWS=10;
let plinkoBusy=false;
(function buildPlinko(){
  const board=$('#plinkoBoard'),W=()=>board.clientWidth||600,H=board.clientHeight;
  const draw=()=>{
    board.querySelectorAll('.peg').forEach(p=>p.remove());
    const w=W();
    for(let r=3;r<=PLINKO_ROWS+2;r++){
      const count=r+2,y=30+r*((H-70)/(PLINKO_ROWS+2));
      for(let i=0;i<count;i++){
        const x=w/2+(i-(count-1)/2)*(w/14);
        const p=document.createElement('div');
        p.className='peg';
        p.style.left=x+'px';p.style.top=y+'px';
        board.appendChild(p);
      }
    }
  };
  draw();
  new ResizeObserver(draw).observe(board);
})();
(function buildBuckets(){
  const box=$('#plinkoBuckets');
  PLINKO_MULTS.forEach(m=>{
    const b=document.createElement('div');
    b.className='pbucket';
    b.textContent='×'+m;
    box.appendChild(b);
  });
})();
async function plinkoDrop(){
  if(plinkoBusy){toast('Ball in play…','err');return}
  const bet=getBet('#plinkoBet','Plinko');
  if(bet===null)return;
  plinkoBusy=true;
  $('#plinkoDrop').disabled=true;
  setBalance(state.balance-bet);
  state.wagered+=bet;state.betsCount++;markGame('plinko');
  logTx('bet',-bet,'Plinko drop');
  const{float:f}=await hmacFloat(serverSeed,state.clientSeed,state.nonce);
  pushFair('Plinko',(f*100).toFixed(4),state.nonce);
  state.nonce++;saveState();
  let x=Math.floor(f*1e9);
  const bits=[];
  for(let i=0;i<PLINKO_ROWS;i++){bits.push(x&1);x=Math.floor(x/2)}
  let rights=bits.filter(b=>b===1).length;
  const board=$('#plinkoBoard');
  const w=board.clientWidth,H=board.clientHeight;
  const ball=document.createElement('div');
  ball.className='plinko-ball';
  let px=w/2,py=22;
  ball.style.left=px+'px';ball.style.top=py+'px';
  board.appendChild(ball);
  beep(500,.05,'sine',.04);
  let step=0;
  const iv=setInterval(()=>{
    step++;
    const gap=w/14;
    const dir=bits[step-1]?1:-1;
    px+=dir*gap/2;
    py+=(H-70)/(PLINKO_ROWS+2);
    ball.style.left=px+'px';ball.style.top=py+'px';
    beep(600+Math.random()*250,.04,'square',.03);
    if(step>=PLINKO_ROWS){
      clearInterval(iv);
      setTimeout(()=>{
        ball.remove();
        const bucket=rights;
        const mult=PLINKO_MULTS[bucket];
        const buckets=$$('#plinkoBuckets .pbucket');
        buckets.forEach(b=>b.classList.remove('hit'));
        const bk=buckets[bucket];
        bk.classList.add('hit');
        setTimeout(()=>bk.classList.remove('hit'),900);
        const ret=Math.floor(bet*mult);
        if(ret>0)giveWin(ret,'Plinko x'+mult+' (bucket '+bucket+')');
        $('#plinkoResult').textContent=mult>=5?'🎊 Landed ×'+mult+' — won '+fmt(ret)+' CR!':mult>1?'✅ ×'+mult+' — won '+fmt(ret)+' CR':'💀 ×'+mult+' — lost '+fmt(bet-ret)+' CR';
        $('#plinkoResult').className='result '+(mult>1?'win':'lose');
        plinkoBusy=false;
        $('#plinkoDrop').disabled=false;
      },180);
    }
  },135);
}
$('#plinkoDrop').addEventListener('click',plinkoDrop);

/* ===== HI-LO ===== */
const HILO_RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const HILO_SUITS=[['♠','black'],['♥','red'],['♦','red'],['♣','black']];
let hiloActive=false,hiloBetV=0,hiloCur=null,hiloStreakN=0,hiloMultV=1,hiloBusy=false;
function hiloCardVal(r){return HILO_RANKS.indexOf(r)+2}
async function hiloNextCard(){
  const{float:f}=await hmacFloat(serverSeed,state.clientSeed,state.nonce);
  pushFair('Hi-Lo','',state.nonce);
  state.nonce++;saveState();
  const ri=Math.min(12,Math.floor(f*13));
  const si=Math.floor(((f*13)%1)*4);
  return{rank:HILO_RANKS[ri],suit:HILO_SUITS[si][0],color:HILO_SUITS[si][1]};
}
function renderHiloCard(){
  const el=$('#hiloCard');
  el.classList.remove('flip');void el.offsetWidth;el.classList.add('flip');
  if(!hiloCur){el.querySelector('.hc-rank').textContent='?';el.querySelector('.hc-suit').textContent='🂠';return}
  el.querySelector('.hc-rank').textContent=hiloCur.rank;
  const s=el.querySelector('.hc-suit');
  s.textContent=hiloCur.suit;
  s.className='hc-suit '+(hiloCur.color==='red'?'hc-red':'hc-black');
}
function updHiloUI(){
  $('#hiloStreak').textContent=hiloStreakN;
  $('#hiloMult').textContent=hiloMultV.toFixed(2)+'x';
  $('#hiloCashout').classList.toggle('hidden',!(hiloActive&&hiloStreakN>0));
}
$('#hiloDeal').addEventListener('click',async()=>{
  if(hiloBusy)return;
  if(hiloActive){toast('Round already running — guess or cash out','err');return}
  const bet=getBet('#hiloBet','Hi-Lo');
  if(bet===null)return;
  hiloBetV=bet;hiloActive=true;hiloStreakN=0;hiloMultV=1;hiloBusy=true;
  setBalance(state.balance-bet);
  state.wagered+=bet;state.betsCount++;markGame('hilo');
  logTx('bet',-bet,'Hi-Lo deal');
  hiloCur=await hiloNextCard();
  renderHiloCard();
  $('#hiloDeal').classList.add('hidden');
  updHiloUI();
  $('#hiloResult').textContent='Higher or lower than '+hiloCur.rank+'?';
  $('#hiloResult').className='result';
  hiloBusy=false;
  sndClick();
});
async function hiloGuess(dir){
  if(!hiloActive||hiloBusy||!hiloCur)return;
  hiloBusy=true;
  const prev=hiloCur;
  hiloCur=await hiloNextCard();
  renderHiloCard();
  const pv=hiloCardVal(prev.rank),nv=hiloCardVal(hiloCur.rank);
  const ok=dir==='hi'?nv>pv:nv<pv;
  if(ok){
    hiloStreakN++;
    const winningRanks=dir==='hi'?13-Math.min(12,pv):Math.max(2,pv)-1;
    const fair=13/Math.max(1,winningRanks)*0.96;
    hiloMultV=Math.min(50,+(hiloMultV*Math.max(1,fair)).toFixed(2));
    updHiloUI();
    $('#hiloResult').textContent='✅ Correct! Streak '+hiloStreakN+' — now at '+hiloMultV.toFixed(2)+'x ('+fmt(Math.floor(hiloBetV*hiloMultV))+' CR)';
    $('#hiloResult').className='result win';
    beep(750,.09,'triangle',.05);
  }else{
    hiloActive=false;
    $('#hiloDeal').classList.remove('hidden');
    updHiloUI();
    $('#hiloResult').textContent='❌ Wrong — lost '+fmt(hiloBetV)+' CR';
    $('#hiloResult').className='result lose';
    sndLose();
  }
  hiloBusy=false;
}
$('#hiloHigher').addEventListener('click',()=>hiloGuess('hi'));
$('#hiloLower').addEventListener('click',()=>hiloGuess('lo'));
$('#hiloCashout').addEventListener('click',()=>{
  if(!hiloActive||hiloStreakN===0)return;
  hiloActive=false;
  giveWin(Math.floor(hiloBetV*hiloMultV),'Hi-Lo cashout x'+hiloMultV.toFixed(2)+' streak '+hiloStreakN);
  $('#hiloDeal').classList.remove('hidden');
  updHiloUI();
  $('#hiloResult').textContent='💰 Cashed out at '+hiloMultV.toFixed(2)+'x!';
  $('#hiloResult').className='result win';
});

/* ===== LEADERBOARD ===== */
let lbTimer=null;
async function loadLeaders(){
  const d=await apiCall('/api/leaderboard');
  if(!d||!d.ok)return;
  const me=AUTH?(AUTH.user.username||'').toLowerCase():state.name.toLowerCase();
  const row=(u,i,key)=>{
    const mine=u.username.toLowerCase()===me?' class="me"':'';
    return '<tr'+mine+'><td class="lb-rank">'+(i+1)+'</td><td class="lb-name">'
      +String(u.username).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'})[c])
      +'</td><td class="lb-val">'+fmt(u[key])+'</td></tr>';
  };
  $('#lbWagered').innerHTML=d.top.length?d.top.map((u,i)=>row(u,i,'wagered')).join(''):'<tr><td colspan="3" class="lb-empty">No players yet — be the first!</td></tr>';
  $('#lbBalance').innerHTML=d.rich.length?d.rich.map((u,i)=>row(u,i,'balance')).join(''):'<tr><td colspan="3" class="lb-empty">No players yet.</td></tr>';
}

/* ===== MISSIONS ===== */
const MISSIONS=[
  {id:'first_bet',emoji:'🎯',name:'First Blood',desc:'Place your very first bet',reward:100,
   prog:()=>[Math.min(1,state.betsCount),state.betsCount>=1]},
  {id:'wager_5k',emoji:'💰',name:'High Roller',desc:'Wager 5,000 CR in total',reward:500,
   prog:()=>[Math.min(1,state.wagered/5000),state.wagered>=5000]},
  {id:'crash_5x',emoji:'🚀',name:'Crash Pilot',desc:'Cash out Crash at ×5.00 or higher',reward:300,
   prog:()=>[Math.min(1,(state.stats.crashBest||0)/5),(state.stats.crashBest||0)>=5]},
  {id:'green_hit',emoji:'🟢',name:'Zero Hero',desc:'Win a bet on Roulette green zero',reward:250,
   prog:()=>[(state.stats.greenHit?1:0),!!state.stats.greenHit]},
  {id:'try_new',emoji:'🎮',name:'Triple Threat',desc:'Play Mines, Plinko and Hi-Lo',reward:400,
   prog:()=>{const need=['mines','plinko','hilo'];const have=need.filter(g=>state.gamesPlayed.includes(g));return[have.length/3,have.length===3]}},
  {id:'chess_win',emoji:'♟️',name:'Giant Slayer',desc:'Checkmate the chess bot',reward:1000,
   prog:()=>[(state.stats.chessBest==='won'?1:0),state.stats.chessBest==='won']}
];
function renderMissions(){
  const box=$('#missionsList');
  if(!box)return;
  box.innerHTML=MISSIONS.map(ms=>{
    const claimed=state.missions[ms.id];
    const[pct,done]=ms.prog();
    const action=claimed
      ?'<div class="m-reward" style="color:#2ee56b">CLAIMED</div>'
      :done
        ?'<button class="btn btn-sm btn-gold" data-claim="'+ms.id+'">CLAIM</button>'
        :'<div class="m-reward">🔒 +'+fmt(ms.reward)+'</div>';
    return '<div class="mission'+(done?' done':'')+'">'
      +'<div class="m-emoji">'+ms.emoji+'</div>'
      +'<div class="m-body"><div class="m-name">'+ms.name+'</div>'
      +'<div class="m-desc">'+ms.desc+'</div>'
      +'<div class="m-bar"><div class="m-fill" style="width:'+Math.round(pct*100)+'%"></div></div></div>'
      +'<div class="m-action">'+action
      +'<div class="m-reward" style="margin-top:6px">+'+fmt(ms.reward)+' CR</div></div></div>';
  }).join('');
  $$('[data-claim]').forEach(b=>b.addEventListener('click',()=>{
    const ms=MISSIONS.find(x=>x.id===b.dataset.claim);
    if(!ms||state.missions[ms.id]||!ms.prog()[1])return;
    state.missions[ms.id]=true;
    saveState();
    giveWin(ms.reward,'Mission reward: '+ms.name);
    renderMissions();
  }));
}
renderMissions();

/* ===== i18n AR/EN ===== */
const I18N={
  '.navbtn[data-page="home"]':'الرئيسية 🏠',
  '.navbtn[data-page="sports"]':'رياضة ⚽',
  '.navbtn[data-page="casino"]':'كازينو 🎰',
  '.navbtn[data-page="leaders"]':'المتصدرون 🏆',
  '.navbtn[data-page="wallet"]':'المحفظة 💳',
  '.navbtn[data-page="account"]':'حسابي 👤',
  '#depositBtn':'المحفظة',
  '#authBtn':'تسجيل الدخول',
  '#dailyBtnTitle':null,
  '#cgame-slots h2':'🎰 سلوتس',
  '#cgame-roulette h2':'🎡 روليت',
  '#cgame-blackjack h2':'🃏 بلاك جاك',
  '#cgame-crash h2':'🚀 كراش',
  '#cgame-dice h2':'🎲 نرد',
  '#cgame-mines h2':'💣 ماينز',
  '#cgame-plinko h2':'🔻 بلينكو',
  '#cgame-hilo h2':'🂡 هاي-لو',
  '#cgame-chess h2':'♟️ شطرنج',
  '#page-leaders h2':'🏆 لوحة المتصدرين',
  '.missions-panel h3':'🏅 المهام والإنجازات',
  '#slotSpin':'ادور!',
  '#dicePlay':'ارمي!',
  '#crashStart':'انطلق!',
  '#minesStart':'ابدأ اللعبة',
  '#minesCashout':'اسحب أرباحك',
  '#plinkoDrop':'أنزل الكرة!',
  '#hiloHigher':'أعلى ⬆',
  '#hiloLower':'أقل ⬇',
  '#hiloCashout':'اسحب أرباحك',
  '#hiloDeal':'وزّع ورقة',
  '#saveName':'حفظ',
  '#logoutBtn':'خروج',
  '#savePw':'تحديث كلمة السر'
};
let LANG=localStorage.getItem('elitebet_lang')||'en';
function applyLang(){
  Object.entries(I18N).forEach(([sel,ar])=>{
    if(ar===null)return;
    const el=$(sel);
    if(!el)return;
    if(el.dataset.en===undefined)el.dataset.en=el.textContent;
    el.textContent=LANG==='ar'?ar:el.dataset.en;
  });
  document.documentElement.lang=LANG;
  document.documentElement.dir=LANG==='ar'?'rtl':'ltr';
  localStorage.setItem('elitebet_lang',LANG);
  $('#langBtn').style.borderColor=LANG==='ar'?'#f0b90b':'';
}
$('#langBtn').addEventListener('click',()=>{
  LANG=LANG==='en'?'ar':'en';
  applyLang();
  toast(LANG==='ar'?'🌐 تم التبديل إلى العربية':'🌐 Switched to English');
});
applyLang();

setInterval(()=>{if($('#page-leaders').classList.contains('active'))loadLeaders()},20000);
loadLeaders();
renderWallet();
updWdState();

/* ===== SOUND TOGGLE ===== */
function updSoundBtn(){
  const muted=localStorage.getItem('elitebet_muted')==='1';
  const btn=$('#soundBtn');
  if(btn)btn.textContent=muted?'🔇':'🔊';
}
updSoundBtn();
$('#soundBtn').addEventListener('click',()=>{
  const muted=localStorage.getItem('elitebet_muted')==='1';
  localStorage.setItem('elitebet_muted',muted?'0':'1');
  updSoundBtn();
  toast(muted?'🔊 Sound ON':'🔇 Sound OFF');
});

/* ===== TOURNAMENT WIDGET ===== */
async function loadTournamentWidget(){
  const d=await apiCall('/api/tournament');
  if(!d||!d.ok)return;
  if(d.entries.length){
    $('#twEmpty').classList.add('hidden');
    $('#twBody').parentElement.classList.remove('hidden');
    $('#twBody').innerHTML=d.entries.map((e,i)=>
      '<tr'+(AUTH&&e.username===AUTH.user.username?' class="me"':'')+
      '><td class="lb-rank">'+(i+1)+'</td><td class="lb-name">'+e.username.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'})[c])+
      '</td><td class="lb-val">'+e.wagered.toLocaleString()+'</td><td>'+e.wins+'</td></tr>'
    ).join('');
  }else{
    $('#twEmpty').classList.remove('hidden');
    $('#twBody').parentElement.classList.add('hidden');
  }
  $('#twTime').textContent='⏱ '+d.remainingText+' left';
  if(d.myRank){
    $('#twRank').innerHTML='Your rank: <b>#'+d.myRank+'</b>';
    $('#twMyWager').innerHTML='Your wagered: <b>'+d.myWagered.toLocaleString()+'</b> CR';
  }else{
    $('#twRank').textContent='Place any bet to join!';
    $('#twMyWager').innerHTML='Your wagered: <b>0</b> CR';
  }
}
setInterval(()=>{if($('#page-home').classList.contains('active'))loadTournamentWidget()},25000);
loadTournamentWidget();

/* ===== PROMO CODE ===== */
$('#promoRedeemBtn').addEventListener('click',async()=>{
  const code=$('#promoCode').value.trim();
  if(!code){toast('Enter a promo code','err');return}
  const msg=$('#promoMsg');
  const d=await apiCall('/api/promo/redeem',{code});
  if(d&&d.ok){
    setBalance(d.balance);
    msg.textContent='🎉 Code redeemed — +'+fmt(d.reward)+' CR credited!';
    msg.className='result win';
    toast('🎁 +'+fmt(d.reward)+' CR from promo!','win');
    sndWin();
    $('#promoCode').value='';
  }else if(d&&d.reason==='banned'){
    lockNow();
  }else{
    const errMsg={invalid:'Invalid promo code',limit:'Code usage limit reached',expired:'Code expired',already:'You already used this code',login_required:'Login required'};
    msg.textContent='❌ '+(d?(errMsg[d.error]||d.error):'Failed');
    msg.className='result err';
  }
});

/* ===== BET HISTORY FILTERS ===== */
function getGameFromTx(tx){
  if(!tx.details)return 'other';
  const d=tx.details.toLowerCase();
  if(d.includes('slot'))return 'slots';
  if(d.includes('roulette')||d.includes('roulette spin'))return 'roulette';
  if(d.includes('blackjack')||d.includes('bj'))return 'blackjack';
  if(d.includes('crash'))return 'crash';
  if(d.includes('dice'))return 'dice';
  if(d.includes('chess'))return 'chess';
  if(d.includes('mine'))return 'mines';
  if(d.includes('plinko'))return 'plinko';
  if(d.includes('hi-lo')||d.includes('hilo'))return 'hilo';
  if(d.includes('sport')||d.includes('match'))return 'sports';
  return 'other';
}
function switchTTab(el){
  document.querySelectorAll('.tx-tab').forEach(t=>t.classList.toggle('active',t===el));
  document.querySelectorAll('.ttab').forEach(p=>p.classList.toggle('active',p.id==='ttab-'+el.dataset.ttab));
}
window.switchTTab=switchTTab;
function renderTxTable(){
  const gameFilter=$('#txFilterGame').value;
  const typeFilter=$('#txFilterType').value;
  const txs=state.tx.filter(t=>{
    const g=getGameFromTx(t);
    if(gameFilter!=='all'&&g!==gameFilter)return false;
    if(typeFilter==='bet'&&t.type!=='bet')return false;
    if(typeFilter==='win'&&t.type!=='win')return false;
    if(typeFilter==='deposit'&&t.type!=='deposit')return false;
    if(typeFilter==='withdraw'&&t.type!=='withdraw')return false;
    return true;
  }).slice(0,100);
  $('#txBody').innerHTML=txs.length?txs.map(t=>{
    const game=getGameFromTx(t);
    const profit=t.amount;
    const stake=t.type==='bet'?Math.abs(t.amount):0;
    const outcome=t.type==='win'?'✅ Win':t.type==='bet'?'❌ Loss':t.type==='deposit'?'💰 Deposit':t.type==='withdraw'?'⬆️ Withdraw':t.type==='bonus'?'🎁 Bonus':'—';
    const profCls=profit>=0?'tx-amt-pos':'tx-amt-neg';
    return '<tr><td>'+new Date(t.t).toLocaleString()+'</td><td><span class="game-tag g-'+game+'">'+game.charAt(0).toUpperCase()+game.slice(1)+'</span></td>'
      +(stake?'<td class="tx-amt-neg">-'+fmt(stake)+'</td>':'<td class="muted">—</td>')
      +'<td>'+outcome+'</td>'
      +'<td class="'+profCls+'">'+(profit>=0?'+':'')+fmt(profit)+'</td></tr>';
  }).join(''):'<tr><td colspan="5"><div class="empty">No transactions match filters.</div></td></tr>';
}
$('#txFilterGame').addEventListener('change',renderTxTable);
$('#txFilterType').addEventListener('change',renderTxTable);

/* ===== ANALYTICS ===== */
function renderAnalytics(){
  const bets=state.tx.filter(t=>t.type==='bet'||t.type==='win');
  const onlyBets=state.tx.filter(t=>t.type==='bet');
  const onlyWins=state.tx.filter(t=>t.type==='win');
  const totalBetCount=onlyBets.length;
  const winCount=onlyWins.length;
  const winRate=totalBetCount>0?Math.round(winCount/(totalBetCount+winCount)*100):0;
  const profit=state.tx.reduce((a,t)=>a+t.amount,0);
  const biggestWin=Math.max(0,...onlyWins.map(t=>t.amount));
  const gameCounts={};
  onlyBets.forEach(t=>{const g=getGameFromTx(t);gameCounts[g]=(gameCounts[g]||0)+1});
  const favGame=Object.entries(gameCounts).sort((a,b)=>b[1]-a[1])[0];
  let streak=0,maxStreak=0;
  onlyBets.forEach(t=>{
    if(t.amount<0)streak++;
    else{maxStreak=Math.max(maxStreak,streak);streak=0}
  });
  maxStreak=Math.max(maxStreak,streak);
  $('#anaTotalBets').textContent=totalBetCount.toLocaleString();
  $('#anaWinRate').textContent=winRate+'%';
  const profEl=$('#anaProfit');
  profEl.textContent=(profit>=0?'+':'')+fmt(profit);
  profEl.style.color=profit>=0?'#2ee56b':'#ff5b5b';
  $('#anaBiggest').textContent=fmt(biggestWin);
  $('#anaFavGame').textContent=favGame?favGame[0].charAt(0).toUpperCase()+favGame[0].slice(1):'—';
  $('#anaStreak').textContent=maxStreak+' bets';
  renderBalanceChart();
}
function renderBalanceChart(){
  const chart=$('#anaChart');if(!chart)return;
  let bal=1000;
  const pts=[];
  const txSorted=[...state.tx].reverse();
  txSorted.forEach(t=>{bal-=t.amount;pts.push({t:t.t,bal:Math.max(0,bal)})});
  const recent=pts.slice(-50);
  if(!recent.length){chart.innerHTML='<div class="ana-empty">Place some bets to see your balance chart</div>';return}
  const maxBal=Math.max(1,...recent.map(p=>p.bal));
  chart.innerHTML=recent.map(p=>
    '<div class="abar" style="height:'+Math.max(2,p.bal/maxBal*100)+'%" title="'+fmt(p.bal)+' CR · '+new Date(p.t).toLocaleTimeString()+'"></div>'
  ).join('');
}
function renderAccountExtended(){renderTxTable();renderAnalytics()}
$('#txFilterGame').addEventListener('change',renderTxTable);

/* hook into nav to refresh tournament/promo on wallet */
const _origNav=$$('.navbtn')[0];
