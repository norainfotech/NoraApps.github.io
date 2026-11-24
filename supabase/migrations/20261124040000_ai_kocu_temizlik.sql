-- 1) Hatirlatma kuyrugu yeni kurallara gore: eski level/haber/modul mantigi kaldirildi.
create or replace function private.nora_push_enqueue()
returns void language sql security definer set search_path to '' as $function$
insert into private.nora_push_deliveries(subscription_id,event_key)
select t.id,'daily:'||(now() at time zone s.timezone)::date::text
from private.nora_push_settings s
join private.nora_push_subscriptions t on t.user_id=s.user_id
join yz101.users u on u.id=s.user_id
where s.enabled
  and (now() at time zone s.timezone)::time>=s.reminder_time
  and (now() at time zone s.timezone)::time<'22:00'
  and not exists(select 1 from yz101.scores sc where sc.user_id=u.id and sc.type in ('pilot_lesson','pilot_lesson_test')
        and (sc.created_at at time zone 'Europe/Istanbul')::date=(now() at time zone 'Europe/Istanbul')::date)
  and exists(select 1 from yz101.lessons l where l.published
        and not exists(select 1 from yz101.pilot_progress p where p.user_id=u.id and p.task_id=l.task_id and p.completed))
on conflict do nothing;
$function$;

-- 2) Haber zamanlayicisi
select cron.unschedule('yz101-daily-rss') where exists(select 1 from cron.job where jobname='yz101-daily-rss');

-- 3) Kullanilmayan fonksiyonlar
drop function if exists public.yz101_lesson_state();
drop function if exists yz101.lesson_access_state(uuid);
drop function if exists public.yz101_pilot_progress(text,text,boolean,boolean);
drop function if exists public.yz101_pilot_submit(text,integer[],numeric);
drop function if exists public.yz101_news_summary(text,jsonb);
drop function if exists public.yz101_news_sync(text,jsonb);

-- 4) Kullanilmayan tablolar (haber, eski modul/seviye, v1 yedekleri, eski kullanici eslemesi)
drop table if exists yz101.user_news_points;
drop table if exists yz101.news_summary_jobs;
drop table if exists yz101.news_sync_status;
drop table if exists yz101.news;
drop table if exists yz101.user_module_progress;
drop table if exists yz101.modules;
drop table if exists yz101.scheduled_notifications;
drop table if exists yz101.web_exams;
drop table if exists yz101.level_determine_test_questions;
drop table if exists yz101.level_test_config;
drop table if exists yz101.level_test_questions;
drop table if exists yz101.v1_ai_evaluation_requests;
drop table if exists yz101.v1_ai_evaluation_tasks;
drop table if exists yz101.v1_lesson_submissions;
drop table if exists yz101.v1_mentor_responses;
drop table if exists yz101.v1_pilot_answer_keys;
drop table if exists yz101.v1_pilot_progress;
drop table if exists yz101.v1_scores_pilot;
drop table if exists yz101.auth_user_map;

-- 5) Kullanilmayan kolonlar
alter table yz101.users drop column if exists expo_push_token;
alter table yz101.users drop column if exists notification_prompt_completed;
