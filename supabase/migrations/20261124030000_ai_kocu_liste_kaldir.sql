-- Ders listem kaldirildi: coach list_add/list_remove ve state.listed temizlendi.
create or replace function public.yz101_coach(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v uuid:=auth.uid(); u yz101.users; lim integer; prem boolean; tester boolean; goal_value text;
  name_value text; em text;
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
  end if;
  raise exception 'Geçersiz işlem.';
end $function$;
alter table yz101.lesson_state drop column if exists listed;
