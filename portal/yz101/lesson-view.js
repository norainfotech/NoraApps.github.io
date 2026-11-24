// AI Koçu ders ekranı: Öğren → Uygula → Test, ya da "Teste hazırım" (doğrudan test).
// Kontrol hakkı ve kilit ders başınadır; tüm doğrulama sunucuda yapılır.
window.createYZ101LessonView=function(opts){
 const $=s=>document.querySelector(s),client=opts.client;
 const mentor=window.createYZ101Mentor({client,getUser:opts.getUser});
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let user=null,taskId=null,mode='lesson',access={},info={},drafts={},stage=0,busy=false,serverOffset=0,expiryRefreshing=false;
 const lessonOf=()=>LESSONS.find(l=>l.id===taskId);
 const remaining=()=>Math.max(0,new Date(access.cooldown_until||0).getTime()-Date.now()-serverOffset);
 const locked=()=>remaining()>0;
 const pad=n=>String(n).padStart(2,'0');
 function setAccess(a){if(!a)return;access=a;serverOffset=new Date(a.server_now).getTime()-Date.now();}
 function notice(text=''){const el=$('#lesson-notice');if(el)el.textContent=text;}
 function sync(){
  const s=opts.getState();if(!s)return;
  const row=(s.lessons||[]).find(x=>x.task_id===taskId)||{};
  info=row;
  serverOffset=new Date(s.server_now).getTime()-Date.now();
  access={premium:s.access?.premium,bypass:s.access?.bypass,attempts_remaining:row.attempts_remaining,cooldown_until:row.locked_until,reason:row.locked_until?'retry':null,server_now:s.server_now};
 }
 async function loadState(){await opts.refresh();sync();}
 function timerMarkup(){return locked()?`<div class="lesson-timer">Tekrar denemek için kalan süre<strong data-countdown></strong></div>`:'';}
 function ensureDialog(){if($('#result-dialog'))return;const d=document.createElement('dialog');d.id='result-dialog';d.className='app-result-dialog';d.setAttribute('aria-labelledby','result-title');d.innerHTML='<h2 id="result-title"></h2><div id="result-body"></div><button class="primary wide" id="result-action"></button><button class="secondary wide" id="result-secondary" hidden></button>';document.body.append(d);}
 function tick(){
  if(!document.querySelector('[data-lesson-view]')&&!$('#result-dialog')?.open)return;
  document.querySelectorAll('[data-countdown]').forEach(el=>{const sec=Math.ceil(remaining()/1000);el.textContent=[Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(pad).join(':');});
  if(access.cooldown_until&&!locked()&&!busy&&!expiryRefreshing&&document.querySelector('[data-lesson-view]')){expiryRefreshing=true;loadState().then(renderLesson).catch(()=>notice('Süre bilgisi yenilenemedi.')).finally(()=>expiryRefreshing=false);}
 }
 function modal(title,body,button,action,o={}){
  ensureDialog();const dialog=$('#result-dialog'),sec=$('#result-secondary');dialog.dataset.res='';
  if(o.tone)dialog.dataset.tone=o.tone;else delete dialog.dataset.tone;
  $('#result-title').textContent=title;$('#result-body').innerHTML=body;$('#result-action').textContent=button;
  $('#result-action').onclick=()=>{dialog.dataset.res='primary';dialog.close();};
  sec.hidden=!o.secondary;
  if(o.secondary){sec.textContent=o.secondary;sec.onclick=()=>{dialog.dataset.res='secondary';dialog.close();};}
  dialog.onclose=()=>{dialog.onclose=null;sec.hidden=true;const res=dialog.dataset.res;if(o.onlyPrimary&&res!=='primary')return;if(res==='secondary'&&o.onSecondary){o.onSecondary();return;}action?.();};
  if(!dialog.open)dialog.showModal();tick();
 }
 let testPage=0;
 function testPages(l,d){const idx=d.retry?d.retry.q:l.questions.map((_,i)=>i);const p=idx.map(q=>({q}));if(l.numericExercise&&(!d.retry||d.retry.num))p.push({num:true});return p;}
 function pageAnswered(l,d,pg){return pg.num?d.numeric!==undefined&&d.numeric!==''&&Number.isFinite(Number(d.numeric)):d.answers?.[pg.q]!==undefined;}
 function showHome(){if(busy)return;keepDraft();opts.onExit();}
 function keepDraft(){
  const l=lessonOf();if(!l)return;const d=drafts[l.id]||{};
  if($('#response'))d.answer=$('#response').value;
  if($('#quiz-form')){d.answers=Array.from({length:3},(_,i)=>d.answers?.[i]);document.querySelectorAll('#quiz-form fieldset[data-q]').forEach(f=>{d.answers[Number(f.dataset.q)]=f.querySelector('input:checked')?.value;});if($('#numeric'))d.numeric=$('#numeric').value;}
  drafts[l.id]=d;
 }
 function goStage(n){if(busy)return;keepDraft();stage=n;testPage=0;renderLesson();window.scrollTo({top:0,left:0,behavior:'instant'});}
 function feedbackMarkup(f){return `<div class="feedback ${f.passed?'':'error'}"><strong>${f.passed?'Yeterli':'Henüz olmadı'}</strong><p>${esc(f.feedback)}</p></div>`;}
 function rowsMarkup(flags,numeric,l){return flags.map((ok,i)=>`<div class="result-row"><span>${i+1}. soru</span><strong class="${ok?'pass':'fail'}">${ok?'Doğru':'Yanlış'}</strong></div>`).join('')+(l.numericExercise&&numeric!=null?`<div class="result-row"><span>Sayısal uygulama</span><strong class="${numeric?'pass':'fail'}">${numeric?'Doğru':'Yanlış'}</strong></div>`:'');}

 function renderLesson(){
  const l=lessonOf(),d=drafts[l.id]||{},done=info.completed,aiOk=info.ai_passed;let content='';
  const testout=mode==='testout'&&!done;
  if(stage===0){
   content=`${String(l.concept).split('\n').filter(Boolean).map(t=>`<p>${esc(t)}</p>`).join('')}<div class="example"><h3>${esc(l.exampleTitle||'Örnek')}</h3><p style="margin:0">${esc(l.example)}</p></div><p class="warning"><strong>Yaygın hata</strong>${esc(l.pitfall)}</p>${done?'':`<div class="actions"><button id="learned" ${locked()?'disabled':''}>Devam et</button></div>`}`;
  }else if(stage===1){
   content=`<h2>Uygula</h2><p>${esc(l.task)}</p><p class="hint">${esc(l.practiceGuidance)}</p><label for="response">Yanıtın</label><textarea id="response" minlength="40" maxlength="1600" ${done||aiOk?'readonly':''}>${esc(d.answer||'')}</textarea><div class="field-row"><span class="field-info">Yapay zeka yanıtını değerlendirir.${!done&&!aiOk&&!access.bypass&&access.attempts_remaining!=null?` ${access.attempts_remaining} kontrol hakkın var.`:''}</span><span class="char-count" id="char-count" aria-live="off"></span></div><div id="ai-feedback" aria-live="polite">${d.feedback?feedbackMarkup(d.feedback):aiOk?'<div class="feedback"><strong>Yeterli</strong></div>':''}</div><div class="actions">${aiOk?`<button id="to-test" ${done||locked()?'disabled':''}>Teste geç</button>`:`<button id="ai-check" ${locked()?'disabled':''}>Kontrol et</button>`}<aside class="mentor-access"><button id="mentor-open" class="mentor-open" type="button"><span class="mentor-spark" aria-hidden="true">✦</span><span>Koçuna sor<small>PREMIUM</small></span><span class="mentor-arrow" aria-hidden="true">↗</span></button></aside></div>`;
  }else{
   const pages=testPages(l,d),n=pages.length,p=Math.min(testPage,n-1),pg=pages[p],last=p===n-1,ok=pageAnswered(l,d,pg);
   const body=pg.num?`<div class="numeric"><label for="numeric">${esc(l.numericExercise.prompt)}</label><input id="numeric" type="number" step="any" inputmode="decimal" value="${esc(d.numeric||'')}" ${done?'disabled':''}></div>`:`<fieldset class="question" data-q="${pg.q}"><legend>${esc(l.questions[pg.q].prompt)}</legend>${l.questions[pg.q].options.map((o,j)=>`<label class="choice"><input type="radio" name="q${pg.q}" value="${j}" ${String(d.answers?.[pg.q])===String(j)?'checked':''} ${done?'disabled':''}><span>${esc(o)}</span></label>`).join('')}</fieldset>`;
   const label=d.retry?'Tekrar dene':pg.num?'Uygulama':'Soru';
   content=`<h2>${testout?'Kısa test':'Öğrendiklerini kontrol et'}</h2><form id="quiz-form" novalidate><div class="test-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${p+1}"><span>${label} ${p+1}/${n}</span><div class="bar"><i style="width:${Math.round((p+1)/n*100)}%"></i></div></div>${body}<div class="btn-row test-nav"><button type="button" class="secondary" id="test-prev" ${p===0?'disabled':''}>Önceki</button>${last?(done?'':`<button id="test-submit" type="submit" class="primary" ${!ok||locked()||(!aiOk&&!testout)?'disabled':''}>${testout?'Testi bitir':'Testi tamamla'}</button>`):`<button type="button" class="primary" id="test-next" ${ok?'':'disabled'}>Sonraki</button>`}</div></form>`;
  }
  const steps=testout?'':`<nav class="lesson-steps" aria-label="Ders aşamaları">${['Öğren','Uygula','Test'].map((name,i)=>`<button data-stage="${i}" class="${stage===i?'active':''}" ${stage===i?'aria-current="step"':''} ${i===2&&!aiOk?'disabled':''}>${i+1} ${name}</button>`).join('')}</nav>`;
  $('#lesson').innerHTML=`<div class="lesson-meta"><span class="eyebrow">${esc(({'Başlangıç':'Anlamak','Orta':'Kullanmak','İleri':'Üretmek'})[l.level]||l.level)}${done?' · Tamamlandı ✓':''}</span></div><h1>${esc(l.title)}</h1><p class="goal">${esc(l.objective)}</p>${steps}${timerMarkup()}<section class="card lesson-detail">${content}</section>`;
  document.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>goStage(Number(b.dataset.stage)));
  if($('#learned'))$('#learned').onclick=()=>goStage(1);
  if($('#to-test'))$('#to-test').onclick=()=>goStage(2);
  if($('#ai-check'))$('#ai-check').onclick=()=>checkAnswer();
  if($('#response')){const c=()=>{const n=$('#response').value.length;$('#char-count').textContent=n<40?`${n} / 1600 · en az 40`:`${n} / 1600`;$('#char-count').classList.toggle('low',n<40);};$('#response').addEventListener('input',c);c();}
  if($('#quiz-form')){
   const f=$('#quiz-form'),go=k=>{keepDraft();testPage=Math.max(0,testPage+k);renderLesson();window.scrollTo({top:0,left:0,behavior:'instant'});};
   f.onsubmit=submitTest;
   const upd=()=>{keepDraft();const pgs=testPages(l,drafts[l.id]||{}),pg=pgs[Math.min(testPage,pgs.length-1)],ok=pageAnswered(l,drafts[l.id]||{},pg);['#test-next','#test-submit'].forEach(q=>{if($(q))$(q).disabled=!ok||(q==='#test-submit'&&(locked()||(!aiOk&&!testout)));});};
   f.addEventListener('change',upd);f.addEventListener('input',upd);
   if($('#test-prev'))$('#test-prev').onclick=()=>go(-1);
   if($('#test-next'))$('#test-next').onclick=()=>go(1);
  }
  if($('#mentor-open'))$('#mentor-open').onclick=()=>{keepDraft();if(!(access.bypass||access.premium)){modal('Koçuna sor','<p>Takıldığın noktayı koçuna sor, yanıtındaki eksiği sana özel açıklasın. Bu özellik premium üyelikte.</p><p class="field-info">Premium üyelik satışı henüz açılmadı.</p>','Tamam');return;}mentor.open({task_id:l.id,answer:drafts[l.id]?.answer||''});};
  tick();
 }

 function limitMessage(status){
  if(status==='daily_limit'){modal('Bugünlük tamam','<p>Bugünlük 2 dersini tamamladın. Yarın kaldığın yerden devam edebilirsin.</p>','Tamam',showHome);return true;}
  return false;
 }

 async function checkAnswer(confirmed){
  if(busy||locked())return;keepDraft();
  const l=lessonOf(),owner=user?.id,answer=(drafts[l.id]?.answer||'').trim();
  if(answer.length<40||answer.length>1600){$('#ai-feedback').textContent='Yanıtın 40–1600 karakter arasında olmalı.';return;}
  if(!confirmed&&!access.bypass&&access.attempts_remaining===1){modal('Bu son kontrol hakkın',`<p>Yanıtın yeterli bulunmazsa tekrar denemek için 24 saat beklemen gerekir.</p><p class="field-info">Göndermeden önce bak: ${esc(l.practiceGuidance||'Yanıtın görevi karşılıyor mu?')} Yanıtın görevde istenen her şeyi içeriyor mu?</p>`,'Kontrol et',()=>checkAnswer(true),{secondary:'Yanıtı düzenle',onlyPrimary:true,tone:'info'});return;}
  setBusy(true);$('#ai-feedback').textContent='Kontrol ediliyor…';let message='',fresh=null,status='';
  try{
   const {data,error}=await client.functions.invoke('yz101-grade-answer',{body:{task_id:l.id,answer}});if(error)throw error;
   if(opts.getUser()?.id!==owner)return;
   status=data.status;setAccess(data.access);
   if(['evaluated','completed'].includes(data.status)&&data.feedback){drafts[l.id].feedback=data.feedback;fresh=data.feedback;await loadState();}
   else{await loadState();message=({processing:'Kontrol sürüyor. Biraz sonra tekrar dene.',budget_limit:'Kontrol hizmeti şu an yoğun. Kontrol hakkın kullanılmadı; biraz sonra tekrar dene.',daily_ai_limit:'Bugünlük kontrol sınırına ulaştın. Yarın tekrar dene.',cooldown:'',already_completed:'',daily_limit:'',disabled:'Bu dersin kontrolü şu anda kullanılamıyor.'})[data.status]??'Kontrol şu anda tamamlanamadı. Kontrol hakkın kullanılmadı.';}
  }catch{message='Kontrol tamamlanamadı. Bağlantını kontrol edip tekrar dene. Teknik hatalar kontrol hakkını tüketmez.';try{await loadState();}catch{}}
  finally{
   setBusy(false);
   if(opts.getUser()?.id===owner){
    renderLesson();
    if(limitMessage(status)){/* gösterildi */}
    else if(message)modal(/tamamlanamadı/.test(message)?'Kontrol tamamlanamadı':'Kontrol',`<p>${esc(message)}</p>`,'Tamam');
    else if(fresh){
     const fb=`<p>${esc(fresh.feedback)}</p>`;
     if(fresh.passed)modal('Uygulama görevini tamamladın.',fb,'Teste geç',async()=>{try{await opts.gate?.('after-ai');}catch{return;}goStage(2);},{tone:'success'});
     else if(locked())modal('Henüz olmadı',fb+'<p>Kontrol hakkın bitti. Bu ders 24 saat sonra yeniden açılır.</p>'+timerMarkup(),'Tamam',showHome,{tone:'error'});
     else modal('Henüz olmadı',fb+`<p class="field-info">${access.bypass?'':'Bir kontrol hakkın daha var. '}Yanıtını geliştirip tekrar kontrol et.</p>`,'Yanıtı düzenle',null,{tone:'error'});
    }else if(locked()){modal('Henüz olmadı','<p>Bu ders 24 saat sonra yeniden açılır.</p>'+timerMarkup(),'Tamam',showHome,{tone:'error'});}
   }
  }
 }

 async function submitTest(event){
  event.preventDefault();if(busy||locked())return;keepDraft();
  const l=lessonOf(),d=drafts[l.id],owner=user?.id,testout=mode==='testout'&&!info.completed;
  const answers=Array.from({length:3},(_,i)=>d.answers[i]),numeric=l.numericExercise?Number(d.numeric):null;
  const pgs=testPages(l,d),pi=pgs.findIndex(pg=>!pageAnswered(l,d,pg));
  if(pi>=0){testPage=pi;renderLesson();return;}
  answers.forEach((x,i)=>answers[i]=Number(x));
  // Aynı istek kimliği: bağlantı kopsa bile ikinci hak harcanmaz.
  const signature=JSON.stringify([testout,answers,numeric]);
  if(d.signature!==signature){d.signature=signature;d.request=crypto.randomUUID();}d.request||=crypto.randomUUID();
  setBusy(true);$('#test-submit').textContent='Kontrol ediliyor…';
  const rpc=testout?'yz101_test_out':'yz101_lesson_test';
  const args=testout?{p_task:l.id,p_answers:answers,p_numeric:numeric,p_request:d.request}:{p_task:l.id,p_answers:answers,p_numeric:numeric,p_request:d.request};
  try{
   const {data,error}=await client.rpc(rpc,args);if(error)throw error;if(opts.getUser()?.id!==owner)return;
   setAccess(data.access);
   const points=(opts.getState()?.lessons||[]).find(x=>x.task_id===l.id)?.points||10;
   await loadState();setBusy(false);renderLesson();
   if(data.status==='evaluated'){
    d.request=null;d.retry=null;
    const rows=rowsMarkup(data.answers,data.numeric_passed,l);
    if(data.passed){
     const finish=async()=>{try{await opts.gate?.('after-test');}catch{return;}opts.onCompleted?.(l.id,{points,via:testout?'test':'lesson'});};
     if(opts.skipResult?.())finish();else modal('Dersi tamamladın',`<p class="lesson-reward">+${points} puan</p>`+rows,'Devam et',finish,{tone:'success'});
    }else if(testout&&!locked()){
     modal('Birkaç nokta eksik kaldı.',`<p>Hızlıca üzerinden geçelim, 4 dakika sürer.</p>`+rows,'Dersi aç',()=>{mode='lesson';stage=0;testPage=0;d.answers=[];d.numeric='';d.retry=null;renderLesson();window.scrollTo({top:0,left:0,behavior:'instant'});},{tone:'error'});
    }else if(locked()){
     modal('Testi geçemedin',rows+'<p>Bu ders 24 saat sonra yeniden açılır.</p>'+timerMarkup(),'Tamam',showHome,{tone:'error'});
    }else{
     modal('Testi geçemedin',rows,'Tekrar dene',()=>{const q=data.answers.map((ok,i)=>ok?-1:i).filter(i=>i>=0),num=!!l.numericExercise&&!data.numeric_passed;d.retry={q,num};q.forEach(i=>{d.answers[i]=undefined;});if(num)d.numeric='';testPage=0;renderLesson();},{tone:'error'});
    }
   }else if(data.status==='cooldown'){modal('Henüz olmadı','<p>Tekrar denemek için biraz beklemen gerekiyor.</p>'+timerMarkup(),'Tamam',showHome);}
   else if(data.status==='already_completed')showHome();
   else if(limitMessage(data.status)){/* gösterildi */}
   else notice(({ai_required:'Önce açık uçlu yanıtını kontrol et.',incomplete:'Tüm soruları yanıtla.'})[data.status]||'Test tamamlanamadı. Tekrar dene.');
  }catch{if(opts.getUser()?.id===owner)notice('Sonuç alınamadı. Aynı yanıtlarla tekrar dene; kaydedilmiş bir sonuç ikinci hak tüketmez.');}
  finally{setBusy(false);if(opts.getUser()?.id===owner&&$('#lesson')&&!$('#result-dialog')?.open)renderLesson();}
 }
 function setBusy(value){busy=value;document.querySelectorAll('#lesson button').forEach(b=>{if(value)b.disabled=true;});}
 setInterval(tick,1000);
 return {
  busy:()=>busy,
  keepDraft,
  reset(){mentor.close();drafts={};user=null;taskId=null;info={};access={};$('#result-dialog')?.remove();},
  // mode: 'lesson' (Öğren ile başla) | 'testout' (Teste hazırım)
  open(id,o={}){
   if(busy)return false;const nextUser=opts.getUser();if(user?.id!==nextUser?.id)drafts={};user=nextUser;
   const meta=LESSONS.find(l=>l.id===id);if(!meta)return false;
   taskId=id;mode=o.mode||'lesson';testPage=0;sync();
   const s=opts.getState();
   if(!info.completed&&s?.access?.daily_reached&&!s.access.premium&&!s.access.bypass){opts.root.innerHTML='<section data-lesson-view><div id="lesson-notice"></div><div id="lesson"></div></section>';limitMessage('daily_limit');return true;}
   if(locked()&&!info.completed){opts.root.innerHTML='<section data-lesson-view><div id="lesson-notice"></div><div id="lesson"></div></section>';modal('Henüz olmadı','<p>Tekrar denemek için biraz beklemen gerekiyor.</p>'+timerMarkup(),'Tamam',showHome);return true;}
   stage=mode==='testout'&&!info.completed?2:(info.ai_passed&&!info.completed?2:0);
   opts.root.innerHTML='<section data-lesson-view><div id="lesson-notice" role="status"></div><div id="lesson"></div></section>';renderLesson();return true;
  }
 };
};
