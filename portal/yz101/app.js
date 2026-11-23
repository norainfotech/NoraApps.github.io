const root=document.querySelector('#app');
const client=window.supabase?.createClient('https://gjztdlihsfmozxcgdwke.supabase.co','sb_publishable_tDQAKMpHaorQAplXqg5Nqg_zwOImZeT',{auth:{storageKey:'nora-yz101-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=null,state=null,page='home',serverOffset=0,countdownTimer=null,working=false;
const goals=['Anlamak','Kullanmak','Üretmek'];
const goalInfo={Anlamak:'Yapay zekanın ne olduğunu ve nasıl çalıştığını anla.',Kullanmak:'Günlük işlerinde yapay zekayı kullan.',Üretmek:'Yapay zekayla içerik, otomasyon ve ürün üret.'};
const plans={1:10,2:20,3:30};
const MIN_PER_LESSON=6;
function notify(message){showResultDialog('Bilgilendirme',message,'Tamam');}
function showResultDialog(title,message,buttonLabel='Tamam',tone='info'){
 document.querySelector('#app-dialog')?.remove();
 const d=document.createElement('dialog');d.id='app-dialog';d.className='app-result-dialog';d.dataset.tone=tone;
 d.innerHTML='<h2>'+esc(title)+'</h2><p>'+esc(message)+'</p><button class="primary wide" type="button">'+esc(buttonLabel)+'</button>';
 document.body.append(d);d.showModal();
 const close=()=>{d.close();d.remove();};
 d.querySelector('button').addEventListener('click',close);
 d.addEventListener('cancel',e=>{e.preventDefault();close();});
}
function failure(e){let message=e?.message||'İşlem tamamlanamadı. Tekrar dene.';if(/invalid login credentials/i.test(message))message='E-posta veya şifre hatalı.';if(/email not confirmed/i.test(message))message='Önce e-postandaki doğrulama bağlantısını aç.';if(/already registered|user_already_exists/i.test(message))message='Bu e-posta kayıtlı. Şifreni hatırlamıyorsan "Şifremi unuttum" de.';if(/unique|duplicate key/i.test(message))message='Bu kullanıcı adı kullanılıyor. Başka bir ad seç.';if(/fetch|network/i.test(message))message='Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.';notify(message);}
async function detachPush(){try{if(!('serviceWorker' in navigator))return;const r=await navigator.serviceWorker.getRegistration();const s=await r?.pushManager.getSubscription();if(s){await client.rpc('nora_push',{p_action:'remove_device',p_data:{endpoint:s.endpoint}});await s.unsubscribe();}}catch{}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function coach(action,data={}){const {data:r,error}=await client.rpc('yz101_coach',{p_action:action,p_data:data});if(error)throw error;return r;}
async function loadState(){state=await coach('state');serverOffset=Date.parse(state.server_now)-Date.now();return state;}
const nowMs=()=>Date.now()+serverOffset;
const rows=()=>state?.lessons||[];
const row=id=>rows().find(x=>x.task_id===id);
const isLocked=r=>!!r?.locked_until&&Date.parse(r.locked_until)>nowMs();
const titleOf=id=>COURSE.find(c=>c.id===id)?.title||id;
const goalCount=()=>GOAL_TOTAL[state?.profile?.goal]||10;
const doneCount=()=>rows().filter(r=>r.completed).length;
function nextLesson(){const open=rows().filter(r=>r.published&&!r.completed);return open.find(r=>!isLocked(r)&&!r.listed)||open.find(r=>!isLocked(r))||null;}
function nextLocked(){return rows().filter(r=>r.published&&!r.completed&&isLocked(r)).sort((a,b)=>Date.parse(a.locked_until)-Date.parse(b.locked_until))[0]||null;}
function weeksLeft(){const left=Math.max(0,goalCount()-Math.min(doneCount(),goalCount())),min=plans[state?.profile?.daily_plan]||20;return Math.max(1,Math.ceil(left*MIN_PER_LESSON/min/7));}
const firstKey=()=>'yz101_celebrated_'+(session?.user?.id||'');
const clock=until=>`<span class="countdown" data-until="${esc(until)}">--:--:--</span>`;
let deferredInstall=null;
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const shareIcon='<svg class="share-ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function installBody(){
 if(isIOS())return '<ol class="install-steps"><li>Safari\'de alttaki '+shareIcon+' <b>Paylaş</b> düğmesine dokun.</li><li>Listeyi kaydırıp <b>Ana Ekrana Ekle</b>\'yi seç.</li><li><b>Ekle</b>\'ye dokun. Uygulama ana ekranında açılır; bildirimler de bundan sonra çalışır.</li></ol><p class="muted install-note">Chrome yerine Safari ile açman gerekir.</p>';
 if(deferredInstall)return '<button type="button" class="primary wide" data-action="install">Uygulamayı yükle</button>';
 return '<p class="muted">Tarayıcı menüsünden (⋮) <b>Uygulamayı yükle</b> ya da <b>Ana ekrana ekle</b>\'yi seç.</p>';
}
function installCard(dismissible){
 if(isStandalone())return '';
 try{if(dismissible&&localStorage.getItem('yz101_install_off'))return '';}catch{}
 const close=dismissible?'<button type="button" class="text install-close" data-action="install-off" aria-label="Kapat">Şimdi değil</button>':'';
 return '<section class="card install-card" id="install-card"><strong>Ana ekranına ekle</strong><p class="muted">Tek dokunuşla aç, günlük ders bildirimini al.</p>'+installBody()+close+'</section>';
}
const mascots={fox:{name:'Tilki',color:'#f3b579'},owl:{name:'Baykuş',color:'#b3a1db'},cat:{name:'Kedi',color:'#e4b5cf'},panda:{name:'Panda',color:'#b4d7c5'}};
function avatarId(){const id=session?.user?.user_metadata?.yz101_mascot;return mascots[id]?id:'fox';}
function mascot(id){if(!mascots[id])id='fox';const m=mascots[id];let ears=id==='panda'?'<circle cx="17" cy="20" r="8" fill="#5E4A32"/><circle cx="47" cy="20" r="8" fill="#5E4A32"/>':'<path d="M14 28L12 11L29 22M50 28L52 11L35 22" fill="'+m.color+'"/>';
return `<svg viewBox="0 0 64 64" role="img" aria-label="${m.name}" xmlns="http://www.w3.org/2000/svg"><g stroke="#4F3E2A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ears}<rect x="12" y="19" width="40" height="35" rx="18" fill="${m.color}"/>${id==='owl'?'<circle cx="24" cy="34" r="10" fill="#fff"/><circle cx="40" cy="34" r="10" fill="#fff"/>':''}${id==='panda'?'<ellipse cx="24" cy="34" rx="7" ry="9" fill="#5E4A32"/><ellipse cx="40" cy="34" rx="7" ry="9" fill="#5E4A32"/>':''}<circle cx="24" cy="34" r="3" fill="${id==='panda'?'#fff':'#4F3E2A'}" stroke="none"/><circle cx="40" cy="34" r="3" fill="${id==='panda'?'#fff':'#4F3E2A'}" stroke="none"/><path d="M26 44Q32 49 38 44" fill="none"/>${id==='fox'||id==='cat'?'<path d="M29 39L32 41L35 39"/>':''}</g></svg>`;}

/* ---------- Gezinme ---------- */
const mainPages=['home','journey','profile'];
let restoring=false;
function go(p,opts={}){
 lessonView.keepDraft();page=p;
 if(!restoring&&opts.push!==false)history.pushState({yz101:true,page:p},'',location.pathname);
 render();window.scrollTo({top:0,left:0,behavior:'instant'});
}
window.addEventListener('popstate',e=>{
 if(!session||!state?.profile||lessonView.busy())return;lessonView.keepDraft();
 const p=e.state?.yz101?e.state.page:'home';page=mainPages.includes(p)?p:'home';
 restoring=true;render();restoring=false;window.scrollTo(0,0);
});
const nav=()=>`<nav class="bottom-nav" aria-label="Ana menü">${[['home','Bugün','☀️'],['journey','Yolculuğum','🧭'],['profile','Profil','🙂']].map(([p,t,i])=>`<button data-page="${p}" ${page===p?'aria-current="page"':''}><span aria-hidden="true">${i}</span>${t}</button>`).join('')}</nav>`;

/* ---------- E-posta kodu (anonim -> kalıcı hesap) ---------- */
function codeDialog({title,intro,send,verify,done}){
 return new Promise((resolve,reject)=>{
  const d=document.createElement('dialog');d.className='app-result-dialog gate';d.addEventListener('cancel',e=>e.preventDefault());
  let email='';
  const msg=t=>{const m=d.querySelector('.gate-msg');if(m)m.textContent=t||'';};
  const busy=v=>d.querySelectorAll('button,input').forEach(x=>x.disabled=v);
  const stepEmail=()=>{
   d.innerHTML=`<h2>${esc(title)}</h2><p>${esc(intro)}</p><form><input name="email" type="email" required autocomplete="email" inputmode="email" placeholder="E-posta" value="${esc(email)}"><p class="gate-msg" role="alert"></p><button class="primary wide">Kod gönder</button></form>`;
   d.querySelector('form').onsubmit=async e=>{e.preventDefault();email=new FormData(e.target).get('email').trim().toLowerCase();busy(true);try{await send(email);stepCode();}catch(err){busy(false);msg(gateError(err));}};
   d.querySelector('input').focus();
  };
  const stepCode=()=>{
   d.innerHTML=`<h2>Kodu yaz</h2><p>${esc(email)} adresine 6 haneli bir kod gönderdik.</p><form><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" maxlength="8" required placeholder="Kod" class="code-input"><p class="gate-msg" role="alert"></p><button class="primary wide">Onayla</button></form><button type="button" class="text" data-g="resend">Kodu tekrar gönder</button><button type="button" class="text" data-g="change">E-postayı değiştir</button>`;
   d.querySelector('form').onsubmit=async e=>{e.preventDefault();busy(true);try{await verify(email,new FormData(e.target).get('code').trim());await done();d.close();d.remove();resolve();}catch(err){busy(false);msg(/expired|invalid|token/i.test(err?.message||'')?'Kod hatalı ya da süresi dolmuş.':gateError(err));}};
   d.querySelector('[data-g="resend"]').onclick=async()=>{busy(true);try{await send(email);msg('Yeni kod gönderildi.');}catch(err){msg(gateError(err));}busy(false);};
   d.querySelector('[data-g="change"]').onclick=stepEmail;
   d.querySelector('input').focus();
  };
  document.body.append(d);d.showModal();stepEmail();
 });
}
function gateError(e){const m=e?.message||'';if(/already|registered|exists/i.test(m))return 'Bu e-posta başka bir hesapta kayıtlı. Başka bir e-posta dene.';if(/rate|seconds|too many/i.test(m))return 'Çok sık denedin. Biraz bekleyip tekrar dene.';if(/invalid.*email|valid email/i.test(m))return 'E-posta adresi geçersiz.';if(/not found|signups not allowed|user/i.test(m))return 'Bu e-postayla kayıtlı hesap bulunamadı.';return 'İşlem tamamlanamadı. Tekrar dene.';}
function emailGate(){
 if(!state?.account?.anonymous)return Promise.resolve();
 return codeDialog({title:'İlerlemeni kaydet',intro:'E-postanı yaz. Telefonunu değiştirsen de kaldığın yerden devam edersin.',
  send:async email=>{const {error}=await client.auth.updateUser({email});if(error)throw error;},
  verify:async(email,token)=>{const {data,error}=await client.auth.verifyOtp({email,token,type:'email_change'});if(error)throw error;if(data?.session)session=data.session;},
  done:async()=>{await loadState();}});
}

/* ---------- Karşılama, giriş ---------- */
function welcome(){
 document.body.dataset.page='welcome';
 root.innerHTML=`<section class="auth welcome"><span class="welcome-mark"><img src="app-icon.svg" alt="" width="80" height="80"></span><h1>Yapay zekayı<br>koçunla öğren.</h1><p class="muted">Kısa dersler. Her gün küçük bir adım.</p><button class="primary wide" data-action="start">Başla</button><button class="text actions" data-action="login">Hesabım var</button></section>`;
}
async function startAnonymous(){
 if(!session){const {data,error}=await client.auth.signInAnonymously({options:{data:{origin_app:'yz101'}}});if(error)throw error;session=data.session;}
 await loadState();tun={goal:null,plan:2};page=state.profile?'home':state.placement?.done?'goal':'level';
 state.profile?go('home'):render();
}
async function loginFlow(){
 await codeDialog({title:'Giriş yap',intro:'Kayıtlı e-postanı yaz, sana kod gönderelim.',
  send:async email=>{const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false}});if(error)throw error;},
  verify:async(email,token)=>{const {data,error}=await client.auth.verifyOtp({email,token,type:'email'});if(error)throw error;session=data.session;},
  done:async()=>{await loadState();}});
 page=state.profile?'home':state.placement?.done?'goal':'level';state.profile?go('home'):render();
}

/* ---------- Tünel ---------- */
let tun={goal:null,plan:2};
const tickGoals=()=>{const fs=root.querySelector('.goal-choices');if(!fs)return;const idx=[...fs.querySelectorAll('input')].findIndex(x=>x.checked);fs.querySelectorAll('.goal-choice').forEach((l,i)=>{l.classList.toggle('in',i<=idx);l.querySelector('strong').dataset.tick=idx>=0&&i<=idx?'✓':'';});root.querySelector('[data-action="goal-next"]').disabled=idx<0;};
const startIdx=()=>Math.max(0,stageLevels.indexOf(state?.placement?.result||'Başlangıç'));
const goalsAvail=()=>goals.slice(startIdx());
function afterLevel(){const g=goalsAvail();if(g.length===1)tun.goal=g[0];page=g.length===1?'plan':'goal';render();window.scrollTo(0,0);}
function goalScreen(){
 root.innerHTML=`<section class="card auth"><span class="eyebrow">Hedefin</span><h1>Yapay zekayla ne yapmak istiyorsun?</h1><fieldset class="goal-choices">${goalsAvail().map(g=>`<label class="goal-choice"><input type="radio" name="goal" value="${g}" ${tun.goal===g?'checked':''}><span><strong>${g}${g==='Üretmek'?' <em class="pill">Önerilen</em>':''}</strong><small class="muted">${goalInfo[g]}</small></span></label>`).join('')}</fieldset><button class="primary wide actions" data-action="goal-next" disabled>Devam</button></section>`;
 root.querySelector('.goal-choices').addEventListener('change',e=>{tun.goal=e.target.value;tickGoals();});tickGoals();
}
function planScreen(){
 root.innerHTML=`<section class="card auth"><span class="eyebrow">Günlük süre</span><h1>Her gün ne kadar ayırabilirsin?</h1><fieldset class="goal-choices">${Object.entries(plans).map(([k,m])=>`<label class="goal-choice"><input type="radio" name="plan" value="${k}" ${String(tun.plan)===k?'checked':''}><span><strong>Günde ${m} dakika</strong></span></label>`).join('')}</fieldset><button class="primary wide actions" data-action="plan-next">Devam</button></section>`;
 root.querySelector('.goal-choices').addEventListener('change',e=>{tun.plan=Number(e.target.value);});
}
function backTarget(p){
 const done=!!state?.placement?.done,single=goalsAvail().length===1;
 if(p==='goal')return done?null:'level';
 if(p==='plan')return single?(done?null:'level'):'goal';
 if(p==='journey-intro')return 'plan';
 if(p==='invite')return 'journey-intro';
 if(p==='place')return 'level';
 return null;
}
const backBtn=p=>backTarget(p)?'<button type="button" class="back-btn" data-action="back" aria-label="Geri"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>':'';
function levelScreen(){
 root.innerHTML=`<section class="auth level"><span class="eyebrow">Seviyen</span><h1>Nereden başlayalım?</h1><div class="btn-row"><button class="secondary" data-action="level-skip">Baştan başlayacağım</button><button class="primary" data-action="placement">Seviyemi AI Koçu belirlesin</button></div></section>`;
}
function roadmap(){
 const gi=goals.indexOf(state.profile.goal),total=goalCount();
 const lv=stageLevels.slice(0,gi+1).map(level=>{const items=COURSE.filter(c=>c.level===level&&c.n<=total),done=items.filter(c=>row(c.id)?.completed).length;return {level,count:items.length,done};});
 const cur=lv.findIndex(x=>x.done<x.count);
 const stops=lv.map((x,i)=>{const st=x.done>=x.count?'done':i===cur?'current':'upcoming';return `<li class="${st}"><span class="dot">${st==='done'?'✓':''}</span><div><strong>${x.level}</strong><small>${st==='done'?'Tamamlandı':`${x.count-x.done} ders kaldı`}</small></div></li>`;}).join('');
 return `<ol class="roadmap">${stops}<li class="goal-stop"><span class="dot">🏁</span><div><strong>${esc(state.profile.goal)}</strong><small>Hedefin</small></div></li></ol>`;
}
function journeyIntro(){
 root.innerHTML=`<section class="card auth"><span class="eyebrow">Yolculuğun</span><h1>Yaklaşık ${weeksLeft()} hafta</h1><p class="muted">Günde ${plans[state.profile.daily_plan]||20} dakikayla hedefine ulaşırsın.</p>${roadmap()}<button class="primary wide actions" data-action="journey-next">Devam</button></section>`;
}
function inviteScreen(){
 const n=nextLesson();
 if(!n){root.innerHTML=`<section class="card auth"><h1>Dersler hazırlanıyor.</h1><p class="muted">Yeni dersler hazır olunca burada olacak.</p><button class="primary wide actions" data-action="to-home">Devam</button></section>`;return;}
 root.innerHTML=`<section class="card auth"><span class="eyebrow">İlk ders</span><h1>${esc(titleOf(n.task_id))}</h1><p>Buradan başlıyoruz. Bildiğin bir konuysa doğrudan teste geçebilirsin.</p><button class="primary wide actions" data-lesson="${n.task_id}" data-mode="lesson">Anlat</button><button class="secondary wide" data-lesson="${n.task_id}" data-mode="testout">Teste hazırım</button><button class="secondary wide" data-action="invite-list" data-task="${n.task_id}">Ders listeme ekle</button></section>`;
}

/* ---------- Seviye testi ---------- */
let pl=null;
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const stageLevels=['Başlangıç','Orta','İleri'];
function buildPlacement(stage){
 const level=stageLevels[stage-1]||'İleri';
 const pool=LESSONS.filter(l=>l.level===level&&row(l.id)?.published);
 const items=shuffle(pool).slice(0,4).map(l=>{const q=Math.floor(Math.random()*l.questions.length);return {task:l.id,q,prompt:l.questions[q].prompt,options:l.questions[q].options};});
 pl={stage,items,i:0,answers:[]};
}
async function submitPlacement(){
 const r=await client.rpc('yz101_placement',{p_stage:pl.stage,p_answers:pl.answers});if(r.error)throw r.error;const x=r.data;
 if(!x.done&&x.next){buildPlacement(x.next);if(!pl.items.length){await submitPlacement();return;}placementQuestion();return;}
 await loadState();pl=null;placementResult(x);
}
function placementQuestion(){
 const it=pl.items[pl.i];
 root.innerHTML=`<section class="card auth"><span class="eyebrow">Soru ${pl.i+1}</span><h1>${esc(it.prompt)}</h1><div class="options">${it.options.map((o,k)=>`<button class="option-btn" data-pa="${k}">${esc(o)}</button>`).join('')}<button class="text" data-pa="-1">Bilmiyorum</button></div></section>`;
 root.insertAdjacentHTML('afterbegin',backBtn('place'));
}
async function placementAnswer(k){
 const it=pl.items[pl.i];pl.answers.push({task:it.task,q:it.q,a:k<0?null:k});pl.i++;
 if(pl.i<pl.items.length){placementQuestion();window.scrollTo(0,0);return;}
 root.innerHTML='<section class="card auth"><p>Sonuç hazırlanıyor…</p></section>';await submitPlacement();
}
function placementResult(x){
 const lvl=x.result_level,pts=x.points??(lvl==='Orta'?100:0);
 const copy=lvl==='Orta'?['Başlangıç derslerine ihtiyacın yok.',`+${pts} puan`,'Seni Orta seviyeden başlatıyorum.']:lvl==='İleri'?['Başlangıç ve Orta derslerine ihtiyacın yok.',`+${pts} puan`,'Seni İleri seviyeden başlatıyorum.']:['Temelden başlıyoruz.','','Zor olmayacak.'];
 page='place-result';
 root.innerHTML=`<section class="card auth"><span class="eyebrow">Seviyen</span><h1>${esc(lvl||'Başlangıç')}</h1><p>${esc(copy[0])}</p>${copy[1]?`<p class="lesson-reward">${esc(copy[1])}</p>`:''}<p>${esc(copy[2])}</p><button class="primary wide actions" data-action="place-next">Devam</button></section>`;
}

/* ---------- Kutlama ve program ---------- */
function celebrateScreen(points){
 page='celebrate';
 root.innerHTML=`<section class="card auth"><p class="celebrate-mark" aria-hidden="true">🎉</p><h1>İlk dersin tamam!</h1><p class="lesson-reward">+${points} puan</p><p class="muted">İlk adım en zoru. Devam ediyoruz.</p>${navigator.share?'<button class="secondary wide" data-action="share">Arkadaşlarınla paylaş</button>':''}<button class="primary wide actions" data-action="celebrate-next">Devam</button></section>`;
}
function programScreen(){
 page='program';
 root.innerHTML=`<section class="card auth"><span class="eyebrow">Programın</span><h1>Programın hazır</h1><p>🌙 <b>20:00</b> · Günün dersi</p><ol class="setup-list"><li><b>Hatırlatmaları aç</b><p class="muted">Dersin zamanı gelince haber verelim.</p><a class="button secondary" href="bildirimler.html">Hatırlatmaları aç</a></li>${isStandalone()?'':`<li><b>Ana ekranına ekle</b><p class="muted">Dersine hızlı ulaş.</p>${installBody()}</li>`}</ol><button class="primary wide actions" data-action="to-home">Başla</button></section>`;
}
/* ---------- Bugün ---------- */
function greetingLine(){const h=new Date().getHours();return h>=5&&h<12?'Günaydın.':h<18?'İyi günler.':'İyi akşamlar.';}
function homeView(){
 const u=state.profile,a=state.access,n=nextLesson(),lk=nextLocked();
 let card;
 if(a.daily_reached&&!a.premium&&!a.bypass)card=`<h2>Bugünlük tamam.</h2><p class="muted">Bugünkü 3 dersini bitirdin. Yarın devam ediyoruz.</p>`;
 else if(n)card=`<h2>${esc(titleOf(n.task_id))}</h2><p class="muted">${n.listed?'Listendeki ders. Hazırsan başlayalım.':'Bugünün dersi hazır. Başlayalım.'}</p><button class="primary wide" data-lesson="${n.task_id}" data-mode="lesson">Başla</button>`;
 else if(lk)card=`<h2>Sıradaki ders kilitli.</h2><p class="muted">Tekrar denemene kalan süre: ${clock(lk.locked_until)}</p>`;
 else card=`<h2>Yeni dersler hazırlanıyor.</h2><p class="muted">Hazır olunca burada göreceksin.</p>`;
 const listed=rows().filter(r=>r.listed&&!r.completed&&r.published);
 const done=Math.min(doneCount(),goalCount());
 return `<section class="today-head"><h1>Merhaba, ${esc(u.username)}</h1><span class="pill">${esc(state.points)} puan</span></section>
 <section class="card coach-card"><span class="eyebrow">Koç · ${greetingLine()}</span>${card}</section>
 <section class="card program-card"><strong>Bugün</strong><p>${a.daily_done>0?'✓':'○'} Günün dersi <span class="muted">· 20:00</span></p></section>
 ${listed.length?`<section class="card"><strong>Ders listem</strong><div class="list-rows">${listed.map(r=>`<button class="settings-row" data-lesson="${r.task_id}" data-mode="lesson">${esc(titleOf(r.task_id))} <span>›</span></button>`).join('')}</div></section>`:''}
 <section class="card"><strong>Yolculuğun</strong><p class="muted">${done}/${goalCount()} ders · ${esc(u.goal)}</p><progress max="${goalCount()}" value="${done}"></progress><button class="text" data-page="journey">Yolculuğumu gör</button></section>`;
}
function journeyView(){
 const lv=stageLevels.slice(0,goals.indexOf(state.profile.goal)+1);
 return `<h1>Yolculuğum</h1><p class="muted">Hedefin: ${esc(state.profile.goal)} · yaklaşık ${weeksLeft()} hafta</p>${lv.map(level=>{const items=COURSE.filter(c=>c.level===level&&c.n<=goalCount()),c=items.filter(i=>row(i.id)?.completed).length;return `<section class="card"><strong>${level}</strong> <span class="muted">${c}/${items.length}</span><div class="list-rows">${items.map(i=>{const r=row(i.id),can=r?.published;return `<button class="settings-row" ${can?`data-lesson="${i.id}" data-mode="lesson"`:'disabled'}>${r?.completed?'✓':can?'○':'·'} ${esc(i.title)} <span>${can?'›':'Yakında'}</span></button>`;}).join('')}</div></section>`;}).join('')}`;
}
function profileView(){
 const u=state.profile,anon=state.account?.anonymous;
 return `<h1>Profilim</h1><section class="profile-head"><button type="button" class="avatar large" data-action="choose-mascot" aria-label="Maskot seç" aria-expanded="false" aria-controls="mascot-options">${mascot(avatarId())}</button><div class="profile-identity"><button class="editable-name" data-action="edit-name" aria-label="Kullanıcı adını düzenle" aria-expanded="false" aria-controls="name-editor">${esc(u.username)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z"/></svg></button><div class="identity-meta"><span class="points">${esc(state.points)} puan</span></div></div></section>
 <form id="profile-form" class="inline-editor" hidden><label>Kullanıcı adı<input id="name-editor" name="username" value="${esc(u.username)}" required minlength="2" maxlength="40" autocomplete="nickname"></label><div class="row"><button class="primary">Kaydet</button><button type="button" class="secondary" data-action="cancel-name">Vazgeç</button></div></form>
 <div class="mascot-picker" id="mascot-options" hidden><div class="mascot-options">${Object.entries(mascots).map(([id,m])=>`<button type="button" data-mascot="${id}" aria-label="${m.name}" aria-pressed="${avatarId()===id}">${mascot(id)}<small>${m.name}</small></button>`).join('')}</div></div>
 ${anon?`<section class="card install-card"><strong>İlerlemeni kaydet</strong><p class="muted">E-posta ekle; telefon değiştirsen de kaldığın yerden devam et.</p><button class="primary wide" data-action="save-email">E-posta ekle</button></section>`:''}
 <section class="settings"><details class="goal-picker"><summary><span>Öğrenme hedefi</span><strong>${esc(u.goal)}</strong></summary><div class="goal-options" role="group">${goals.map(g=>`<button type="button" data-goal="${g}" aria-pressed="${goals.indexOf(g)<=goals.indexOf(u.goal)}">${g}${goals.indexOf(g)<=goals.indexOf(u.goal)?' ✓':''}</button>`).join('')}</div></details>
 <details class="goal-picker"><summary><span>Günlük süre</span><strong>${plans[u.daily_plan]||20} dk</strong></summary><div class="goal-options" role="group">${Object.entries(plans).map(([k,m])=>`<button type="button" data-plan="${k}" aria-pressed="${Number(k)===u.daily_plan}">${m} dk</button>`).join('')}</div></details>
 <a class="settings-link" href="bildirimler.html">Bildirimler <span>›</span></a><a class="settings-link" href="gizlilik-politikasi.html">Gizlilik Politikası <span>›</span></a><a class="settings-link" href="kullanim-kosullari.html">Kullanım Koşulları <span>›</span></a><a class="settings-link" href="mailto:all.apps.nora@gmail.com">Yardım ve iletişim <span>↗</span></a>${anon?'':'<button data-action="logout">Çıkış yap <span>↗</span></button>'}</section>${installCard(false)}`;
}

/* ---------- Çizim ---------- */
function render(){
 clearInterval(countdownTimer);document.body.dataset.page=page;
 if(!session||!state){welcome();return;}
 if(!state.profile&&!['goal','plan','level','journey-intro','place','place-result'].includes(page))page=state.placement?.done?'goal':'level';
 const tunnel={goal:goalScreen,plan:planScreen,level:levelScreen,'journey-intro':journeyIntro,invite:inviteScreen,program:programScreen};
 if(tunnel[page]){tunnel[page]();root.insertAdjacentHTML('afterbegin',backBtn(page));return;}
 if(['place','place-result','celebrate','lesson'].includes(page))return;
 const v={home:homeView,journey:journeyView,profile:profileView}[page]||homeView;
 root.innerHTML=v()+nav();
 const els=[...root.querySelectorAll('.countdown')];
 if(els.length){let fired=false;const tick=()=>{for(const el of els){const s=Math.max(0,Math.ceil((Date.parse(el.dataset.until)-nowMs())/1000));el.textContent=[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':');if(s===0&&!fired){fired=true;clearInterval(countdownTimer);loadState().then(render).catch(()=>{});}}};tick();countdownTimer=setInterval(tick,1000);}
}

/* ---------- Ders ekranı ---------- */
const lessonView=window.createYZ101LessonView({client,root,getUser:()=>session?.user,getState:()=>state,refresh:loadState,notify,
 onExit:()=>go('home'),
 gate:()=>emailGate(),
 onCompleted:async(task,info)=>{
  await loadState();
  let first=false;try{first=!localStorage.getItem(firstKey());if(first)localStorage.setItem(firstKey(),'1');}catch{}
  if(first){celebrateScreen(info.points);window.scrollTo(0,0);}else go('home');
 },
 onList:async task=>{try{await emailGate();await coach('list_add',{task});await loadState();go('home');notify('Dersi listene ekledim.');}catch(e){failure(e);}}
});
function openLesson(id,mode){
 if(!rows().some(r=>r.task_id===id&&r.published)){notify('Bu ders henüz hazır değil.');return;}
 page='lesson';history.pushState({yz101:true,page:'lesson'},'',location.pathname);
 if(!lessonView.open(id,{mode})){page='home';render();}
 window.scrollTo(0,0);
}

/* ---------- Olaylar ---------- */
async function execute(task,element){if(working||lessonView.busy())return;working=true;const bs=element?.querySelectorAll?.('button')||[];bs.forEach(b=>b.disabled=true);try{await task();}catch(e){failure(e);}finally{working=false;bs.forEach(b=>{if(b.isConnected)b.disabled=false;});}}
root.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b||b.closest('[data-lesson-view]')||b.type==='submit'&&b.closest('form'))return;
 execute(async()=>{
  const d=b.dataset;
  if(d.pa!==undefined){await placementAnswer(Number(d.pa));return;}
  if(d.lesson){openLesson(d.lesson,d.mode||'lesson');return;}
  if(d.page){go(d.page);return;}
  if(d.goal){await coach('profile',{goal:d.goal});await loadState();render();notify('Hedefin güncellendi.');return;}
  if(d.plan){await coach('profile',{plan:Number(d.plan)});await loadState();render();notify('Günlük süren güncellendi.');return;}
  if(d.mascot){if(!mascots[d.mascot])return;const {data,error}=await client.auth.updateUser({data:{yz101_mascot:d.mascot}});if(error)throw error;session={...session,user:data.user};render();return;}
  const a=d.action;
  if(a==='start'){await startAnonymous();return;}
  if(a==='login'){await loginFlow();return;}
  if(a==='goal-next'){if(!tun.goal)return;page='plan';render();window.scrollTo(0,0);return;}
  if(a==='plan-next'){await coach('start',{goal:tun.goal,plan:tun.plan});await loadState();page='journey-intro';render();window.scrollTo(0,0);return;}
  if(a==='back'){const t=backTarget(page);if(t){if(page==='place')pl=null;page=t;render();window.scrollTo(0,0);}return;}
  if(a==='level-skip'){afterLevel();return;}
  if(a==='journey-next'){page='invite';render();window.scrollTo(0,0);return;}
  if(a==='invite-list'){await emailGate();await coach('list_add',{task:d.task});await loadState();go('home');return;}
  if(a==='placement'){buildPlacement(1);if(!pl.items.length){notify('Seviye testi şu an hazır değil.');return;}page='place';placementQuestion();window.scrollTo(0,0);return;}
  if(a==='place-next'){afterLevel();return;}
  if(a==='share'){try{await navigator.share({title:'AI Koçu',text:'AI Koçu ile yapay zekayı öğrenmeye başladım. Hedefim: '+state.profile.goal,url:location.origin+location.pathname});}catch{}return;}
  if(a==='celebrate-next'){programScreen();window.scrollTo(0,0);return;}
  if(a==='to-home'){go('home');return;}
  if(a==='save-email'){await emailGate();render();return;}
  if(a==='edit-name'||a==='cancel-name'){const f=document.querySelector('#profile-form');f.hidden=a==='cancel-name'||!f.hidden;document.querySelector('[data-action="edit-name"]').setAttribute('aria-expanded',String(!f.hidden));if(!f.hidden){const i=document.querySelector('#name-editor');i.focus();i.select();}return;}
  if(a==='choose-mascot'){const p=document.querySelector('#mascot-options');p.hidden=!p.hidden;b.setAttribute('aria-expanded',String(!p.hidden));return;}
  if(a==='install'){if(deferredInstall){deferredInstall.prompt();try{await deferredInstall.userChoice;}catch{}deferredInstall=null;}return;}
  if(a==='logout'){await detachPush();await client.auth.signOut({scope:'local'});session=null;state=null;page='home';welcome();}
 },b.parentElement);
});
root.addEventListener('submit',event=>{
 if(event.target.closest('[data-lesson-view]'))return;event.preventDefault();const form=event.target,values=Object.fromEntries(new FormData(form));
 execute(async()=>{if(form.id==='profile-form'){await coach('profile',{username:values.username});await loadState();render();notify('Profilin kaydedildi.');}},form);
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;if(page==='program')programScreen();});
window.addEventListener('appinstalled',()=>{deferredInstall=null;if(page==='program')programScreen();});

async function init(){
 if(!client)throw Error('Uygulama bağlantısı yüklenemedi. Sayfayı yenile.');
 client.auth.onAuthStateChange((event,s)=>{session=s;if(event==='SIGNED_OUT'){lessonView.reset();state=null;if(!working){page='home';welcome();}}});
 const {data,error}=await client.auth.getSession();if(error)throw error;session=data.session;
 if(!session){welcome();return;}
 await loadState();
 history.replaceState({yz101:true,page:'home'},'',location.pathname);
 page=state.profile?'home':state.placement?.done?'goal':'level';render();
}
init().catch(e=>{root.innerHTML='<section class="card auth"><h1>Bağlantı kurulamadı.</h1><p>Sayfayı yenileyerek tekrar deneyebilirsin.</p><a class="button" href="./">Yenile</a></section>';failure(e);});
try{const clr=()=>{if(document.visibilityState==='visible'&&navigator.clearAppBadge)navigator.clearAppBadge().catch(()=>{});};document.addEventListener('visibilitychange',clr);clr();}catch{}
document.addEventListener('click',e=>{const d=e.target;if(!(d instanceof HTMLDialogElement)||!d.open||d.classList.contains('gate'))return;const r=d.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)return;const ev=new Event('cancel',{cancelable:true});d.dispatchEvent(ev);if(d.open&&!ev.defaultPrevented)d.close();});
