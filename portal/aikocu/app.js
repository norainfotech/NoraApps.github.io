const root=document.querySelector('#app');
try{const o='nora-yz101-auth',n='nora-aikocu-auth';const v=localStorage.getItem(o);if(v&&!localStorage.getItem(n))localStorage.setItem(n,v);localStorage.removeItem(o);}catch{}
const client=window.supabase?.createClient('https://gjztdlihsfmozxcgdwke.supabase.co','sb_publishable_tDQAKMpHaorQAplXqg5Nqg_zwOImZeT',{auth:{storageKey:'nora-aikocu-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const skillName=v=>{const t=String(v??'');return esc(t.charAt(0).toLocaleUpperCase('tr')+t.slice(1));};
let session=null,state=null,page='home',serverOffset=0,countdownTimer=null,working=false;
function notify(message){showResultDialog('Bilgilendirme',message,'Tamam');}
function showResultDialog(title,message,buttonLabel='Tamam',tone='info'){
 document.querySelector('#app-dialog')?.remove();
 const d=document.createElement('dialog');d.id='app-dialog';d.className='app-result-dialog';d.dataset.tone=tone;
 d.autofocus=true;d.innerHTML='<h2>'+esc(title)+'</h2><p>'+esc(message)+'</p><button class="primary wide" type="button">'+esc(buttonLabel)+'</button>';
 document.body.append(d);d.showModal();
 const close=()=>{d.close();d.remove();};
 d.querySelector('button').addEventListener('click',close);
 d.addEventListener('cancel',e=>{e.preventDefault();close();});
}
function premiumInfo(){showResultDialog('Premium','Premium çok yakında. Açıldığında sınırsız ders yapabilir, beklemeden ilerleyebilir ve Koçuna sor\'u kullanabilirsin. Şimdilik her gün 1 ders ücretsiz.','Tamam');}
function limitDialog(){
 const a=state?.access||{};const limit=a.daily_reached&&!a.premium&&!a.bypass;const nx=limit?null:nextLesson();
 document.querySelector('#app-dialog')?.remove();
 const d=document.createElement('dialog');d.id='app-dialog';d.className='app-result-dialog';d.dataset.tone='info';
 d.autofocus=true;
 d.innerHTML=limit?'<h2>Bugünkü dersini tamamladın</h2><p class="count-label">Yeni dersin açılmasına</p><p class="big-count" data-until="'+esc(a.daily_unlock_at||'')+'">--:--:--</p><div class="dialog-actions"><button class="secondary" type="button" data-x="close">Kapat</button><button class="primary" type="button" data-x="premium">Premium\'a geç</button></div>':'<h2>Önce sıradaki dersi tamamla</h2><p>Bu ders, önceki dersleri bitirince açılır.</p><div class="dialog-actions"><button class="secondary" type="button" data-x="close">Kapat</button>'+(nx?'<button class="primary" type="button" data-x="go">Derse git</button>':'')+'</div>';
 document.body.append(d);d.showModal();
 let timer=null;const close=()=>{clearInterval(timer);d.close();d.remove();};
 const cd=d.querySelector('.big-count');
 if(cd){const tick=()=>{if(!cd.dataset.until){cd.textContent='24:00:00';return;}const s=Math.max(0,Math.ceil((Date.parse(cd.dataset.until)-nowMs())/1000));cd.textContent=[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':');if(s===0){close();loadState().then(()=>{if(['home','skills'].includes(page))render();}).catch(()=>{});}};tick();timer=setInterval(tick,1000);}
 d.addEventListener('click',e=>{const x=e.target.closest('button')?.dataset.x;const r=d.getBoundingClientRect();const outside=e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;if(!x&&!outside)return;close();if(x==='premium')premiumInfo();if(x==='go'&&nx)openLesson(nx.lesson_id,'lesson');});
 d.addEventListener('cancel',e=>{e.preventDefault();close();});
}
document.addEventListener('aikocu:limit',()=>{loadState().catch(()=>{}).finally(()=>limitDialog());});
document.addEventListener('aikocu:premium',()=>premiumInfo());
let wakeLock=null;
async function wakeOn(){try{if(!('wakeLock' in navigator)||wakeLock)return;wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}catch{}}
function wakeOff(){try{wakeLock?.release();}catch{}wakeLock=null;}
function failure(e){if(e?.cancelled)return;let message=e?.message||'Olmadı. Tekrar dene.';if(/invalid login credentials/i.test(message))message='E-posta veya şifre hatalı.';if(/email not confirmed/i.test(message))message='Önce e-postana gelen kodu gir.';if(/already registered|user_already_exists/i.test(message))message='Bu e-posta kayıtlı. Şifreni hatırlamıyorsan "Şifremi unuttum" de.';if(/unique|duplicate key/i.test(message))message='Bu kullanıcı adı kullanılıyor. Başka bir ad seç.';if(/fetch|network/i.test(message))message='Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.';if(e?.name==='NotAllowedError')message='Tarayıcı bildirime izin vermedi.';if(e?.name==='AbortError')message='Cihaz bildirim servisine bağlanamadı. İnternetini kontrol edip tekrar dene.';notify(message);}
async function detachPush(){try{if(!('serviceWorker' in navigator))return;const r=await navigator.serviceWorker.getRegistration();const s=await r?.pushManager.getSubscription();if(s){await client.rpc('nora_push',{p_action:'remove_device',p_data:{endpoint:s.endpoint}});await s.unsubscribe();}}catch{}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(action,data={}){const {data:r,error}=await client.rpc('aikocu_api',{p_action:action,p_data:data});if(error)throw error;return r;}
async function loadState(){state=await api('state');serverOffset=Date.parse(state.server_now)-Date.now();return state;}
const nowMs=()=>Date.now()+serverOffset;
const rows=()=>state?.lessons||[];
const row=id=>rows().find(x=>x.lesson_id===id);
const isLocked=r=>!!r?.locked_until&&Date.parse(r.locked_until)>nowMs();
const titleOf=id=>LESSONS.find(l=>l.id===id)?.title||id;
const doneCount=()=>rows().filter(r=>r.completed).length;
function nextLesson(){const r=row(state?.next_lesson);return r&&r.published&&!r.completed?r:null;}
const firstKey=()=>'aikocu_celebrated_'+(session?.user?.id||'');
const clock=until=>`<span class="countdown" data-until="${esc(until)}">--:--:--</span>`;
let deferredInstall=null;
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const shareIcon='<svg class="share-ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function installSteps(){return '<ol class="install-steps"><li>Safari\'de alttaki '+shareIcon+' <b>Paylaş</b> düğmesine dokun.</li><li>Listeyi kaydırıp <b>Ana Ekrana Ekle</b>\'yi seç.</li><li><b>Ekle</b>\'ye dokun.</li></ol><p class="install-note">Chrome yerine Safari ile açman gerekir.</p>';}
function htmlDialog(title,body,actions){
 document.querySelector('#app-dialog')?.remove();
 const d=document.createElement('dialog');d.id='app-dialog';d.className='app-result-dialog';d.autofocus=true;
 d.innerHTML='<h2>'+esc(title)+'</h2>'+body+'<div class="dialog-actions">'+actions+'</div>';
 document.body.append(d);d.showModal();
 const close=()=>{d.close();d.remove();};
 d.addEventListener('cancel',e=>{e.preventDefault();close();});
 d.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',close));
 return {d,close};
}
async function installApp(){
 if(deferredInstall){deferredInstall.prompt();try{await deferredInstall.userChoice;}catch{}deferredInstall=null;return;}
 if(isIOS()){htmlDialog('Ana ekrana ekle',installSteps(),'<button class="primary" type="button" data-close>Tamam</button>');return;}
 notify('Tarayıcı menüsünden (⋮) “Uygulamayı yükle” ya da “Ana ekrana ekle”yi seç.');
}
const mascots={fox:{name:'Tilki',color:'#f3b579'},owl:{name:'Baykuş',color:'#b3a1db'},cat:{name:'Kedi',color:'#e4b5cf'},panda:{name:'Panda',color:'#b4d7c5'}};
function avatarId(){const id=session?.user?.user_metadata?.aikocu_mascot;return mascots[id]?id:'fox';}
function mascot(id){if(!mascots[id])id='fox';const m=mascots[id];let ears=id==='panda'?'<circle cx="17" cy="20" r="8" fill="#5E4A32"/><circle cx="47" cy="20" r="8" fill="#5E4A32"/>':'<path d="M14 28L12 11L29 22M50 28L52 11L35 22" fill="'+m.color+'"/>';
return `<svg viewBox="0 0 64 64" role="img" aria-label="${m.name}" xmlns="http://www.w3.org/2000/svg"><g stroke="#4F3E2A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ears}<rect x="12" y="19" width="40" height="35" rx="18" fill="${m.color}"/>${id==='owl'?'<circle cx="24" cy="34" r="10" fill="#fff"/><circle cx="40" cy="34" r="10" fill="#fff"/>':''}${id==='panda'?'<ellipse cx="24" cy="34" rx="7" ry="9" fill="#5E4A32"/><ellipse cx="40" cy="34" rx="7" ry="9" fill="#5E4A32"/>':''}<circle cx="24" cy="34" r="3" fill="${id==='panda'?'#fff':'#4F3E2A'}" stroke="none"/><circle cx="40" cy="34" r="3" fill="${id==='panda'?'#fff':'#4F3E2A'}" stroke="none"/><path d="M26 44Q32 49 38 44" fill="none"/>${id==='fox'||id==='cat'?'<path d="M29 39L32 41L35 39"/>':''}</g></svg>`;}

/* ---------- Gezinme ---------- */
const mainPages=['home','skills','profile'];
let restoring=false;
const tunnelPages=['pace','invite'];
function pushStep(){if(restoring||!tunnelPages.includes(page))return;const s={aikocu:true,page},st=history.state;if(st?.aikocu&&tunnelPages.includes(st.page))history.replaceState(s,'',location.pathname);else history.pushState(s,'',location.pathname);}
function go(p,opts={}){
 lessonView.keepDraft();page=p;
 if(!restoring&&opts.push!==false)history.pushState({aikocu:true,page:p},'',location.pathname);
 render();window.scrollTo({top:0,left:0,behavior:'instant'});
}
window.addEventListener('popstate',e=>{
 if(session&&tunnelPages.includes(page)){history.pushState({aikocu:true,page},'',location.pathname);return;}
 if(!session||!state?.profile||lessonView.busy())return;lessonView.keepDraft();
 const p=e.state?.aikocu?e.state.page:'home';page=mainPages.includes(p)?p:'home';
 restoring=true;render();restoring=false;window.scrollTo(0,0);
});
let pushOn=null;
const pushSupported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const isAndroid=()=>/android/i.test(navigator.userAgent);
const b64bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function pushRpc(action,data={}){const {data:r,error}=await client.rpc('nora_push',{p_action:action,p_data:data});if(error)throw error;return r;}
function permissionSteps(){
 const host=esc(location.hostname);
 const steps=isAndroid()?['Chrome’da sağ üstteki ⋮ menüsünden <b>Ayarlar</b>’ı aç.','<b>Site ayarları → Bildirimler</b> bölümünde '+host+' adresini seç ve izin ver.','Buraya dönüp <b>İzni açtım</b>’a dokun.']
  :isIOS()?['Telefonunda <b>Ayarlar → Bildirimler</b> bölümünü aç.','<b>AI Koçu</b>’nu seç ve <b>Bildirimlere İzin Ver</b>’i aç.','Buraya dönüp <b>İzni açtım</b>’a dokun.']
  :['Adres çubuğunun solundaki site simgesine tıkla.','<b>Bildirimler</b> iznini <b>İzin ver</b> yap.','Buraya dönüp <b>İzni açtım</b>’a bas.'];
 return '<ol class="install-steps">'+steps.map(t=>'<li>'+t+'</li>').join('')+'</ol>';
}
function reminderHelp(){
 if(!pushSupported()){
  if(isIOS()&&!isStandalone()){htmlDialog('Önce ana ekrana ekle','<p>iPhone’da hatırlatmalar, ana ekrana eklenen uygulamada çalışır.</p>'+installSteps(),'<button class="primary" type="button" data-close>Tamam</button>');return;}
  htmlDialog('Hatırlatmalar','<p>Bu tarayıcı bildirimleri desteklemiyor. Android’de Chrome ile açabilirsin.</p>','<button class="primary" type="button" data-close>Tamam</button>');return;
 }
 const {d,close}=htmlDialog('Bildirim izni kapalı','<p>Dersin açılınca haber verebilmem için bu sitenin bildirim iznini aç:</p>'+permissionSteps()+'<p class="gate-msg" role="alert"></p>','<button class="secondary" type="button" data-close>Vazgeç</button><button class="primary" type="button" data-x="retry">İzni açtım</button>');
 d.querySelector('[data-x="retry"]').addEventListener('click',()=>{
  if(Notification.permission==='denied'){d.querySelector('.gate-msg').textContent='İzin hâlâ kapalı görünüyor. Adımları tamamlayıp tekrar dene.';return;}
  close();execute(async()=>{await enablePush();refreshPushViews();});
 });
}
async function enablePush(){
 if(!pushSupported()||Notification.permission==='denied'){reminderHelp();return false;}
 const perm=Notification.permission==='granted'?'granted':await Notification.requestPermission();
 if(perm!=='granted'){if(perm==='denied')reminderHelp();return false;}
 const reg=await navigator.serviceWorker.register('push-worker.js',{scope:'./'});await navigator.serviceWorker.ready;
 let sub=await reg.pushManager.getSubscription();
 const st=await pushRpc('status',{endpoint:sub?.endpoint});
 if(!sub){if(!st.public_key)throw Error('Hatırlatma sistemi hazırlanıyor. Birkaç dakika sonra tekrar dene.');sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64bytes(st.public_key)});}
 await pushRpc('register',{endpoint:sub.endpoint});
 await pushRpc('preferences',{timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
 pushOn=true;return true;
}
async function disablePush(){
 const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager.getSubscription();
 const st=await pushRpc('status',{endpoint:sub?.endpoint});
 await pushRpc('preferences',{enabled:false,timezone:st.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone});
 if(sub){await pushRpc('remove_device',{endpoint:sub.endpoint});await sub.unsubscribe();}
 pushOn=false;
}
function refreshPushViews(){paintBadge();if(page==='program')programScreen();else if(['home','profile'].includes(page))render();}
function missingCount(){return (state?.account?.anonymous?1:0)+(pushOn===false?1:0);}
function badgeHtml(){const n=missingCount();return n?`<i class="nav-badge" aria-label="${n} eksik">${n}</i>`:'';}
function paintBadge(){const s=document.querySelector('.bottom-nav [data-page="profile"] span');if(!s)return;s.querySelector('.nav-badge')?.remove();s.insertAdjacentHTML('beforeend',badgeHtml());}
async function checkPush(){
 const before=pushOn;
 try{
  if(!('serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window)){pushOn=null;return;}
  if(Notification.permission!=='granted'){pushOn=false;}
  else{const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager.getSubscription();
   if(!sub)pushOn=false;else{const {data,error}=await client.rpc('nora_push',{p_action:'status',p_data:{endpoint:sub.endpoint}});pushOn=error?null:!!(data?.device_registered&&data?.enabled);}}
 }catch{pushOn=null;}
 paintBadge();if(pushOn!==before&&['profile','home'].includes(page)&&!working)render();
}
const NAVIC={home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H10v-5.5h4v5.5h3.5a1 1 0 0 0 1-1V10"/>',skills:'<path d="m12 3.2 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.1l-5.4 3 1-6.1-4.4-4.3 6.1-.9L12 3.2Z"/>'};
const nav=()=>`<nav class="bottom-nav" aria-label="Ana menü">${[['home','Ana sayfa'],['skills','Becerilerim'],['profile','Profil']].map(([p,t])=>`<button data-page="${p}" ${page===p?'aria-current="page"':''}><span aria-hidden="true">${p==='profile'?`<i class="nav-avatar">${mascot(avatarId())}</i>`+badgeHtml():`<svg class="nav-ic" viewBox="0 0 24 24">${NAVIC[p]}</svg>`}</span>${t}</button>`).join('')}</nav>`;

/* ---------- E-posta kodu (anonim -> kalıcı hesap) ---------- */
function codeDialog({title,intro,send,verify,done,dismissible=false}){
 return new Promise((resolve,reject)=>{
  const d=document.createElement('dialog');d.className='app-result-dialog gate';if(dismissible)d.dataset.dismissible='1';
  const quit=()=>{d.close();d.remove();reject(Object.assign(new Error('cancel'),{cancelled:true}));};
  d.addEventListener('cancel',e=>{e.preventDefault();if(dismissible)quit();});
  let email='';
  const msg=t=>{const m=d.querySelector('.gate-msg');if(m)m.textContent=t||'';};
  const busy=v=>d.querySelectorAll('button,input').forEach(x=>x.disabled=v);
  const stepEmail=()=>{
   d.innerHTML=`<h2>${esc(title)}</h2><p>${esc(intro)}</p><form><input name="email" type="email" required autocomplete="email" inputmode="email" placeholder="E-posta" value="${esc(email)}"><p class="gate-msg" role="alert"></p><button class="primary wide">Kod gönder</button></form>${dismissible?'<div class="gate-links"><button type="button" class="text" data-g="quit">Vazgeç</button></div>':''}`;
   d.querySelector('form').onsubmit=async e=>{e.preventDefault();email=new FormData(e.target).get('email').trim().toLowerCase();busy(true);try{await send(email);stepCode();}catch(err){busy(false);msg(gateError(err));}};
   d.querySelector('[data-g="quit"]')?.addEventListener('click',quit);
   d.querySelector('input').focus();
  };
  const stepCode=()=>{
   d.innerHTML=`<h2>Kodu yaz</h2><p>${esc(email)} adresine 6 haneli bir kod gönderdik.</p><form><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" maxlength="8" required placeholder="Kod" class="code-input"><p class="gate-msg" role="alert"></p><button class="primary wide">Onayla</button></form><div class="gate-links"><button type="button" class="text" data-g="resend">Kodu tekrar gönder</button><button type="button" class="text" data-g="change">E-postayı değiştir</button></div>`;
   d.querySelector('form').onsubmit=async e=>{e.preventDefault();const code=String(new FormData(e.target).get('code')||'').trim();busy(true);try{await verify(email,code);await done();d.close();d.remove();resolve();}catch(err){busy(false);msg(/expired|invalid|token/i.test(err?.message||'')?'Kod hatalı ya da süresi dolmuş.':gateError(err));}};
   d.querySelector('[data-g="resend"]').onclick=async()=>{busy(true);try{await send(email);msg('Yeni kod gönderildi.');}catch(err){msg(gateError(err));}busy(false);};
   d.querySelector('[data-g="change"]').onclick=stepEmail;
   d.querySelector('[data-g="quit"]')?.addEventListener('click',quit);
   d.querySelector('input').focus();
  };
  document.body.append(d);d.showModal();stepEmail();
 });
}
function gateError(e){const m=e?.message||'';if(/already|registered|exists/i.test(m))return 'Bu e-posta başka bir hesapta kayıtlı. Başka bir e-posta dene.';if(/rate|seconds|too many/i.test(m))return 'Çok sık denedin. Biraz bekleyip tekrar dene.';if(/invalid.*email|valid email/i.test(m))return 'E-posta adresi geçersiz.';if(/not found|signups not allowed|user/i.test(m))return 'Bu e-postayla kayıtlı hesap bulunamadı.';return 'Olmadı. Tekrar dene.';}
function emailGate(soft=false){
 if(!state?.account?.anonymous)return Promise.resolve();
 return codeDialog({dismissible:soft,title:'İlerlemeni kaydet',intro:'E-postanı yaz. Telefonunu değiştirsen de kaldığın yerden devam edersin.',
  send:async email=>{const {error}=await client.auth.updateUser({email});if(error)throw error;},
  verify:async(email,token)=>{const {data,error}=await client.auth.verifyOtp({email,token,type:'email_change'});if(error)throw error;if(data?.session)session=data.session;},
  done:async()=>{await loadState();}});
}

/* ---------- Karşılama, giriş ---------- */
function welcome(){
 document.body.dataset.page='welcome';
 root.innerHTML=`<section class="auth welcome"><span class="welcome-mark"><img src="app-icon.svg" alt="" width="80" height="80"></span><h1>Yapay zekayı<br>koçunla öğren.</h1><div class="btn-row"><button class="secondary" data-action="login">Hesabım var</button><button class="primary" data-action="start">Başla</button></div></section>`;
}
async function startAnonymous(){
 if(!session){const {data,error}=await client.auth.signInAnonymously({options:{data:{origin_app:'aikocu'}}});if(error)throw error;session=data.session;}
 await loadState();
 if(state.profile)go('home');else{page='pace';render();}
}
async function loginFlow(){
 await codeDialog({dismissible:true,title:'Giriş yap',intro:'Kayıtlı e-postanı yaz, sana bir kod göndereceğim.',
  send:async email=>{const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false}});if(error)throw error;},
  verify:async(email,token)=>{const {data,error}=await client.auth.verifyOtp({email,token,type:'email'});if(error)throw error;session=data.session;},
  done:async()=>{await loadState();}});
 if(state.profile)go('home');else{page='pace';render();}
}

/* ---------- Karşılama akışı ---------- */
async function startJourney(){await api('start');await loadState();page='invite';render();window.scrollTo(0,0);}
function paceScreen(){
 root.innerHTML=`<section class="flow"><span class="eyebrow">Tempon</span><h1>Günde kaç ders?</h1><p class="lead">Ücretsiz başla. Hızlanmak istersen Premium’a geçersin.</p><div class="option-list"><button class="option-card main" data-action="pace-free"><b>Hafif mod</b><small>Günde 1 ders · Ücretsiz</small><span class="go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button><button class="option-card" data-action="pace-premium"><b>Hızlı mod</b><small>Sınırsız ders · Premium</small><span class="pill">Yakında</span></button></div></section>`;
}
const lessonOf=id=>LESSONS.find(l=>l.id===id)||{};
const gainPills=id=>(row(id)?.gives||[]).map(g=>`<span class="pill skill">${skillName(g.skill)} <b>Seviye ${esc(g.level)}</b></span>`).join('');
function inviteScreen(){
 const n=nextLesson();
 if(!n){root.innerHTML=`<section class="flow"><h1>Dersler hazırlanıyor.</h1><p class="lead">Yeni dersler eklenince burada görünür.</p><button class="primary wide" data-action="to-home">Devam et</button></section>`;return;}
 const g=gainPills(n.lesson_id);
 root.innerHTML=`<section class="flow"><h1>İlk dersin hazır</h1><p class="lead">Kısa bir ders, küçük bir uygulama ve 3 soru.</p><div class="card lesson-card"><h2>${esc(titleOf(n.lesson_id))}</h2><p>${esc(lessonOf(n.lesson_id).objective||'')}</p>${g?`<div class="gain">${g}</div>`:''}</div><div class="btn-row"><button class="secondary" data-lesson="${n.lesson_id}" data-mode="testout">Testle geç</button><button class="primary" data-lesson="${n.lesson_id}" data-mode="lesson">Başla</button></div><p class="hint-line">Konuyu biliyorsan Testle geç’i seç.</p></section>`;
}

/* ---------- Kutlama ve program ---------- */
let celebrateFirst=false;
function celebrateScreen(points,first=true,task=null){
 page='celebrate';celebrateFirst=first;document.body.dataset.page='celebrate';
 root.innerHTML=`<section class="flow celebrate"><div class="celebrate-mark" aria-hidden="true">🎉</div><h1>${first?'İlk dersin tamam!':'Ders tamam!'}</h1><div class="reward"><span class="pill big">+${esc(points)} puan</span>${task?gainPills(task):''}</div><div class="btn-row">${navigator.share?'<button class="secondary" data-action="share">Paylaş</button>':''}<button class="primary" data-action="celebrate-next">Devam et</button></div></section>`;
}
const SI={mail:'<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',phone:'<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',ok:'<path d="m5 12.5 4.5 4.5L19 7.5"/>'};
const setupItem=(ic,title,desc,done,doneText,action,label)=>`<li class="setup-item${done?' done':''}"><span class="ic"><svg viewBox="0 0 24 24">${SI[done?'ok':ic]}</svg></span><span><strong>${title}</strong><small>${desc}</small></span>${done?`<span class="state">${doneText}</span>`:`<button class="secondary small" data-action="${action}">${label}</button>`}</li>`;
function programScreen(){
 page='program';document.body.dataset.page='program';
 const anon=state.account?.anonymous;
 root.innerHTML=`<section class="flow"><h1>Programın hazır</h1><p class="lead">Sıradaki dersin açılınca devam edersin. Bu adımlar işini kolaylaştırır:</p><ol class="setup-list">${setupItem('mail','İlerlemeni kaydet','Telefon değişse de kaldığın yerden devam et.',!anon,'Kaydedildi','save-email-program','E-posta ekle')}${setupItem('bell','Hatırlatmaları aç','Dersin açılınca haber veririm.',pushOn===true,'Açık','push-on','Aç')}${isStandalone()?'':setupItem('phone','Ana ekrana ekle','Uygulamayı tek dokunuşla aç.',false,'','install','Ekle')}</ol><button class="primary wide" data-action="to-home">Ana sayfaya geç</button></section>`;
}
/* ---------- Bugün ---------- */
function homeView(){
 const u=state.profile,a=state.access,n=nextLesson(),lk=n&&isLocked(n)?n:null,limited=a.daily_reached&&!a.premium&&!a.bypass;
 const remind=pushOn===false?`<button class="text" data-action="push-on">Açılınca haber ver</button>`:'';
 let card,cls='coach-card';
 if(lk){cls+=' center';card=`<span class="eyebrow">Sıradaki ders</span><h2>${esc(titleOf(lk.lesson_id))}</h2><p class="count-label">Tekrar denemek için kalan süre</p><p class="big-count">${clock(lk.locked_until)}</p>${remind}`;}
 else if(limited){cls+=' center';card=`<h2>Bugünkü dersini tamamladın</h2><p class="count-label">Yeni dersin açılmasına</p><p class="big-count">${a.daily_unlock_at?clock(a.daily_unlock_at):'24:00:00'}</p><div class="btn-row">${n?`<button class="secondary" data-lesson="${n.lesson_id}" data-mode="testout">Testle geç</button>`:''}<button class="primary" data-action="premium-info">Premium'a geç</button></div>${remind}`;}
 else if(n)card=`<span class="eyebrow">Sıradaki ders</span><h2>${esc(titleOf(n.lesson_id))}</h2><p class="sub">${esc(lessonOf(n.lesson_id).objective||'')}</p><div class="btn-row"><button class="secondary" data-lesson="${n.lesson_id}" data-mode="testout">Testle geç</button><button class="primary" data-lesson="${n.lesson_id}" data-mode="lesson">Başla</button></div>`;
 else card=`<h2>Yeni dersler hazırlanıyor.</h2><p class="sub">Yeni dersler eklenince burada görünür.</p>`;
 return `<section class="today-head"><h1>Merhaba, ${esc(u.username)}</h1><span class="pill">${esc(state.points)} puan</span></section>
 <section class="card ${cls}">${card}</section>
 <button class="link-card" data-page="skills">Tamamladıklarım<span>${doneCount()} ders ›</span></button>`;
}
const RI={done:'<svg class="row-ic ok" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.5"/></svg>'};
function skillsView(){
 const sk=state.skills||[],done=rows().filter(r=>r.completed);
 const gain=r=>(r.gives||[]).map(g=>`${skillName(g.skill)} ${g.level}`).join(' · ');
 return `<h1>Becerilerim</h1>
 <section class="card"><div class="section-head"><h2>Seviyeler</h2></div>${sk.length?`<div class="skill-list">${sk.map(x=>`<span class="pill skill">${skillName(x.skill)} <b>Seviye ${esc(x.level)}</b></span>`).join('')}</div>`:'<p class="empty">İlk dersini tamamlayınca becerilerin burada görünür.</p>'}</section>
 <section class="card"><div class="section-head"><h2>Tamamladıklarım</h2><span>${done.length} ders</span></div>${done.length?`<div class="list-rows">${done.map(r=>`<div class="list-row">${RI.done}<span class="row-t">${esc(titleOf(r.lesson_id))}<small>${gain(r)}</small></span></div>`).join('')}</div>`:'<p class="empty">Henüz tamamlanan ders yok.</p>'}</section>`;
}
function profileView(){
 const u=state.profile,anon=state.account?.anonymous;
 const pushText=!pushSupported()?'Bu tarayıcıda kullanılamıyor':pushOn===true?'Dersin açılınca haber veririm':'Kapalı';
 return `<h1>Profilim</h1><section class="profile-head"><button type="button" class="avatar" data-action="choose-mascot" aria-label="Maskot seç" aria-expanded="false" aria-controls="mascot-options">${mascot(avatarId())}</button><div class="profile-identity"><button class="editable-name" data-action="edit-name" aria-label="Kullanıcı adını düzenle" aria-expanded="false" aria-controls="name-editor">${esc(u.username)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z"/></svg></button><div class="identity-meta"><span class="pill">${esc(state.points)} puan</span></div></div></section>
 <form id="profile-form" class="inline-editor" hidden><label>Kullanıcı adı<input id="name-editor" name="username" value="${esc(u.username)}" required minlength="2" maxlength="40" autocomplete="nickname"></label><div class="btn-row"><button type="button" class="secondary" data-action="cancel-name">Vazgeç</button><button class="primary">Kaydet</button></div></form>
 <div class="mascot-options" id="mascot-options" hidden>${Object.entries(mascots).map(([id,m])=>`<button type="button" data-mascot="${id}" aria-label="${m.name}" aria-pressed="${avatarId()===id}">${mascot(id)}<small>${m.name}</small></button>`).join('')}</div>
 ${anon?`<section class="card callout"><h2>İlerlemeni kaydet</h2><p>E-postanı ekle; telefon değişse de kaldığın yerden devam et.</p><button class="primary wide" data-action="save-email">E-posta ekle</button></section>`:''}
 <section class="settings">${isStandalone()?'':'<button class="setting-row" data-action="install"><span>Ana ekrana ekle<small>Uygulamayı tek dokunuşla aç</small></span><span aria-hidden="true">›</span></button>'}<button class="setting-row" role="switch" aria-checked="${pushOn===true}" data-action="push-toggle"><span>Hatırlatmalar<small>${pushText}</small></span><span class="switch" aria-hidden="true"></span></button>${anon?'':'<button class="setting-row" data-action="logout">Çıkış yap</button>'}</section>
 <nav class="legal-links" aria-label="Yasal ve iletişim"><a href="gizlilik-politikasi.html">Gizlilik</a><a href="kullanim-kosullari.html">Koşullar</a><a href="mailto:apps@norainfotech.com">Yardım</a></nav>`;
}

/* ---------- Çizim ---------- */
function render(){
 clearInterval(countdownTimer);document.body.dataset.page=page;page==='lesson'?wakeOn():wakeOff();pushStep();
 if(!session||!state){welcome();return;}
 if(!state.profile&&!['pace','invite'].includes(page))page='pace';
 const tunnel={pace:paceScreen,invite:inviteScreen,program:programScreen};
 if(tunnel[page]){tunnel[page]();return;}
 if(['celebrate','lesson'].includes(page))return;
 const v={home:homeView,skills:skillsView,profile:profileView}[page]||homeView;
 root.innerHTML=v()+nav();
 const els=[...root.querySelectorAll('.countdown')];
 if(els.length){let fired=false;const tick=()=>{for(const el of els){const s=Math.max(0,Math.ceil((Date.parse(el.dataset.until)-nowMs())/1000));el.textContent=[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':');if(s===0&&!fired){fired=true;clearInterval(countdownTimer);loadState().then(render).catch(()=>{});}}};tick();countdownTimer=setInterval(tick,1000);}
}

/* ---------- Ders ekranı ---------- */
const lessonView=window.createAIKocuLessonView({client,root,getUser:()=>session?.user,getState:()=>state,refresh:loadState,notify,
 onExit:()=>{if(history.state?.aikocu&&history.state.page==='lesson')history.back();else go('home');},
 skipResult:()=>true,
 onCompleted:async(task,info)=>{
  await loadState();
  let first=false;try{first=!localStorage.getItem(firstKey());if(first)localStorage.setItem(firstKey(),'1');}catch{}
  celebrateScreen(info.points,first,task);window.scrollTo(0,0);
 }
});
function openLesson(id,mode){
 const lr=row(id);
 if(!lr?.published){notify('Bu ders yakında.');return;}
 const limited=state?.access?.daily_reached&&!state.access.premium&&!state.access.bypass;
 if(!lr.completed&&(!lr.open||(limited&&mode!=='testout'))){limitDialog();return;}
 page='lesson';wakeOn();history.pushState({aikocu:true,page:'lesson'},'',location.pathname);
 if(!lessonView.open(id,{mode})){page='home';render();}
 window.scrollTo(0,0);
}

/* ---------- Olaylar ---------- */
async function execute(task,element){if(working||lessonView.busy())return;working=true;const bs=element?.querySelectorAll?.('button')||[];bs.forEach(b=>b.disabled=true);try{await task();}catch(e){failure(e);}finally{working=false;bs.forEach(b=>{if(b.isConnected)b.disabled=false;});}}
root.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b||b.closest('[data-lesson-view]')||b.type==='submit'&&b.closest('form'))return;
 execute(async()=>{
  const d=b.dataset;
  if(d.locked){limitDialog();return;}
  if(d.lesson){openLesson(d.lesson,d.mode||'lesson');return;}
  if(d.page){go(d.page);return;}
  if(d.mascot){if(!mascots[d.mascot])return;const {data,error}=await client.auth.updateUser({data:{aikocu_mascot:d.mascot}});if(error)throw error;session={...session,user:data.user};render();return;}
  const a=d.action;
  if(a==='start'){await startAnonymous();return;}
  if(a==='login'){await loginFlow();return;}
  if(a==='pace-free'){await startJourney();return;}
  if(a==='pace-premium'||a==='premium-info'){premiumInfo();return;}
  if(a==='share'){try{await navigator.share({title:'AI Koçu',text:'AI Koçu ile yapay zekayı öğrenmeye başladım. Ben de dene.',url:location.origin+location.pathname});}catch{}return;}
  if(a==='celebrate-next'){if(celebrateFirst)programScreen();else go('home');window.scrollTo(0,0);return;}
  if(a==='to-home'){go('home');return;}
  if(a==='save-email'){await emailGate(true);render();paintBadge();return;}
  if(a==='save-email-program'){await emailGate(true);programScreen();return;}
  if(a==='edit-name'||a==='cancel-name'){const f=document.querySelector('#profile-form');f.hidden=a==='cancel-name'||!f.hidden;document.querySelector('[data-action="edit-name"]').setAttribute('aria-expanded',String(!f.hidden));if(!f.hidden){document.querySelector('#mascot-options').hidden=true;const i=document.querySelector('#name-editor');i.focus();i.select();}return;}
  if(a==='choose-mascot'){const p=document.querySelector('#mascot-options');p.hidden=!p.hidden;document.querySelector('#profile-form').hidden=true;b.setAttribute('aria-expanded',String(!p.hidden));return;}
  if(a==='install'){await installApp();return;}
  if(a==='push-on'){if(pushOn!==true)await enablePush();refreshPushViews();return;}
  if(a==='push-toggle'){if(pushOn===true)await disablePush();else await enablePush();refreshPushViews();return;}
  if(a==='logout'){await detachPush();await client.auth.signOut({scope:'local'});session=null;state=null;page='home';welcome();}
 },b.parentElement);
});
root.addEventListener('submit',event=>{
 if(event.target.closest('[data-lesson-view]'))return;event.preventDefault();const form=event.target,values=Object.fromEntries(new FormData(form));
 execute(async()=>{if(form.id==='profile-form'){await api('profile',{username:values.username});await loadState();render();notify('Profilin kaydedildi.');}},form);
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;if(page==='program')programScreen();});
window.addEventListener('appinstalled',()=>{deferredInstall=null;if(page==='program')programScreen();});

async function init(){
 if(!client)throw Error('Uygulama bağlantısı yüklenemedi. Sayfayı yenile.');
 client.auth.onAuthStateChange((event,s)=>{session=s;if(event==='SIGNED_OUT'){lessonView.reset();state=null;if(!working){page='home';welcome();}}});
 const {data,error}=await client.auth.getSession();if(error)throw error;session=data.session;
 if(!session){welcome();return;}
 try{await loadState();}catch(e){const {error:ue}=await client.auth.getUser();if(!ue)throw e;await client.auth.signOut({scope:'local'});session=null;state=null;welcome();return;}
 const back=history.state?.aikocu&&mainPages.includes(history.state.page)?history.state.page:'home';
 history.replaceState({aikocu:true,page:back},'',location.pathname);
 page=state.profile?back:'pace';render();
 checkPush();
}
let lastSync=Date.now();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&page==='lesson')wakeOn();if(document.visibilityState!=='visible'||!session||!state)return;checkPush();if(Date.now()-lastSync<60000||working||lessonView.busy()||!['home','skills','profile'].includes(page))return;lastSync=Date.now();loadState().then(()=>{if(['home','skills','profile'].includes(page)&&!working)render();}).catch(()=>{});});
init().catch(e=>{root.innerHTML='<section class="flow"><h1>Bağlantı kurulamadı.</h1><p class="lead">Sayfayı yenileyerek tekrar deneyebilirsin.</p><a class="button primary wide" href="./">Yenile</a></section>';failure(e);});
try{const clr=()=>{if(document.visibilityState==='visible'&&navigator.clearAppBadge)navigator.clearAppBadge().catch(()=>{});};document.addEventListener('visibilitychange',clr);clr();}catch{}
document.addEventListener('click',e=>{const d=e.target;if(!(d instanceof HTMLDialogElement)||!d.open||d.classList.contains('gate')&&!d.dataset.dismissible)return;const r=d.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)return;const ev=new Event('cancel',{cancelable:true});d.dispatchEvent(ev);if(d.open&&!ev.defaultPrevented)d.close();});
