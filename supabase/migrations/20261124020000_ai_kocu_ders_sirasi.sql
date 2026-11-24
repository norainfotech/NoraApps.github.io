-- Dersler koçun belirlediği sırayla açılır (herkes için, premium dahil).
create or replace function yz101.lesson_access_for(u uuid, t text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r yz101.lesson_state; premium boolean; tester boolean; lim integer;
begin
  if not exists(select 1 from yz101.lessons where task_id=t) then raise exception 'Unknown task'; end if;
  if not exists(select 1 from yz101.pilot_progress p where p.user_id=u and p.task_id=t and p.completed)
     and exists(select 1 from yz101.lessons l2 join yz101.lessons l on l.task_id=t
                where l2.published and l2.ord<l.ord
                  and not exists(select 1 from yz101.pilot_progress p2 where p2.user_id=u and p2.task_id=l2.task_id and p2.completed))
  then raise exception 'Önce sıradaki dersi tamamla.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,101));
  insert into yz101.lesson_state(user_id,task_id) values(u,t) on conflict do nothing;
  update yz101.lesson_state set failures=0,locked_until=null,reason=null,cycle=cycle+1,updated_at=now()
   where user_id=u and task_id=t and locked_until<=now();
  select * into r from yz101.lesson_state where user_id=u and task_id=t;
  select coalesce(is_premium,false),coalesce(is_tester,false) into premium,tester from yz101.users where id=u;
  premium:=coalesce(premium,false); tester:=coalesce(tester,false) or premium;
  lim:=yz101.attempt_limit(u);
  return jsonb_build_object('task_id',t,'premium',premium,'bypass',tester,'failures',r.failures,
    'attempts_remaining',case when tester then null else greatest(0,lim-r.failures) end,
    'cooldown_until',case when tester then null else r.locked_until end,
    'reason',case when tester then null else r.reason end,
    'cycle',r.cycle,'server_now',now());
end $$;
create or replace function public.yz101_coach(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v uuid:=auth.uid(); u yz101.users; lim integer; prem boolean; tester boolean; goal_value text;
  name_value text; task text; em text;
begin
  if v is null or not exists(select 1 from auth.users where id=v and deleted_at is null) then
    raise exception 'Oturum açmanız gerekiyor.' using errcode='28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v::text,101));
  select * into u from yz101.users where id=v;
  if p_action='state' then
    lim:=yz101.attempt_limit(v);
    prem:=coalesce(u.is_premium,false); tester:=coalesce(u.is_tester,false) or prem;
    return jsonb_build_object(
      'server_now',now(),
      'profile',case when u.id is null then null else to_jsonb(u)-'expo_push_token' end,
      'account',jsonb_build_object('email',(select email from auth.users where id=v),'anonymous',coalesce((select is_anonymous from auth.users where id=v),false)),
      'points',coalesce((select sum(points) from yz101.scores where user_id=v),0),
      'lessons',coalesce((select jsonb_agg(jsonb_build_object(
          'task_id',l.task_id,'level',l.level,'ord',l.ord,'points',l.points,'published',l.published,
          'completed',coalesce(p.completed,false),'via',p.via,'ai_passed',coalesce(p.ai_passed,false),'quiz_passed',coalesce(p.quiz_passed,false),
          'listed',coalesce(s.listed,false),
          'open',not exists(select 1 from yz101.lessons l2 where l2.published and l2.ord<l.ord
             and not exists(select 1 from yz101.pilot_progress p2 where p2.user_id=v and p2.task_id=l2.task_id and p2.completed)),
          'locked_until',case when s.locked_until>now() then s.locked_until end,
          'failures',case when s.locked_until<=now() then 0 else coalesce(s.failures,0) end,
          'attempts_remaining',case when tester then null when s.locked_until>now() then 0
             else greatest(0,lim-case when s.locked_until<=now() then 0 else coalesce(s.failures,0) end) end
        ) order by l.ord)
        from yz101.lessons l
        left join yz101.pilot_progress p on p.user_id=v and p.task_id=l.task_id
        left join yz101.lesson_state s on s.user_id=v and s.task_id=l.task_id),'[]'::jsonb),
      'access',jsonb_build_object('premium',prem,'bypass',tester,'attempt_limit',lim,'daily_limit',2,
        'daily_reached',yz101.daily_limit_reached(v),
        'daily_done',(select count(*) from yz101.scores s where s.user_id=v and s.type in ('pilot_lesson','pilot_lesson_test')
           and (s.created_at at time zone 'Europe/Istanbul')::date=(now() at time zone 'Europe/Istanbul')::date)),
      'placement',(select jsonb_build_object('done',done_at is not null,'result',result_level,'stage1',stage1_correct,'skipped',skipped)
        from yz101.placement where user_id=v));
  elsif p_action='start' then
    goal_value:=p_data->>'goal';
    if goal_value is null or goal_value not in ('Anlamak','Kullanmak','Üretmek') then raise exception 'Bir hedef seç.'; end if;
    if u.id is null then
      select email into em from auth.users where id=v;
      insert into yz101.users(id,username,email,goal,reminder_time)
        values(v,yz101.make_username(),em,goal_value,'20:00'::time) returning * into u;
    else
      update yz101.users set goal=goal_value where id=v returning * into u;
    end if;
    return to_jsonb(u)-'expo_push_token';
  elsif p_action='profile' then
    if u.id is null then raise exception 'Önce yolculuğunu başlat.'; end if;
    name_value:=coalesce(nullif(btrim(p_data->>'username'),''),u.username);
    goal_value:=coalesce(p_data->>'goal',u.goal);
    if length(name_value)<2 or length(name_value)>40 then raise exception 'Kullanıcı adı 2–40 karakter olmalı.'; end if;
    if goal_value not in ('Anlamak','Kullanmak','Üretmek') then raise exception 'Geçersiz hedef.'; end if;
    update yz101.users set username=name_value,goal=goal_value where id=v returning * into u;
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
