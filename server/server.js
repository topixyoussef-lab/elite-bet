const express=require('express');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const app=express();
app.use(express.json());

const PSP_URL=process.env.PSP_URL||'';
const PSP_KEY=process.env.PSP_KEY||'';
const ADMIN_KEY=process.env.ADMIN_KEY||'0120767';
const ADMIN_SECRET=process.env.ADMIN_SECRET||'14c2e8541c2086fab0835b94e01f6e34';
const PORT=process.env.PORT||3000;
const DB_PATH=path.join(__dirname,'data','db.json');

app.get('/admin.html',function(req,res){res.status(404).send('Not found')});
app.get('/admin',function(req,res){res.status(404).send('Not found')});
app.get('/'+ADMIN_SECRET,function(req,res){res.sendFile(path.join(__dirname,'..','admin.html'))});

app.use(express.static(__dirname+'/..'));

function loadDB(){
  try{return JSON.parse(fs.readFileSync(DB_PATH,'utf8'))}
  catch(e){}
  return{users:[],sessions:{},withdrawals:[],promoCodes:[],tournament:{weekStart:null,entries:{}},config:{edge:{dice:1,crash:2,roulette:1,slots:0}}};
}
let db=loadDB();
if(!db.config)db.config={edge:{dice:1,crash:2,roulette:1,slots:0}};
if(!db.config.edge)db.config.edge={dice:1,crash:2,roulette:1,slots:0};
if(!Array.isArray(db.withdrawals))db.withdrawals=[];
if(!Array.isArray(db.promoCodes))db.promoCodes=[];
if(!db.tournament||typeof db.tournament!=='object')db.tournament={weekStart:null,entries:{}};
if(!db.tournament.entries)db.tournament.entries={};
let saveTimer=null;
function saveDB(){
  if(saveTimer)return;
  saveTimer=setTimeout(()=>{
    saveTimer=null;
    fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
    fs.writeFileSync(DB_PATH,JSON.stringify(db));
  },300);
}
function hash(pw,salt){return crypto.scryptSync(String(pw),String(salt),32).toString('hex')}
function pub(u){
  return{id:u.id,username:u.username,balance:u.balance,wagered:u.wagered||0,
    bets:u.bets||0,banned:!!u.banned,createdAt:u.createdAt,lastSeen:u.lastSeen};
}
function findUser(id){return db.users.find(u=>u.id===id)}
function authUser(req){
  const token=req.headers['x-token']||'';
  const id=db.sessions[token];
  if(!id)return null;
  const u=findUser(id);
  if(!u)return null;
  u.lastSeen=Date.now();
  return u;
}
function isAdmin(req){
  return (req.query.key===ADMIN_KEY)||(req.headers['x-admin-key']===ADMIN_KEY);
}
function notify(target,text){
  const list=target==='all'?db.users:[target].filter(Boolean);
  list.forEach(u=>{
    u.notifs=u.notifs||[];
    u.notifs.unshift({t:Date.now(),txt:String(text).slice(0,300),read:false});
    if(u.notifs.length>30)u.notifs.length=30;
  });
}

app.post('/api/auth/register',(req,res)=>{
  const{username,password}=req.body||{};
  const name=String(username||'').trim();
  if(name.length<3||name.length>16)return res.json({ok:false,error:'Username must be 3-16 characters'});
  if(String(password||'').length<4)return res.json({ok:false,error:'Password must be at least 4 characters'});
  if(db.users.some(u=>u.username.toLowerCase()===name.toLowerCase()))return res.json({ok:false,error:'Username already taken'});
  const salt=crypto.randomBytes(8).toString('hex');
  const u={
    id:Date.now().toString(36)+crypto.randomBytes(3).toString('hex'),
    username:name,salt,passHash:hash(password,salt),
    balance:0,wagered:0,bets:0,banned:false,notifs:[],
    dailyAt:0,
    createdAt:Date.now(),lastSeen:Date.now(),lastPush:0,adminPending:null
  };
  db.users.push(u);
  notify(u,'Welcome to ELITE BET! 🎉 Your account is ready — claim your Daily Bonus every 24h.');
  const token=crypto.randomBytes(24).toString('hex');
  db.sessions[token]=u.id;
  saveDB();
  res.json({ok:true,token,user:pub(u)});
});

app.post('/api/auth/login',(req,res)=>{
  const{username,password}=req.body||{};
  const name=String(username||'').trim();
  const u=db.users.find(x=>x.username.toLowerCase()===name.toLowerCase());
  if(!u)return res.json({ok:false,error:'User not found'});
  if(u.banned)return res.json({ok:false,error:'Account suspended'});
  const h=hash(password,u.salt);
  if(!crypto.timingSafeEqual(Buffer.from(h),Buffer.from(u.passHash)))return res.json({ok:false,error:'Wrong password'});
  const token=crypto.randomBytes(24).toString('hex');
  db.sessions[token]=u.id;
  u.lastSeen=Date.now();
  saveDB();
  res.json({ok:true,token,user:pub(u)});
});

app.post('/api/auth/change-password',(req,res)=>{
  const u=authUser(req);
  if(!u)return res.status(401).json({ok:false});
  const{oldP,newP}=req.body||{};
  if(hash(oldP,u.salt)!==u.passHash)return res.json({ok:false,error:'Current password is wrong'});
  if(String(newP||'').length<4)return res.json({ok:false,error:'New password too short'});
  u.passHash=hash(newP,u.salt);
  saveDB();
  res.json({ok:true});
});

app.get('/api/me',(req,res)=>{
  const u=authUser(req);
  if(!u)return res.status(401).json({ok:false,reason:u&&u.banned?'banned':undefined});
  if(u.banned)return res.status(401).json({ok:false,reason:'banned'});
  res.json({ok:true,user:pub(u),cfg:db.config});
});

app.post('/api/sync',(req,res)=>{
  const u=authUser(req);
  if(!u)return res.status(401).json({ok:false,reason:'banned'});
  if(u.banned)return res.status(401).json({ok:false,reason:'banned'});
  let override=null;
  const incoming=Number.isFinite(req.body&&req.body.balance)?Math.max(0,Math.floor(req.body.balance)):null;
  if(u.adminPending&&u.adminPending.at>=u.lastPush&&incoming!==null&&u.adminPending.value!==incoming){
    override=u.adminPending.value;
  }
  u.adminPending=null;
  if(incoming!==null)u.balance=override!==null?override:incoming;
  if(Number.isFinite(req.body&&req.body.wagered))u.wagered=Math.max(u.wagered,Math.floor(req.body.wagered));
  u.lastPush=Date.now();
  u.lastSeen=Date.now();
  saveDB();
  res.json({ok:true,override,balance:u.balance,cfg:db.config});
});

app.get('/api/config',(req,res)=>{
  res.json({ok:true,cfg:db.config});
});

const WD_MIN=1000;
app.post('/api/withdraw',(req,res)=>{
  const u=authUser(req);
  if(!u)return res.status(401).json({ok:false,error:'login_required'});
  if(u.banned)return res.status(401).json({ok:false,reason:'banned'});
  const amt=Math.floor(Number(req.body&&req.body.amount));
  const method=String(req.body&&req.body.method||'card');
  if(!Number.isFinite(amt)||amt<WD_MIN)return res.json({ok:false,error:'min_withdraw'});
  if(amt>u.balance)return res.json({ok:false,error:'insufficient'});
  u.balance-=amt;
  u.adminPending={value:u.balance,at:Date.now()};
  const w={
    id:Date.now().toString(36)+crypto.randomBytes(3).toString('hex'),
    userId:u.id,
    username:u.username,
    amount:amt,
    method,
    status:'pending',
    t:Date.now(),
    processedAt:null
  };
  db.withdrawals.unshift(w);
  if(db.withdrawals.length>200)db.withdrawals.length=200;
  notify(u,'⏳ Withdrawal request received: '+amt.toLocaleString()+' CR via '+method.toUpperCase()+' — will be processed within 24 hours.');
  saveDB();
  res.json({ok:true,balance:u.balance,request:w});
});
app.get('/api/my-withdrawals',(req,res)=>{
  const u=authUser(req);
  if(!u)return res.status(401).json({ok:false});
  res.json({ok:true,items:db.withdrawals.filter(w=>w.userId===u.id).slice(0,10)});
});

/* Promo Codes */
function getWeekStart(){
  const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay()+1);return d.getTime();
}
function getWeekKey(){return getWeekStart().toString(36)}
app.post('/api/promo/redeem',(req,res)=>{
  const u=authUser(req);
  if(!u)return res.status(401).json({ok:false,error:'login_required'});
  if(u.banned)return res.status(401).json({ok:false,reason:'banned'});
  const code=String(req.body&&req.body.code||'').trim().toUpperCase();
  if(!code)return res.json({ok:false,error:'empty'});
  const p=db.promoCodes.find(x=>x.code===code&&!x.disabled);
  if(!p)return res.json({ok:false,error:'invalid'});
  if(p.expiresAt&&Date.now()>p.expiresAt)return res.json({ok:false,error:'expired'});
  if(p.maxUses&&p.usedCount>=p.maxUses)return res.json({ok:false,error:'limit'});
  if(p.usedBy&&p.usedBy.includes(u.id))return res.json({ok:false,error:'already'});
  u.balance+=p.reward;
  u.adminPending={value:u.balance,at:Date.now()};
  p.usedCount=(p.usedCount||0)+1;
  if(!p.usedBy)p.usedBy=[];
  p.usedBy.push(u.id);
  notify(u,'🎁 Promo code "'+code+'" redeemed — +'+p.reward.toLocaleString()+' CR credited!');
  saveDB();
  res.json({ok:true,reward:p.reward,balance:u.balance});
});

/* Tournament */
function settleTournament(){
  const wk=getWeekStart();
  if(db.tournament.weekStart===wk)return;
  const prev=String(db.tournament.weekStart||'');
  if(prev){
    const entries=Object.values(db.tournament.entries);
    entries.sort((a,b)=>b.wagered-a.wagered);
    const prizes=[5000,2000,1000];
    entries.slice(0,3).forEach((e,i)=>{
      const u=findUser(e.userId);
      if(u){
        u.balance+=prizes[i];
        u.adminPending={value:u.balance,at:Date.now()};
        notify(u,'🏆 Tournament result! You placed #'+(i+1)+' — prize '+prizes[i].toLocaleString()+' CR credited!');
      }
    });
  }
  db.tournament.weekStart=wk;
  db.tournament.entries={};
  saveDB();
}
app.get('/api/tournament',(req,res)=>{
  settleTournament();
  const entries=Object.values(db.tournament.entries)
    .sort((a,b)=>b.wagered-a.wagered).slice(0,10)
    .map(e=>({username:e.username,wagered:e.wagered,wins:e.wins}));
  const u=authUser(req);
  let myRank=null,myWagered=0;
  if(u){
    const all=Object.values(db.tournament.entries).sort((a,b)=>b.wagered-a.wagered);
    const idx=all.findIndex(e=>e.userId===u.id);
    if(idx>=0){myRank=idx+1;myWagered=all[idx].wagered}
  }
  const weekEnd=getWeekStart()+7*86400000;
  const remaining=Math.max(0,weekEnd-Date.now());
  const h=Math.floor(remaining/36e5),m=Math.ceil(remaining%36e5/6e4);
  res.json({ok:true,entries,prizes:[5000,2000,1000],weekEnd,remainingText:h>24?Math.ceil(remaining/864e5)+' days':h+'h '+m+'m',myRank,myWagered});
});
app.post('/api/tournament/track',(req,res)=>{
  const u=authUser(req);
  if(!u)return res.status(401).json({ok:false});
  const amount=Number(req.body&&req.body.amount)||0;
  const win=!!req.body&&req.body.win;
  const wk=getWeekStart();
  if(db.tournament.weekStart!==wk){db.tournament.weekStart=wk;db.tournament.entries={}}
  if(!db.tournament.entries[u.id])db.tournament.entries[u.id]={userId:u.id,username:u.username,wagered:0,wins:0};
  const e=db.tournament.entries[u.id];
  e.wagered+=amount;
  if(win)e.wins++;
  saveDB();
  res.json({ok:true});
});

app.get('/api/leaderboard',(req,res)=>{
  const active=db.users.filter(u=>!u.banned);
  const shape=u=>({username:u.username,wagered:u.wagered||0,balance:u.balance});
  res.json({
    ok:true,
    top:active.slice().sort((a,b)=>(b.wagered||0)-(a.wagered||0)).slice(0,10).map(shape),
    rich:active.slice().sort((a,b)=>b.balance-a.balance).slice(0,10).map(shape)
  });
});

app.post('/api/daily',(req,res)=>{
  const u=authUser(req);
  const COOLDOWN=20*60*60*1000;
  if(!u){
    return res.status(401).json({ok:false,error:'auth_required'});
  }
  if(req.body&&req.body.check){
    return res.json({ok:true,avail:!(u.dailyAt&&Date.now()-u.dailyAt<COOLDOWN),next:u.dailyAt?u.dailyAt+COOLDOWN:0});
  }
  if(u.dailyAt&&Date.now()-u.dailyAt<COOLDOWN){
    return res.json({ok:false,next:u.dailyAt+COOLDOWN});
  }
  const PRIZES=[50,100,150,250,400,750,1500,5000];
  const W=[22,20,18,15,12,8,4,1];
  let r=Math.random()*W.reduce((a,b)=>a+b,0),idx=0;
  for(let i=0;i<W.length;i++){r-=W[i];if(r<=0){idx=i;break}}
  const reward=PRIZES[idx];
  u.dailyAt=Date.now();
  saveDB();
  res.json({ok:true,reward,idx});
});
function localStorage_guest(){return 0}

app.get('/api/notifs',(req,res)=>{
  const u=authUser(req);
  if(!u)return res.status(401).json({ok:false});
  const items=(u.notifs||[]).slice(0,30);
  res.json({ok:true,items,unread:items.filter(n=>!n.read).length});
});
app.post('/api/notifs/read',(req,res)=>{
  const u=authUser(req);
  if(!u)return res.status(401).json({ok:false});
  (u.notifs||[]).forEach(n=>n.read=true);
  saveDB();
  res.json({ok:true});
});

app.get('/api/admin/users',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  res.json({ok:true,users:db.users.map(pub)});
});
app.post('/api/admin/balance',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const{userId,mode,value}=req.body||{};
  const u=findUser(userId);
  if(!u)return res.json({ok:false,error:'no_user'});
  const v=Math.floor(Number(value));
  if(!Number.isFinite(v))return res.json({ok:false,error:'bad_value'});
  u.balance=mode==='set'?Math.max(0,v):Math.max(0,u.balance+v);
  u.adminPending={value:u.balance,at:Date.now()};
  saveDB();
  res.json({ok:true,user:pub(u)});
});
app.post('/api/admin/ban',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const{userId,flag}=req.body||{};
  const u=findUser(userId);
  if(!u)return res.json({ok:false,error:'no_user'});
  u.banned=!!flag;
  if(u.banned)notify(u,'🚫 Your account has been suspended by administration.');
  saveDB();
  res.json({ok:true,user:pub(u)});
});
app.post('/api/admin/delete',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const{userId}=req.body||{};
  const i=db.users.findIndex(u=>u.id===userId);
  if(i<0)return res.json({ok:false,error:'no_user'});
  const removed=db.users.splice(i,1)[0];
  for(const t in db.sessions)if(db.sessions[t]===removed.id)delete db.sessions[t];
  saveDB();
  res.json({ok:true});
});
app.post('/api/admin/message',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const{userId,text}=req.body||{};
  const txt=String(text||'').trim();
  if(!txt)return res.json({ok:false,error:'empty'});
  if(userId==='all'){
    notify('all','📩 Admin: '+txt);
    saveDB();
    return res.json({ok:true,sent:db.users.length});
  }
  const u=findUser(userId);
  if(!u)return res.json({ok:false,error:'no_user'});
  notify(u,'📩 Admin: '+txt);
  saveDB();
  res.json({ok:true,sent:1});
});
app.get('/api/admin/withdrawals',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const items=db.withdrawals.map(w=>{
    const u=findUser(w.userId);
    return Object.assign({},w,{
      userExists:!!u,
      currentBalance:u?u.balance:null
    });
  });
  res.json({ok:true,items,pendingCount:db.withdrawals.filter(w=>w.status==='pending').length});
});
app.post('/api/admin/wd-status',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const{id,status}=req.body||{};
  const w=db.withdrawals.find(x=>x.id===id);
  if(!w)return res.json({ok:false,error:'no_request'});
  if(w.status!=='pending')return res.json({ok:false,error:'already_processed'});
  if(status!=='paid'&&status!=='rejected')return res.json({ok:false,error:'bad_status'});
  w.status=status;
  w.processedAt=Date.now();
  const u=findUser(w.userId);
  if(u){
    if(status==='rejected'){
      u.balance+=w.amount;
      u.adminPending={value:u.balance,at:Date.now()};
      notify(u,'❌ Your withdrawal of '+w.amount.toLocaleString()+' CR was rejected — the amount has been refunded to your balance.');
    }else{
      notify(u,'✅ Your withdrawal of '+w.amount.toLocaleString()+' CR via '+w.method.toUpperCase()+' has been paid. Funds arrive within 24 hours.');
    }
  }
  saveDB();
  res.json({ok:true,request:w});
});

/* Admin: Promo Codes */
app.get('/api/admin/promos',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  res.json({ok:true,codes:db.promoCodes.map(p=>({
    id:p.id,code:p.code,reward:p.reward,maxUses:p.maxUses,usedCount:p.usedCount||0,
    expiresAt:p.expiresAt,disabled:!!p.disabled,createdAt:p.createdAt
  }))});
});
app.post('/api/admin/promos',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const{code,reward,maxUses,expiresDays}=req.body||{};
  const c=String(code||'').trim().toUpperCase();
  const r=Math.floor(Number(reward));
  if(!c||c.length<3||c.length>20)return res.json({ok:false,error:'bad_code'});
  if(!Number.isFinite(r)||r<1)return res.json({ok:false,error:'bad_reward'});
  if(db.promoCodes.some(p=>p.code===c&&!p.disabled))return res.json({ok:false,error:'exists'});
  const promo={
    id:Date.now().toString(36)+crypto.randomBytes(2).toString('hex'),
    code:c,reward:r,
    maxUses:Number.isFinite(+maxUses)&&+maxUses>0?+maxUses:0,
    usedCount:0,usedBy:[],
    expiresAt:expiresDays>0?Date.now()+expiresDays*864e5:null,
    disabled:false,createdAt:Date.now()
  };
  db.promoCodes.unshift(promo);
  saveDB();
  res.json({ok:true,promo});
});
app.post('/api/admin/promos/disable',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const{id}=req.body||{};
  const p=db.promoCodes.find(x=>x.id===id);
  if(p)p.disabled=true;
  saveDB();
  res.json({ok:true});
});

/* Admin: Tournament */
app.post('/api/admin/tournament/settle',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const prevWk=String(db.tournament.weekStart||'');
  const entries=Object.values(db.tournament.entries);
  entries.sort((a,b)=>b.wagered-a.wagered);
  const prizes=[5000,2000,1000];
  const awarded=entries.slice(0,3).map((e,i)=>{
    const u=findUser(e.userId);
    if(u){u.balance+=prizes[i];u.adminPending={value:u.balance,at:Date.now()};notify(u,'🏆 Manual tournament settlement — you placed #'+(i+1)+'! +'+prizes[i].toLocaleString()+' CR')}
    return{rank:i+1,username:e.username,prize:prizes[i]};
  });
  db.tournament.weekStart=getWeekStart();
  db.tournament.entries={};
  saveDB();
  res.json({ok:true,awarded});
});

app.get('/api/admin/config',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  res.json({ok:true,cfg:db.config});
});
app.post('/api/admin/config',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const{edge}=req.body||{};
  if(edge&&typeof edge==='object'){
    ['dice','crash','roulette','slots'].forEach(k=>{
      if(Number.isFinite(edge[k]))db.config.edge[k]=Math.max(0,Math.min(20,+edge[k]));
    });
  }
  saveDB();
  res.json({ok:true,cfg:db.config});
});

const ring=[];
app.get('/api/admin/stats',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({ok:false,error:'bad_key'});
  const now=Date.now();
  const t0=new Date();t0.setHours(0,0,0,0);
  const stats={
    players:db.users.length,
    online:db.users.filter(u=>now-u.lastSeen<12000).length,
    totalBalance:db.users.reduce((a,u)=>a+u.balance,0),
    totalWagered:db.users.reduce((a,u)=>a+(u.wagered||0),0),
    today:new Date().toDateString(),
    newToday:db.users.filter(u=>u.createdAt>=t0.getTime()).length,
    top:db.users.slice().sort((a,b)=>(b.wagered||0)-(a.wagered||0)).slice(0,8).map(pub),
    history:ring.slice(-48)
  };
  res.json({ok:true,stats});
});

app.get('/api/admin/stream',(req,res)=>{
  if(!isAdmin(req))return res.status(401).end();
  res.writeHead(200,{
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache',
    Connection:'keep-alive'
  });
  const send=()=>{
    ring.push({t:Date.now(),on:db.users.filter(u=>Date.now()-u.lastSeen<12000).length,
      bal:db.users.reduce((a,u)=>a+u.balance,0)});
    if(ring.length>48)ring.shift();
    try{res.write('data: '+JSON.stringify({users:db.users.map(pub)})+'\n\n')}catch(e){}
  };
  send();
  const iv=setInterval(send,2000);
  req.on('close',()=>clearInterval(iv));
});

app.post('/api/deposit',async(req,res)=>{
  const{method,amount}=req.body||{};
  if(!Number.isFinite(amount)||amount<10){
    return res.status(400).json({ok:false,error:'invalid_amount'});
  }
  if(!PSP_URL||!PSP_KEY){
    return res.status(200).json({ok:false,error:'psp_not_configured'});
  }
  try{
    const r=await fetch(PSP_URL,{
      method:'POST',
      headers:{'Authorization':'Bearer '+PSP_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        amount:Math.round(amount*100),
        currency:'USD',
        method,
        callback_url:process.env.PUBLIC_URL+'/api/deposit/webhook'
      })
    });
    const d=await r.json();
    if(!r.ok)return res.status(502).json({ok:false,error:d.error||'psp_error'});
    return res.json({ok:true,ref:d.id,method});
  }catch(e){
    return res.status(502).json({ok:false,error:'psp_unreachable'});
  }
});

app.listen(PORT,()=>{
  console.log('ELITE BET server running on port '+PORT);
  console.log('Admin panel: http://localhost:'+PORT+'/'+ADMIN_SECRET);
});
