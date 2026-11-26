-- AI Koçu: yz101 -> aikocu yeniden adlandırma, sadeleştirme, öncül/beceri modeli.
-- Kararlar: "YZ101 — kararlar 26 Kasım (öncüllü ders akışı)" proje dokümanı.
-- Kaldırılanlar: seviye, hedef, yerleştirme, eski ders erişim tablosu, 50 yayında olmayan ders satırı.

-- 1) Yayında olmayan dersleri ve bağlı kayıtları temizle (P11-P60 içerik yok)
delete from yz101.lesson_state where task_id in (select task_id from yz101.lessons where not published);
delete from yz101.lessons where not published;

-- 2) Kullanılmayan tablolar
drop table yz101.placement;
drop table yz101.lesson_access;

-- 3) Eski tetikleyici ve fonksiyonları kaldır (gövdeleri eski adları taşıyor; yenileri aşağıda yazılıyor)
drop trigger award_pilot_lesson_points on yz101.pilot_progress;
drop trigger cleanup_profile_lessons on yz101.users;
drop function yz101.award_pilot_lesson_points();
drop function yz101.cleanup_profile_lessons();
drop function yz101.daily_limit_reached(uuid);
drop function yz101.daily_lock_until(uuid);
drop function yz101.make_username();
drop function yz101.attempt_limit(uuid);
drop function public.yz101_placement(integer, jsonb);
drop function public.yz101_coach(text, jsonb);

-- 4) Şema ve tablo adları
alter schema yz101 rename to aikocu;
alter table aikocu.ai_evaluation_tasks rename to practice_rubrics;
alter table aikocu.ai_evaluation_requests rename to practice_evaluations;
alter table aikocu.pilot_answer_keys rename to lesson_answer_keys;
alter table aikocu.pilot_progress rename to lesson_progress;
alter table aikocu.lesson_state rename to lesson_attempts;
alter table aikocu.lesson_submissions rename to test_submissions;
alter table aikocu.lesson_notes rename to test_question_notes;

-- 5) Kolon adları
alter table aikocu.lessons rename column task_id to lesson_id;
alter table aikocu.practice_rubrics rename column task_id to lesson_id;
alter table aikocu.practice_evaluations rename column task_id to lesson_id;
alter table aikocu.lesson_answer_keys rename column task_id to lesson_id;
alter table aikocu.lesson_progress rename column task_id to lesson_id;
alter table aikocu.lesson_progress rename column quiz_passed to test_passed;
alter table aikocu.lesson_progress rename column ai_passed to practice_passed;
alter table aikocu.lesson_attempts rename column task_id to lesson_id;
alter table aikocu.mentor_responses rename column task_id to lesson_id;
alter table aikocu.test_question_notes rename column task_id to lesson_id;
alter table aikocu.scores rename column pilot_task_id to lesson_id;

-- 6) Kullanılmayan kolonlar
alter table aikocu.lessons drop column level;
alter table aikocu.users drop column goal, drop column reminder_time, drop column email, drop column last_purchase_at;
alter table aikocu.scores drop column email, drop column username, drop column source_id;

-- 7) Ders kimlikleri P01 -> D01 (yabancı anahtarlar geçici kaldırılır)
alter table aikocu.lesson_attempts drop constraint lesson_state_task_id_fkey;
alter table aikocu.practice_evaluations drop constraint ai_evaluation_requests_task_id_fkey;
alter table aikocu.lesson_progress drop constraint pilot_progress_task_id_fkey;
alter table aikocu.lesson_answer_keys drop constraint pilot_answer_keys_task_id_fkey;
alter table aikocu.mentor_responses drop constraint mentor_responses_task_id_fkey;
alter table aikocu.scores drop constraint scores_pilot_progress_fkey;
alter table aikocu.scores drop constraint scores_pilot_reward_check;
alter table aikocu.lesson_progress drop constraint pilot_progress_via_check;

update aikocu.lessons set lesson_id='D'||substr(lesson_id,2) where lesson_id ~ '^P[0-9]+$';
update aikocu.practice_rubrics set lesson_id='D'||substr(lesson_id,2) where lesson_id ~ '^P[0-9]+$';
update aikocu.practice_evaluations set lesson_id='D'||substr(lesson_id,2) where lesson_id ~ '^P[0-9]+$';
update aikocu.lesson_answer_keys set lesson_id='D'||substr(lesson_id,2) where lesson_id ~ '^P[0-9]+$';
update aikocu.lesson_progress set lesson_id='D'||substr(lesson_id,2) where lesson_id ~ '^P[0-9]+$';
update aikocu.lesson_attempts set lesson_id='D'||substr(lesson_id,2) where lesson_id ~ '^P[0-9]+$';
update aikocu.mentor_responses set lesson_id='D'||substr(lesson_id,2) where lesson_id ~ '^P[0-9]+$';
update aikocu.test_question_notes set lesson_id='D'||substr(lesson_id,2) where lesson_id ~ '^P[0-9]+$';
update aikocu.scores set lesson_id='D'||substr(lesson_id,2) where lesson_id ~ '^P[0-9]+$';

-- 8) Puan türleri ve yabancı anahtarlar (hepsi dersler tablosuna bağlanır)
update aikocu.scores set type='lesson' where type='pilot_lesson';
update aikocu.scores set type='lesson_test' where type='pilot_lesson_test';
alter table aikocu.scores add constraint scores_reward_check check (
  lesson_id is null or (user_id is not null and points = any (array[10,15,20]) and type = any (array['lesson','lesson_test'])));
alter table aikocu.lesson_progress add constraint lesson_progress_via_check check (via = any (array['lesson','test']));
alter table aikocu.practice_rubrics add constraint practice_rubrics_lesson_fkey foreign key (lesson_id) references aikocu.lessons(lesson_id);
alter table aikocu.lesson_answer_keys add constraint lesson_answer_keys_lesson_fkey foreign key (lesson_id) references aikocu.lessons(lesson_id);
alter table aikocu.practice_evaluations add constraint practice_evaluations_lesson_fkey foreign key (lesson_id) references aikocu.lessons(lesson_id);
alter table aikocu.lesson_progress add constraint lesson_progress_lesson_fkey foreign key (lesson_id) references aikocu.lessons(lesson_id);
alter table aikocu.lesson_attempts add constraint lesson_attempts_lesson_fkey foreign key (lesson_id) references aikocu.lessons(lesson_id);
alter table aikocu.mentor_responses add constraint mentor_responses_lesson_fkey foreign key (lesson_id) references aikocu.lessons(lesson_id);
alter table aikocu.test_question_notes add constraint test_question_notes_lesson_fkey foreign key (lesson_id) references aikocu.lessons(lesson_id);
alter table aikocu.scores add constraint scores_progress_fkey foreign key (user_id, lesson_id) references aikocu.lesson_progress(user_id, lesson_id) on delete cascade;

-- 9) Kalan kısıt/indeks adlarını yeni adlara uydur
do $$
declare r record; n text;
begin
  for r in select c.conname, c.conrelid::regclass::text rel from pg_constraint c where c.connamespace='aikocu'::regnamespace loop
    n:=r.conname;
    n:=replace(n,'ai_evaluation_requests','practice_evaluations');
    n:=replace(n,'ai_evaluation_tasks','practice_rubrics');
    n:=replace(n,'pilot_answer_keys','lesson_answer_keys');
    n:=replace(n,'pilot_progress','lesson_progress');
    n:=replace(n,'lesson_state','lesson_attempts');
    n:=replace(n,'lesson_submissions','test_submissions');
    n:=replace(n,'lesson_notes','test_question_notes');
    n:=replace(n,'task_id','lesson_id');
    if n<>r.conname and not exists(select 1 from pg_constraint where connamespace='aikocu'::regnamespace and conname=n) then
      execute format('alter table %s rename constraint %I to %I', r.rel, r.conname, n);
    end if;
  end loop;
end $$;
alter index aikocu.yz101_scores_user_idx rename to scores_user_idx;
alter index aikocu.scores_pilot_lesson_once rename to scores_lesson_once;
alter index aikocu.ai_eval_user_daily_idx rename to practice_evaluations_user_day_idx;
alter index aikocu.ai_eval_daily_idx rename to practice_evaluations_day_idx;
alter index aikocu.mentor_user_recent rename to mentor_responses_user_recent_idx;

-- 10) Dersin verdiği ve istediği beceriler
create table aikocu.lesson_skills (
  lesson_id text not null references aikocu.lessons(lesson_id) on delete cascade,
  skill text not null check (char_length(skill) between 2 and 40),
  level integer not null check (level >= 1),
  role text not null check (role in ('gives','requires')),
  primary key (lesson_id, skill, role)
);
alter table aikocu.lesson_skills enable row level security;
insert into aikocu.lesson_skills(lesson_id, skill, level, role) values
 ('D01','yapay zeka temeli',1,'gives'),
 ('D02','yapay zeka ve iş',1,'gives'),
 ('D03','yapay zeka temeli',2,'gives'), ('D03','yapay zeka temeli',1,'requires'),
 ('D04','araç seçimi',1,'gives'),       ('D04','yapay zeka temeli',1,'requires'),
 ('D05','günlük kullanım',1,'gives'),   ('D05','araç seçimi',1,'requires'),
 ('D06','doğrulama',1,'gives'),         ('D06','yapay zeka temeli',2,'requires'),
 ('D07','yapay zeka ve iş',2,'gives'),  ('D07','günlük kullanım',1,'requires'),
 ('D08','gizlilik',1,'gives'),          ('D08','araç seçimi',1,'requires'),
 ('D09','sahte içerik',1,'gives'),      ('D09','yapay zeka temeli',1,'requires'),
 ('D10','istek yazma',1,'gives'),       ('D10','günlük kullanım',1,'requires'), ('D10','doğrulama',1,'requires'), ('D10','gizlilik',1,'requires');

-- 11) Yardımcı fonksiyonlar
create function aikocu.attempt_limit(u uuid) returns integer language sql stable security definer set search_path to '' as $$ select 2 $$;

create function aikocu.skill_level(u uuid, s text) returns integer language sql stable security definer set search_path to '' as $$
  select coalesce(max(g.level),0)::integer
  from aikocu.lesson_progress p
  join aikocu.lesson_skills g on g.lesson_id=p.lesson_id and g.role='gives'
  where p.user_id=u and p.completed and g.skill=s $$;

create function aikocu.lesson_open(u uuid, l text) returns boolean language sql stable security definer set search_path to '' as $$
  select not exists(select 1 from aikocu.lesson_skills r
    where r.lesson_id=l and r.role='requires' and aikocu.skill_level(u,r.skill)<r.level) $$;

create function aikocu.next_lesson(u uuid) returns text language sql stable security definer set search_path to '' as $$
  select x.lesson_id from aikocu.lessons x
  where x.published and aikocu.lesson_open(u,x.lesson_id)
    and not exists(select 1 from aikocu.lesson_progress p where p.user_id=u and p.lesson_id=x.lesson_id and p.completed)
  order by x.ord limit 1 $$;

-- Günlük hak: yalnızca dersi işleyerek tamamlama sayılır (testle geçiş sayılmaz), günde 1 ders
create function aikocu.daily_lock_until(u uuid) returns timestamptz language sql stable security definer set search_path to '' as $$
  select case
    when coalesce((select coalesce(is_premium,false) or coalesce(is_tester,false) from aikocu.users where id=u),false) then null
    else (select t.m+interval '24 hours'
          from (select max(created_at) m from aikocu.scores where user_id=u and type='lesson') t
          where t.m>now()-interval '24 hours')
  end $$;

create function aikocu.daily_limit_reached(u uuid) returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce(aikocu.daily_lock_until(u)>now(),false) $$;

create function aikocu.make_username() returns text language plpgsql security definer set search_path to '' as $$
declare
  a text[]:=array['Meraklı','Çevik','Parlak','Sessiz','Bilge','Cesur','Neşeli','Atılgan','Zeki','Sakin'];
  b text[]:=array['Kaplan','Baykuş','Tilki','Panda','Kedi','Kartal','Yunus','Kurt','Ayı','Karga'];
  n text; i integer:=0;
begin
  loop
    n:=a[1+floor(random()*array_length(a,1))::int]||' '||b[1+floor(random()*array_length(b,1))::int]||' '||
       case when i<30 then (100+floor(random()*900))::int else (1000+floor(random()*9000))::int end;
    exit when not exists(select 1 from aikocu.users where username=n);
    i:=i+1;
    if i>100 then raise exception 'Kullanıcı adı üretilemedi.'; end if;
  end loop;
  return n;
end $$;

-- Ders erişimi: öncül becerileri tamamlanmamış ders açılmaz
create function aikocu.lesson_access(u uuid, t text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare r aikocu.lesson_attempts; premium boolean; tester boolean; lim integer;
begin
  if not exists(select 1 from aikocu.lessons where lesson_id=t) then raise exception 'Unknown lesson'; end if;
  if not exists(select 1 from aikocu.lesson_progress p where p.user_id=u and p.lesson_id=t and p.completed)
     and not aikocu.lesson_open(u,t)
  then raise exception 'Önce öncül dersleri tamamla.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,101));
  insert into aikocu.lesson_attempts(user_id,lesson_id) values(u,t) on conflict do nothing;
  update aikocu.lesson_attempts set failures=0,locked_until=null,reason=null,cycle=cycle+1,updated_at=now()
   where user_id=u and lesson_id=t and locked_until<=now();
  select * into r from aikocu.lesson_attempts where user_id=u and lesson_id=t;
  select coalesce(is_premium,false),coalesce(is_tester,false) into premium,tester from aikocu.users where id=u;
  premium:=coalesce(premium,false); tester:=coalesce(tester,false) or premium;
  lim:=aikocu.attempt_limit(u);
  return jsonb_build_object('lesson_id',t,'premium',premium,'bypass',tester,'failures',r.failures,
    'attempts_remaining',case when tester then null else greatest(0,lim-r.failures) end,
    'cooldown_until',case when tester then null else r.locked_until end,
    'reason',case when tester then null else r.reason end,
    'cycle',r.cycle,'server_now',now());
end $$;

-- Puan: ders tamamlanınca bir kez
create function aikocu.award_lesson_points() returns trigger language plpgsql security definer set search_path to '' as $$
declare pts integer;
begin
  if new.completed then
    select points into pts from aikocu.lessons where lesson_id=new.lesson_id;
    insert into aikocu.scores(user_id,points,type,lesson_id)
    values(new.user_id,coalesce(pts,10),case new.via when 'test' then 'lesson_test' else 'lesson' end,new.lesson_id)
    on conflict(user_id,lesson_id) where lesson_id is not null do nothing;
  end if;
  return new;
end $$;
create trigger award_lesson_points after insert or update on aikocu.lesson_progress
  for each row execute function aikocu.award_lesson_points();

create function aikocu.cleanup_user_data() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  delete from aikocu.test_submissions where user_id=old.id;
  delete from aikocu.lesson_attempts where user_id=old.id;
  delete from aikocu.practice_evaluations where user_id=old.id;
  delete from aikocu.lesson_progress where user_id=old.id;
  return old;
end $$;
create trigger cleanup_user_data after delete on aikocu.users
  for each row execute function aikocu.cleanup_user_data();

-- 12) Uygulama girişi (eski yz101_coach)
create function public.aikocu_api(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v uuid:=auth.uid(); u aikocu.users; lim integer; prem boolean; tester boolean; name_value text;
begin
  if v is null or not exists(select 1 from auth.users where id=v and deleted_at is null) then
    raise exception 'Oturum açmanız gerekiyor.' using errcode='28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v::text,101));
  select * into u from aikocu.users where id=v;
  if p_action='state' then
    lim:=aikocu.attempt_limit(v);
    prem:=coalesce(u.is_premium,false); tester:=coalesce(u.is_tester,false) or prem;
    return jsonb_build_object(
      'server_now',now(),
      'profile',case when u.id is null then null else to_jsonb(u) end,
      'account',jsonb_build_object('email',(select email from auth.users where id=v),'anonymous',coalesce((select is_anonymous from auth.users where id=v),false)),
      'points',coalesce((select sum(points) from aikocu.scores where user_id=v),0),
      'next_lesson',aikocu.next_lesson(v),
      'skills',coalesce((select jsonb_agg(jsonb_build_object('skill',s.skill,'level',s.lvl) order by s.skill)
          from (select g.skill, max(g.level) lvl from aikocu.lesson_progress p
                join aikocu.lesson_skills g on g.lesson_id=p.lesson_id and g.role='gives'
                where p.user_id=v and p.completed group by g.skill) s),'[]'::jsonb),
      'lessons',coalesce((select jsonb_agg(jsonb_build_object(
          'lesson_id',l.lesson_id,'ord',l.ord,'points',l.points,'published',l.published,
          'completed',coalesce(p.completed,false),'via',p.via,
          'practice_passed',coalesce(p.practice_passed,false),'test_passed',coalesce(p.test_passed,false),
          'open',aikocu.lesson_open(v,l.lesson_id),
          'gives',coalesce((select jsonb_agg(jsonb_build_object('skill',g.skill,'level',g.level) order by g.skill)
                            from aikocu.lesson_skills g where g.lesson_id=l.lesson_id and g.role='gives'),'[]'::jsonb),
          'locked_until',case when a.locked_until>now() then a.locked_until end,
          'failures',case when a.locked_until<=now() then 0 else coalesce(a.failures,0) end,
          'attempts_remaining',case when tester then null when a.locked_until>now() then 0
             else greatest(0,lim-case when a.locked_until<=now() then 0 else coalesce(a.failures,0) end) end
        ) order by l.ord)
        from aikocu.lessons l
        left join aikocu.lesson_progress p on p.user_id=v and p.lesson_id=l.lesson_id
        left join aikocu.lesson_attempts a on a.user_id=v and a.lesson_id=l.lesson_id),'[]'::jsonb),
      'access',jsonb_build_object('premium',prem,'bypass',tester,'attempt_limit',lim,'daily_limit',1,
        'daily_reached',aikocu.daily_limit_reached(v),
        'daily_unlock_at',case when aikocu.daily_limit_reached(v) then aikocu.daily_lock_until(v) end,
        'daily_done',(select count(*) from aikocu.scores s where s.user_id=v and s.type='lesson'
           and (s.created_at at time zone 'Europe/Istanbul')::date=(now() at time zone 'Europe/Istanbul')::date)));
  elsif p_action='start' then
    if u.id is null then
      insert into aikocu.users(id,username) values(v,aikocu.make_username()) returning * into u;
    end if;
    return to_jsonb(u);
  elsif p_action='profile' then
    if u.id is null then raise exception 'Önce uygulamayı başlat.'; end if;
    name_value:=coalesce(nullif(btrim(p_data->>'username'),''),u.username);
    if length(name_value)<2 or length(name_value)>40 then raise exception 'Kullanıcı adı 2–40 karakter olmalı.'; end if;
    update aikocu.users set username=name_value where id=v returning * into u;
    return to_jsonb(u);
  end if;
  raise exception 'Geçersiz işlem.';
end $$;

-- 13) Test, uygulama değerlendirme ve koç fonksiyonları: eski gövdeler yeni adlara çevrilerek yeniden yazılır
do $$
declare d text; fn text;
  src text[] := array['public.yz101_lesson_test(text,integer[],numeric,uuid)','public.yz101_test_out(text,integer[],numeric,uuid)',
                      'public.yz101_ai_evaluation_control(text,uuid,text,text,uuid,jsonb)','public.yz101_mentor_control(text,uuid,text,text,uuid,jsonb)'];
begin
  foreach fn in array src loop
    d:=pg_get_functiondef(fn::regprocedure);
    d:=replace(d,'public.yz101_ai_evaluation_control','public.aikocu_practice_control');
    d:=replace(d,'public.yz101_lesson_test','public.aikocu_lesson_test');
    d:=replace(d,'public.yz101_test_out','public.aikocu_test_out');
    d:=replace(d,'public.yz101_mentor_control','public.aikocu_mentor_control');
    d:=replace(d,'yz101.ai_evaluation_requests','aikocu.practice_evaluations');
    d:=replace(d,'yz101.ai_evaluation_tasks','aikocu.practice_rubrics');
    d:=replace(d,'yz101.pilot_answer_keys','aikocu.lesson_answer_keys');
    d:=replace(d,'yz101.pilot_progress','aikocu.lesson_progress');
    d:=replace(d,'yz101.lesson_state','aikocu.lesson_attempts');
    d:=replace(d,'yz101.lesson_submissions','aikocu.test_submissions');
    d:=replace(d,'yz101.lesson_access_for','aikocu.lesson_access');
    d:=replace(d,'yz101-mentor:','aikocu-mentor:');
    d:=replace(d,'yz101.','aikocu.');
    d:=replace(d,'p_task','p_lesson');
    d:=replace(d,'task_id','lesson_id');
    d:=replace(d,'ai_passed','practice_passed');
    d:=replace(d,'quiz_passed','test_passed');
    d:=replace(d,'ai_required','practice_required');
    d:=replace(d,'daily_ai_limit','daily_practice_limit');
    d:=replace(d,'Unknown task','Unknown lesson');
    if fn like '%yz101_test_out%' then
      -- Testle geçmek günlük hakka bağlı değildir
      d:=replace(d,E'  if aikocu.daily_limit_reached(u) then return jsonb_build_object(''status'',''daily_limit'',''access'',a); end if;\n','');
      if position('daily_limit' in d)>0 then raise exception 'test_out günlük hak satırı kaldırılamadı'; end if;
    end if;
    if position('yz101' in d)>0 then raise exception 'Eski ad kaldı: %', fn; end if;
    execute d;
  end loop;
end $$;
drop function public.yz101_lesson_test(text,integer[],numeric,uuid);
drop function public.yz101_test_out(text,integer[],numeric,uuid);
drop function public.yz101_ai_evaluation_control(text,uuid,text,text,uuid,jsonb);
drop function public.yz101_mentor_control(text,uuid,text,text,uuid,jsonb);
drop function aikocu.lesson_access_for(uuid,text);

-- 14) Ortak altyapı: giriş işareti, hesap silme, bildirim
do $$
declare d text;
begin
  d:=pg_get_functiondef('private.nora_push(text,jsonb)'::regprocedure);
  execute replace(d,'yz101.users','aikocu.users');

  d:=pg_get_functiondef('private.handle_new_user()'::regprocedure);
  execute replace(d,'''yz101''','''aikocu''');

  -- yz101.auth_user_map tablosu yok; eski koşul fonksiyonun çalışmasını engelliyordu
  d:=pg_get_functiondef('public.delete_account()'::regprocedure);
  d:=regexp_replace(d,'\s+OR EXISTS\(SELECT 1 FROM yz101\.auth_user_map WHERE target_user_id=v\)','','g');
  execute replace(d,'yz101.users','aikocu.users');
end $$;

create or replace function private.nora_push_enqueue() returns void language sql security definer set search_path to '' as $$
insert into private.nora_push_deliveries(subscription_id,event_key)
select t.id,'unlock:'||extract(epoch from l.last_at)::bigint::text
from private.nora_push_settings s
join private.nora_push_subscriptions t on t.user_id=s.user_id
join aikocu.users u on u.id=s.user_id
join lateral (select max(sc.created_at) last_at from aikocu.scores sc where sc.user_id=u.id and sc.type='lesson') l on l.last_at is not null
where s.enabled
  and now()>=l.last_at+interval '24 hours'
  and l.last_at>now()-interval '7 days'
  and (now() at time zone s.timezone)::time>='09:00'
  and (now() at time zone s.timezone)::time<'22:00'
  and aikocu.next_lesson(u.id) is not null
on conflict do nothing;
$$;

-- giriş işareti: mevcut kullanıcılar
update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{origin_app}','"aikocu"') where raw_app_meta_data->>'origin_app'='yz101';
update auth.users set raw_user_meta_data=jsonb_set(raw_user_meta_data,'{origin_app}','"aikocu"') where raw_user_meta_data->>'origin_app'='yz101';

update auth.users set raw_user_meta_data=(raw_user_meta_data-'yz101_mascot')||jsonb_build_object('aikocu_mascot',raw_user_meta_data->'yz101_mascot') where raw_user_meta_data ? 'yz101_mascot';

-- 15) İzinler
revoke all on function public.aikocu_api(text,jsonb), public.aikocu_lesson_test(text,integer[],numeric,uuid), public.aikocu_test_out(text,integer[],numeric,uuid) from public, anon;
grant execute on function public.aikocu_api(text,jsonb), public.aikocu_lesson_test(text,integer[],numeric,uuid), public.aikocu_test_out(text,integer[],numeric,uuid) to authenticated, service_role;
revoke all on function public.aikocu_practice_control(text,uuid,text,text,uuid,jsonb), public.aikocu_mentor_control(text,uuid,text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.aikocu_practice_control(text,uuid,text,text,uuid,jsonb), public.aikocu_mentor_control(text,uuid,text,text,uuid,jsonb) to service_role;
revoke all on all functions in schema aikocu from public, anon, authenticated;
grant execute on all functions in schema aikocu to service_role;

-- 16) Son kontrol: eski ad kalmamalı
do $$
declare bad text;
begin
  select string_agg(n.nspname||'.'||p.proname,', ') into bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where p.prosrc ilike '%yz101%' or p.proname ilike '%yz101%';
  if bad is not null then raise exception 'Eski ad kalan fonksiyonlar: %', bad; end if;
  if exists(select 1 from pg_namespace where nspname='yz101') then raise exception 'yz101 şeması hâlâ var'; end if;
end $$;
