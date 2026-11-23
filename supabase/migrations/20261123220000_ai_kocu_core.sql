-- AI Koçu çekirdeği: ders başına hak/kilit, seviyeye göre puan, "Teste hazırım", seviye testi, koç RPC.
-- Yalnız yz101 şeması ve yz101_* fonksiyonları; NoWord'e dokunmaz.

-- 1) Ders kataloğu (sunucu tarafı gerçek kaynak)
create table if not exists yz101.lessons(
  task_id text primary key,
  level text not null check (level in ('Başlangıç','Orta','İleri')),
  ord integer not null unique,
  points integer not null check (points in (10,15,20)),
  published boolean not null default false
);
alter table yz101.lessons enable row level security;
insert into yz101.lessons(task_id,level,ord,points,published)
select 'P'||lpad(n::text,2,'0'),
  case when n<=10 then 'Başlangıç' when n<=30 then 'Orta' else 'İleri' end, n,
  case when n<=10 then 10 when n<=30 then 15 else 20 end,
  exists(select 1 from yz101.pilot_answer_keys k where k.task_id='P'||lpad(n::text,2,'0'))
from generate_series(1,60) n on conflict (task_id) do nothing;

-- 2) Kullanıcı başına ders durumu (kontrol hakkı, 24 saat kilidi, liste, teste hazırım)
create table if not exists yz101.lesson_state(
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null references yz101.lessons(task_id),
  failures integer not null default 0,
  locked_until timestamptz,
  reason text,
  cycle integer not null default 0,
  listed boolean not null default false,
  testout_used boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id,task_id)
);
alter table yz101.lesson_state enable row level security;

-- 3) Seviye testi kaydı (kullanıcı başına tek sefer)
create table if not exists yz101.placement(
  user_id uuid primary key references auth.users(id) on delete cascade,
  stage1_correct integer,
  stage2_correct integer,
  result_level text check (result_level in ('Başlangıç','Orta','İleri')),
  skipped integer not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
alter table yz101.placement enable row level security;

-- 4) Mevcut tablolara eklemeler
alter table yz101.pilot_progress add column if not exists via text not null default 'lesson';
alter table yz101.pilot_progress drop constraint if exists pilot_progress_via_check;
alter table yz101.pilot_progress add constraint pilot_progress_via_check check (via in ('lesson','test','placement'));
alter table yz101.users add column if not exists daily_plan smallint;
alter table yz101.users drop constraint if exists users_daily_plan_check;
alter table yz101.users add constraint users_daily_plan_check check (daily_plan is null or daily_plan between 1 and 3);

alter table yz101.scores drop constraint if exists scores_pilot_reward_check;
alter table yz101.scores add constraint scores_pilot_reward_check check (
  pilot_task_id is null or (user_id is not null and points in (10,15,20)
    and type in ('pilot_lesson','pilot_lesson_test','placement_skip')));

-- 5) Puan: seviyeye göre
create or replace function yz101.award_pilot_lesson_points() returns trigger
language plpgsql security definer set search_path='' as $$
declare pts integer;
begin
  if new.completed then
    select points into pts from yz101.lessons where task_id=new.task_id;
    insert into yz101.scores(user_id,points,type,pilot_task_id)
    values(new.user_id,coalesce(pts,10),
      case new.via when 'test' then 'pilot_lesson_test' when 'placement' then 'placement_skip' else 'pilot_lesson' end,
      new.task_id)
    on conflict(user_id,pilot_task_id) where pilot_task_id is not null do nothing;
  end if;
  return new;
end $$;

create or replace function yz101.cleanup_profile_lessons() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from yz101.lesson_submissions where user_id=old.id;
  delete from yz101.lesson_access where user_id=old.id;
  delete from yz101.lesson_state where user_id=old.id;
  delete from yz101.placement where user_id=old.id;
  delete from yz101.ai_evaluation_requests where user_id=old.id;
  delete from yz101.pilot_progress where user_id=old.id;
  return old;
end $$;

-- 6) Otomatik kullanıcı adı
create or replace function yz101.make_username() returns text
language plpgsql security definer set search_path='' as $$
declare
  a text[]:=array['Meraklı','Çevik','Parlak','Sessiz','Bilge','Cesur','Neşeli','Atılgan','Zeki','Sakin'];
  b text[]:=array['Kaplan','Baykuş','Tilki','Panda','Kedi','Kartal','Yunus','Kurt','Ayı','Karga'];
  n text; i integer:=0;
begin
  loop
    n:=a[1+floor(random()*array_length(a,1))::int]||' '||b[1+floor(random()*array_length(b,1))::int]||' '||
       case when i<30 then (100+floor(random()*900))::int else (1000+floor(random()*9000))::int end;
    exit when not exists(select 1 from yz101.users where username=n);
    i:=i+1;
    if i>100 then raise exception 'Kullanıcı adı üretilemedi.'; end if;
  end loop;
  return n;
end $$;

-- 7) Ders başına erişim durumu
create or replace function yz101.lesson_access_for(u uuid, t text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r yz101.lesson_state; premium boolean; tester boolean; lim integer;
begin
  if not exists(select 1 from yz101.lessons where task_id=t) then raise exception 'Unknown task'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,101));
  insert into yz101.lesson_state(user_id,task_id) values(u,t) on conflict do nothing;
  update yz101.lesson_state set failures=0,locked_until=null,reason=null,cycle=cycle+1,updated_at=now()
   where user_id=u and task_id=t and locked_until<=now();
  select * into r from yz101.lesson_state where user_id=u and task_id=t;
  select coalesce(is_premium,false),coalesce(is_tester,false) into premium,tester from yz101.users where id=u;
  premium:=coalesce(premium,false); tester:=coalesce(tester,false);
  lim:=yz101.attempt_limit(u);
  return jsonb_build_object('task_id',t,'premium',premium,'bypass',tester,'failures',r.failures,
    'attempts_remaining',case when tester then null else greatest(0,lim-r.failures) end,
    'cooldown_until',case when tester then null else r.locked_until end,
    'reason',case when tester then null else r.reason end,
    'cycle',r.cycle,'server_now',now());
end $$;

create or replace function yz101.daily_limit_reached(u uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select not coalesce((select coalesce(is_premium,false) or is_tester from yz101.users where id=u),false)
    and (select count(*) from yz101.scores s
         where s.user_id=u and s.type in ('pilot_lesson','pilot_lesson_test')
           and (s.created_at at time zone 'Europe/Istanbul')::date=(now() at time zone 'Europe/Istanbul')::date) >= 3
$$;

-- 8) Yapay zeka kontrolü: ders başına hak, günlük ders sınırı, kullanıcı başı günlük kontrol tavanı
create or replace function public.yz101_ai_evaluation_control(p_action text, p_user uuid default null, p_task text default null,
  p_hash text default null, p_id uuid default null, p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing yz101.ai_evaluation_requests; a jsonb; used numeric; id_new uuid; t yz101.ai_evaluation_tasks;
  reserve_amount numeric:=0.005; changed boolean; f integer; cached_hash text; day_start timestamptz; user_used integer;
begin
  if p_action='reserve' then
    if p_user is null or p_task is null or p_hash is null or length(p_hash)<>64 then raise exception 'Invalid arguments'; end if;
    select * into t from yz101.ai_evaluation_tasks where task_id=p_task and enabled;
    if not found then return jsonb_build_object('status','disabled'); end if;
    a:=yz101.lesson_access_for(p_user,p_task);
    select * into existing from yz101.ai_evaluation_requests where user_id=p_user and task_id=p_task and status='completed' and feedback->>'passed'='true' order by finished_at desc limit 1;
    if found then
      insert into yz101.pilot_progress(user_id,task_id,ai_passed) values(p_user,p_task,true) on conflict(user_id,task_id) do update set ai_passed=true,updated_at=now();
      return jsonb_build_object('status','completed','feedback',existing.feedback,'access',a);
    end if;
    if a->>'cooldown_until' is not null then return jsonb_build_object('status','cooldown','access',a); end if;
    if exists(select 1 from yz101.pilot_progress where user_id=p_user and task_id=p_task and completed) then return jsonb_build_object('status','already_completed','access',a); end if;
    if yz101.daily_limit_reached(p_user) then return jsonb_build_object('status','daily_limit','access',a); end if;
    day_start:=date_trunc('day',now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
    update yz101.ai_evaluation_requests set status='failed',finished_at=now() where user_id=p_user and status='reserved' and created_at<now()-interval '2 minutes';
    select count(*) into user_used from yz101.ai_evaluation_requests where user_id=p_user and status in ('reserved','completed') and created_at>=day_start;
    if user_used>=8 then return jsonb_build_object('status','daily_ai_limit','access',a); end if;
    cached_hash:=encode(extensions.digest(p_hash||':'||(a->>'cycle'),'sha256'),'hex');
    select * into existing from yz101.ai_evaluation_requests where user_id=p_user and task_id=p_task and response_hash=cached_hash;
    if found and existing.status<>'failed' then return jsonb_build_object('status',case when existing.status='reserved' then 'processing' else existing.status end,'feedback',existing.feedback,'access',a); end if;
    if exists(select 1 from yz101.ai_evaluation_requests where user_id=p_user and status='reserved') then return jsonb_build_object('status','processing','access',a); end if;
    perform pg_advisory_xact_lock(101,7001);
    select coalesce(sum(case when status='reserved' then reserved_usd else greatest(cost_usd,reserved_usd) end),0) into used from yz101.ai_evaluation_requests where created_at>=day_start;
    if used+reserve_amount>0.10 then return jsonb_build_object('status','budget_limit','access',a); end if;
    if existing.id is not null and existing.status='failed' then cached_hash:=encode(extensions.digest(cached_hash||gen_random_uuid()::text,'sha256'),'hex'); end if;
    insert into yz101.ai_evaluation_requests(user_id,task_id,response_hash,status,reserved_usd) values(p_user,p_task,cached_hash,'reserved',reserve_amount) returning id into id_new;
    return jsonb_build_object('status','reserved','id',id_new,'rubric',t.rubric,'access',a);
  elsif p_action='finish' then
    select * into existing from yz101.ai_evaluation_requests where id=p_id;
    if not found then raise exception 'Unknown request'; end if;
    a:=yz101.lesson_access_for(existing.user_id,existing.task_id);
    update yz101.ai_evaluation_requests set status=case when p_payload->>'ok'='true' then 'completed' else 'failed' end,
      cost_usd=least(greatest(coalesce((p_payload->>'cost_usd')::numeric,0),0),1),
      input_tokens=least(greatest(coalesce((p_payload->>'input_tokens')::int,0),0),100000),
      output_tokens=least(greatest(coalesce((p_payload->>'output_tokens')::int,0),0),100000),
      feedback=case when p_payload->>'ok'='true' then p_payload->'feedback' else null end,finished_at=now()
      where id=p_id and status='reserved';
    changed:=found;
    if changed and p_payload->>'ok'='true' then
      if p_payload->'feedback'->>'passed'='true' then
        insert into yz101.pilot_progress(user_id,task_id,quiz_passed,ai_passed,numeric_passed,completed) values(existing.user_id,existing.task_id,false,true,false,false)
        on conflict(user_id,task_id) do update set ai_passed=true,updated_at=now();
      elsif not (a->>'bypass')::boolean then
        update yz101.lesson_state set failures=least(yz101.attempt_limit(existing.user_id),failures+1),updated_at=now()
          where user_id=existing.user_id and task_id=existing.task_id returning failures into f;
        if f>=yz101.attempt_limit(existing.user_id) then
          update yz101.lesson_state set locked_until=now()+interval '24 hours',reason='retry' where user_id=existing.user_id and task_id=existing.task_id;
        end if;
      end if;
    end if;
    return jsonb_build_object('updated',changed,'access',yz101.lesson_access_for(existing.user_id,existing.task_id));
  end if;
  raise exception 'Invalid action';
end $$;

-- 9) Ders testi (Uygula sonrası): ön koşul yok, ders başına hak, günlük ders sınırı
create or replace function public.yz101_lesson_test(p_task text, p_answers integer[], p_numeric numeric default null,
  p_request uuid default gen_random_uuid()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a jsonb; k yz101.pilot_answer_keys; old jsonb; flags jsonb; correct integer; numeric_ok boolean;
  passed boolean; output jsonb; f integer;
begin
  if u is null then raise exception 'Authentication required'; end if;
  if p_request is null then raise exception 'Request ID required'; end if;
  if not exists(select 1 from yz101.lessons where task_id=p_task and published) then raise exception 'Unknown task'; end if;
  a:=yz101.lesson_access_for(u,p_task);
  select result into old from yz101.lesson_submissions where user_id=u and request_id=p_request;
  if found then return old||jsonb_build_object('access',a); end if;
  if exists(select 1 from yz101.pilot_progress where user_id=u and task_id=p_task and completed) then return jsonb_build_object('status','already_completed','access',a); end if;
  if a->>'cooldown_until' is not null then return jsonb_build_object('status','cooldown','access',a); end if;
  select * into k from yz101.pilot_answer_keys where task_id=p_task;
  if not found then raise exception 'Unknown task'; end if;
  if not exists(select 1 from yz101.pilot_progress where user_id=u and task_id=p_task and ai_passed)
     and not exists(select 1 from yz101.ai_evaluation_requests where user_id=u and task_id=p_task and status='completed' and feedback->>'passed'='true')
  then return jsonb_build_object('status','ai_required','access',a); end if;
  if array_length(p_answers,1) is distinct from 3 or exists(select 1 from unnest(p_answers) x where x is null or x<0 or x>3)
     or (k.numeric_value is not null and p_numeric is null) then return jsonb_build_object('status','incomplete','access',a); end if;
  if yz101.daily_limit_reached(u) then return jsonb_build_object('status','daily_limit','access',a); end if;
  select jsonb_agg(p_answers[i]=k.quiz_answers[i] order by i),count(*) filter(where p_answers[i]=k.quiz_answers[i]) into flags,correct from generate_series(1,3) i;
  numeric_ok:=k.numeric_value is null or abs(p_numeric-k.numeric_value)<=k.numeric_tolerance;
  passed:=correct=3 and numeric_ok;
  insert into yz101.pilot_progress(user_id,task_id,quiz_passed,ai_passed,numeric_passed,completed,via) values(u,p_task,correct=3,true,numeric_ok,passed,'lesson')
  on conflict(user_id,task_id) do update set quiz_passed=excluded.quiz_passed,ai_passed=true,numeric_passed=excluded.numeric_passed,completed=excluded.completed,updated_at=now();
  if not (a->>'bypass')::boolean and not passed then
    update yz101.lesson_state set failures=least(yz101.attempt_limit(u),failures+1),updated_at=now() where user_id=u and task_id=p_task returning failures into f;
    if f>=yz101.attempt_limit(u) then update yz101.lesson_state set locked_until=now()+interval '24 hours',reason='retry' where user_id=u and task_id=p_task; end if;
  end if;
  a:=yz101.lesson_access_for(u,p_task);
  output:=jsonb_build_object('status','evaluated','passed',passed,'answers',flags,'correct_count',correct,'numeric_passed',numeric_ok,'access',a);
  insert into yz101.lesson_submissions(user_id,request_id,result) values(u,p_request,output);
  return output;
end $$;

-- 10) "Teste hazırım": dersi okumadan teste gir (ders başına tek sefer, kontrol hakkı harcamaz)
create or replace function public.yz101_test_out(p_task text, p_answers integer[], p_numeric numeric default null,
  p_request uuid default gen_random_uuid()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a jsonb; k yz101.pilot_answer_keys; old jsonb; flags jsonb; correct integer; numeric_ok boolean;
  passed boolean; output jsonb; used boolean;
begin
  if u is null then raise exception 'Authentication required'; end if;
  if p_request is null then raise exception 'Request ID required'; end if;
  if not exists(select 1 from yz101.lessons where task_id=p_task and published) then raise exception 'Unknown task'; end if;
  a:=yz101.lesson_access_for(u,p_task);
  select result into old from yz101.lesson_submissions where user_id=u and request_id=p_request;
  if found then return old||jsonb_build_object('access',a); end if;
  if exists(select 1 from yz101.pilot_progress where user_id=u and task_id=p_task and completed) then return jsonb_build_object('status','already_completed','access',a); end if;
  select testout_used into used from yz101.lesson_state where user_id=u and task_id=p_task;
  if coalesce(used,false) then return jsonb_build_object('status','testout_used','access',a); end if;
  select * into k from yz101.pilot_answer_keys where task_id=p_task;
  if not found then raise exception 'Unknown task'; end if;
  if array_length(p_answers,1) is distinct from 3 or exists(select 1 from unnest(p_answers) x where x is null or x<0 or x>3)
     or (k.numeric_value is not null and p_numeric is null) then return jsonb_build_object('status','incomplete','access',a); end if;
  if yz101.daily_limit_reached(u) then return jsonb_build_object('status','daily_limit','access',a); end if;
  select jsonb_agg(p_answers[i]=k.quiz_answers[i] order by i),count(*) filter(where p_answers[i]=k.quiz_answers[i]) into flags,correct from generate_series(1,3) i;
  numeric_ok:=k.numeric_value is null or abs(p_numeric-k.numeric_value)<=k.numeric_tolerance;
  passed:=correct=3 and numeric_ok;
  update yz101.lesson_state set testout_used=true,updated_at=now() where user_id=u and task_id=p_task;
  if passed then
    insert into yz101.pilot_progress(user_id,task_id,quiz_passed,ai_passed,numeric_passed,completed,via) values(u,p_task,true,false,numeric_ok,true,'test')
    on conflict(user_id,task_id) do update set quiz_passed=true,numeric_passed=excluded.numeric_passed,completed=true,
      via=case when yz101.pilot_progress.ai_passed then 'lesson' else 'test' end,updated_at=now();
  end if;
  output:=jsonb_build_object('status','evaluated','passed',passed,'answers',flags,'correct_count',correct,'access',yz101.lesson_access_for(u,p_task));
  insert into yz101.lesson_submissions(user_id,request_id,result) values(u,p_request,output);
  return output;
end $$;

-- 11) Seviye testi: 1. aşama 4 Başlangıç sorusu, geçenlere 2. aşama 4 Orta sorusu. Kullanıcı başına tek sefer.
create or replace function public.yz101_placement(p_stage integer, p_answers jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); pl yz101.placement; item jsonb; lvl text; avail integer; need integer; correct integer:=0;
  seen text[]:=array[]::text[]; tk text; qn integer; ans integer; k yz101.pilot_answer_keys; stage_ok boolean;
  result text; skip_levels text[]; skipped integer:=0; pts integer:=0;
begin
  if u is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,101));
  select * into pl from yz101.placement where user_id=u;
  if pl.done_at is not null then
    return jsonb_build_object('done',true,'result_level',pl.result_level,'skipped',pl.skipped,
      'points',coalesce((select sum(points) from yz101.scores where user_id=u and type='placement_skip'),0));
  end if;
  if p_stage not in (1,2) then raise exception 'Geçersiz aşama.'; end if;
  if pl.user_id is null and exists(select 1 from yz101.pilot_progress where user_id=u and completed) then
    raise exception 'Seviye testi yalnız başlangıçta yapılabilir.'; end if;
  if p_stage=1 and pl.stage1_correct is not null then
    return jsonb_build_object('done',false,'stage',1,'correct',pl.stage1_correct,'next','stage2');
  end if;
  if p_stage=2 and (pl.stage1_correct is null or pl.stage1_correct<3) then raise exception 'Önce ilk aşamayı tamamla.'; end if;
  if jsonb_typeof(p_answers)<>'array' then raise exception 'Geçersiz yanıt.'; end if;
  lvl:=case p_stage when 1 then 'Başlangıç' else 'Orta' end;
  select count(*) into avail from yz101.lessons l where l.level=lvl and l.published and exists(select 1 from yz101.pilot_answer_keys z where z.task_id=l.task_id);
  need:=least(4,avail);
  if jsonb_array_length(p_answers)<>need then raise exception 'Tüm soruları yanıtla.'; end if;
  for item in select * from jsonb_array_elements(p_answers) loop
    tk:=item->>'task'; qn:=(item->>'q')::int; ans:=case when item->>'a' is null then null else (item->>'a')::int end;
    if tk is null or qn is null or qn not between 0 and 2 or (ans is not null and ans not between 0 and 3) then raise exception 'Geçersiz yanıt.'; end if;
    if tk=any(seen) then raise exception 'Geçersiz yanıt.'; end if;
    seen:=seen||tk;
    if not exists(select 1 from yz101.lessons where task_id=tk and published and level=lvl) then raise exception 'Geçersiz yanıt.'; end if;
    select * into k from yz101.pilot_answer_keys where task_id=tk;
    if not found then raise exception 'Geçersiz yanıt.'; end if;
    if ans is not null and ans=k.quiz_answers[qn+1] then correct:=correct+1; end if;
  end loop;
  stage_ok:=need>=3 and correct>=3;
  if p_stage=1 and stage_ok then
    insert into yz101.placement(user_id,stage1_correct) values(u,correct)
      on conflict(user_id) do update set stage1_correct=excluded.stage1_correct;
    return jsonb_build_object('done',false,'stage',1,'correct',correct,'next','stage2');
  end if;
  result:=case when p_stage=1 then 'Başlangıç' when stage_ok then 'İleri' else 'Orta' end;
  skip_levels:=case result when 'Orta' then array['Başlangıç'] when 'İleri' then array['Başlangıç','Orta'] else array[]::text[] end;
  insert into yz101.pilot_progress(user_id,task_id,quiz_passed,ai_passed,numeric_passed,completed,via)
    select u,l.task_id,true,false,true,true,'placement' from yz101.lessons l
    where l.published and l.level=any(skip_levels) and exists(select 1 from yz101.ai_evaluation_tasks e where e.task_id=l.task_id)
    on conflict(user_id,task_id) do update set quiz_passed=true,completed=true,via='placement',updated_at=now()
      where not yz101.pilot_progress.completed;
  select count(*),coalesce(sum(points),0) into skipped,pts from yz101.scores where user_id=u and type='placement_skip';
  insert into yz101.placement(user_id,stage1_correct,stage2_correct,result_level,skipped,done_at)
    values(u,case when p_stage=1 then correct else pl.stage1_correct end,case when p_stage=2 then correct end,result,skipped,now())
    on conflict(user_id) do update set stage2_correct=excluded.stage2_correct,stage1_correct=excluded.stage1_correct,
      result_level=excluded.result_level,skipped=excluded.skipped,done_at=excluded.done_at;
  return jsonb_build_object('done',true,'stage',p_stage,'correct',correct,'result_level',result,'skipped',skipped,'points',pts);
end $$;

-- 12) Koç RPC: durum, başlatma, profil, Ders listem
create or replace function public.yz101_coach(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v uuid:=auth.uid(); u yz101.users; lim integer; prem boolean; tester boolean; goal_value text; plan_value integer;
  name_value text; task text; em text;
begin
  if v is null or not exists(select 1 from auth.users where id=v and deleted_at is null) then
    raise exception 'Oturum açmanız gerekiyor.' using errcode='28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v::text,101));
  select * into u from yz101.users where id=v;
  if p_action='state' then
    lim:=yz101.attempt_limit(v);
    prem:=coalesce(u.is_premium,false); tester:=coalesce(u.is_tester,false);
    return jsonb_build_object(
      'server_now',now(),
      'profile',case when u.id is null then null else to_jsonb(u)-'expo_push_token' end,
      'account',jsonb_build_object('email',(select email from auth.users where id=v),'anonymous',coalesce((select is_anonymous from auth.users where id=v),false)),
      'points',coalesce((select sum(points) from yz101.scores where user_id=v),0),
      'lessons',coalesce((select jsonb_agg(jsonb_build_object(
          'task_id',l.task_id,'level',l.level,'ord',l.ord,'points',l.points,'published',l.published,
          'completed',coalesce(p.completed,false),'via',p.via,'ai_passed',coalesce(p.ai_passed,false),'quiz_passed',coalesce(p.quiz_passed,false),
          'listed',coalesce(s.listed,false),'testout_used',coalesce(s.testout_used,false),
          'locked_until',case when s.locked_until>now() then s.locked_until end,
          'failures',case when s.locked_until<=now() then 0 else coalesce(s.failures,0) end,
          'attempts_remaining',case when tester then null when s.locked_until>now() then 0
             else greatest(0,lim-case when s.locked_until<=now() then 0 else coalesce(s.failures,0) end) end
        ) order by l.ord)
        from yz101.lessons l
        left join yz101.pilot_progress p on p.user_id=v and p.task_id=l.task_id
        left join yz101.lesson_state s on s.user_id=v and s.task_id=l.task_id),'[]'::jsonb),
      'access',jsonb_build_object('premium',prem,'bypass',tester,'attempt_limit',lim,'daily_limit',3,
        'daily_reached',yz101.daily_limit_reached(v),
        'daily_done',(select count(*) from yz101.scores s where s.user_id=v and s.type in ('pilot_lesson','pilot_lesson_test')
           and (s.created_at at time zone 'Europe/Istanbul')::date=(now() at time zone 'Europe/Istanbul')::date)),
      'placement',(select jsonb_build_object('done',done_at is not null,'result',result_level,'stage1',stage1_correct,'skipped',skipped)
        from yz101.placement where user_id=v));
  elsif p_action='start' then
    goal_value:=p_data->>'goal'; plan_value:=(p_data->>'plan')::int;
    if goal_value is null or goal_value not in ('Anlamak','Kullanmak','Üretmek') then raise exception 'Bir hedef seç.'; end if;
    if plan_value is null or plan_value not between 1 and 3 then raise exception 'Günlük süreni seç.'; end if;
    if u.id is null then
      select email into em from auth.users where id=v;
      insert into yz101.users(id,username,email,level,goal,daily_plan,reminder_time)
        values(v,yz101.make_username(),em,'A1',goal_value,plan_value,'20:00'::time) returning * into u;
    else
      update yz101.users set goal=goal_value,daily_plan=plan_value where id=v returning * into u;
    end if;
    return to_jsonb(u)-'expo_push_token';
  elsif p_action='profile' then
    if u.id is null then raise exception 'Önce yolculuğunu başlat.'; end if;
    name_value:=coalesce(nullif(btrim(p_data->>'username'),''),u.username);
    goal_value:=coalesce(p_data->>'goal',u.goal);
    plan_value:=coalesce((p_data->>'plan')::int,u.daily_plan);
    if length(name_value)<2 or length(name_value)>40 then raise exception 'Kullanıcı adı 2–40 karakter olmalı.'; end if;
    if goal_value not in ('Anlamak','Kullanmak','Üretmek') then raise exception 'Geçersiz hedef.'; end if;
    if plan_value is not null and plan_value not between 1 and 3 then raise exception 'Geçersiz süre.'; end if;
    update yz101.users set username=name_value,goal=goal_value,daily_plan=plan_value where id=v returning * into u;
    return to_jsonb(u)-'expo_push_token';
  elsif p_action in ('list_add','list_remove') then
    task:=p_data->>'task';
    if not exists(select 1 from yz101.lessons where task_id=task and published) then raise exception 'Ders bulunamadı.'; end if;
    insert into yz101.lesson_state(user_id,task_id,listed) values(v,task,p_action='list_add')
      on conflict(user_id,task_id) do update set listed=(p_action='list_add'),updated_at=now();
    return jsonb_build_object('listed',p_action='list_add');
  end if;
  raise exception 'Geçersiz işlem.';
end $$;

-- 13) Yetkiler: yalnız oturum açmış (anonim dahil) kullanıcılar
revoke all on function public.yz101_coach(text,jsonb) from public, anon;
revoke all on function public.yz101_test_out(text,integer[],numeric,uuid) from public, anon;
revoke all on function public.yz101_placement(integer,jsonb) from public, anon;
grant execute on function public.yz101_coach(text,jsonb) to authenticated;
grant execute on function public.yz101_test_out(text,integer[],numeric,uuid) to authenticated;
grant execute on function public.yz101_placement(integer,jsonb) to authenticated;
