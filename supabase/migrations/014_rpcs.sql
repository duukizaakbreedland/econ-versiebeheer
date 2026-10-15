-- ═══════════════════════════════════════════════════════════════════════════════
-- 014 — alle schrijfacties als één transactie in de database
--
-- Registreren, promoveren, terugdraaien, verwijderen en koppelen waren tot nu
-- toe reeksen losse REST-calls vanuit de browser; viel er één om, dan bleef de
-- database half bijgewerkt. Vanaf nu is elke actie één functie: alles of niets,
-- met een duidelijke Nederlandse foutmelding en een regel in activity_log.
--
-- Alle functies draaien als de ingelogde gebruiker (security invoker), dus de
-- RLS-regels blijven gelden. auth.jwt() geeft het e-mailadres; via de CLI is dat
-- er niet, dan staat er 'cli'.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Hulpfuncties ─────────────────────────────────────────────────────────────
create or replace function public.current_user_email()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(auth.jwt() ->> 'email', ''), 'cli');
$$;

-- "Profielmodel 25.03.06": voor meldingen en het log
create or replace function public.mv_label(p_mv uuid)
returns text
language sql
stable
set search_path = public
as $$
  select m.name || ' ' || mv.version
    from model_versions mv join models m on m.id = mv.model_id
   where mv.id = p_mv;
$$;

create or replace function public.log_activity(
  p_action   text,
  p_summary  text,
  p_details  jsonb,
  p_model_id uuid,
  p_mv       uuid,
  p_env      uuid,
  p_log      uuid
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into activity_log (user_email, action, summary, details, model_id, model_version_id, environment_id, deployment_log_id)
  values (public.current_user_email(), p_action, p_summary, coalesce(p_details, '{}'::jsonb), p_model_id, p_mv, p_env, p_log);
end $$;

-- ─── Nieuwe versie registreren ────────────────────────────────────────────────
-- p_inherit_from: [{version_id, env_id}] in volgorde van voorkeur; van de eerste
--   die aanroepen heeft, worden de kindaanroepen overgenomen voor de nieuwe versie.
-- p_callers:      [{parent_version_id, interface_version_id|null}]: deze ouders
--   gaan de nieuwe versie aanroepen in p_env_id. Zonder interface wordt die van
--   de bestaande aanroep van die ouder (of een andere versie ervan) genomen.
create or replace function public.register_version(
  p_model_id     uuid,
  p_version      text,
  p_env_id       uuid,
  p_consultant   text,
  p_ticket       text,
  p_description  text,
  p_inherit_from jsonb,
  p_callers      jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_version     text := trim(coalesce(p_version, ''));
  v_model       models%rowtype;
  v_env         environments%rowtype;
  v_mv          uuid;
  v_n           int;
  v_inh         record;
  v_c           record;
  v_iface       uuid;
  v_omgezet     int  := 0;
  v_overgenomen int  := 0;
  v_bron        text := null;
begin
  select * into v_model from models where id = p_model_id;
  if v_model.id is null then raise exception 'Model niet gevonden'; end if;
  if v_model.type <> 'MODEL' then raise exception 'Alleen een model krijgt een nieuwe versie, geen interface'; end if;
  select * into v_env from environments where id = p_env_id;
  if v_env.id is null then raise exception 'Omgeving niet gevonden'; end if;
  if v_version = '' then raise exception 'Vul een versienummer in'; end if;
  if trim(coalesce(p_consultant, '')) = '' then raise exception 'Vul in wie eraan werkt'; end if;
  if trim(coalesce(p_ticket, '')) = '' then raise exception 'Vul een ticketnummer in'; end if;
  if exists (select 1 from model_versions where model_id = p_model_id and version = v_version) then
    raise exception 'Versie % van % bestaat al. Hang er werk aan met "+ Werk", of promoveer hem.', v_version, v_model.name;
  end if;

  insert into model_versions (model_id, version, created_by)
  values (p_model_id, v_version, public.current_user_email())
  returning id into v_mv;

  insert into environment_versions (environment_id, model_version_id, activated_at)
  values (p_env_id, v_mv, now());

  -- Kindaanroepen overnemen van de eerste kandidaat die er heeft
  for v_inh in
    select (x ->> 'version_id')::uuid as version_id, (x ->> 'env_id')::uuid as env_id
      from jsonb_array_elements(coalesce(p_inherit_from, '[]'::jsonb)) x
  loop
    insert into dependencies (environment_id, parent_version_id, interface_version_id, child_version_id, child_missing_in_export)
    select p_env_id, v_mv, d.interface_version_id, d.child_version_id, d.child_missing_in_export
      from dependencies d
     where d.environment_id = v_inh.env_id and d.parent_version_id = v_inh.version_id
    on conflict (environment_id, parent_version_id, child_model_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_overgenomen := v_n;
      v_bron := public.mv_label(v_inh.version_id);
      exit;
    end if;
  end loop;

  -- De ouders laten de nieuwe versie aanroepen
  for v_c in
    select (x ->> 'parent_version_id')::uuid           as parent_version_id,
           nullif(x ->> 'interface_version_id', '')::uuid as interface_version_id
      from jsonb_array_elements(coalesce(p_callers, '[]'::jsonb)) x
  loop
    v_iface := v_c.interface_version_id;
    if v_iface is null then
      select d.interface_version_id into v_iface
        from dependencies d
       where d.parent_version_id = v_c.parent_version_id and d.child_model_id = p_model_id
       order by (d.environment_id = p_env_id) desc, d.created_at desc
       limit 1;
    end if;
    if v_iface is null then
      select d.interface_version_id into v_iface
        from dependencies d
        join model_versions pv on pv.id = d.parent_version_id
       where pv.model_id = (select model_id from model_versions where id = v_c.parent_version_id)
         and d.child_model_id = p_model_id
       order by d.created_at desc
       limit 1;
    end if;
    if v_iface is null then
      raise exception 'Geen interface bekend tussen % en %; leg de aanroep eerst met de hand vast.',
        public.mv_label(v_c.parent_version_id), v_model.name;
    end if;

    insert into dependencies (environment_id, parent_version_id, interface_version_id, child_version_id, child_missing_in_export)
    values (p_env_id, v_c.parent_version_id, v_iface, v_mv, false)
    on conflict (environment_id, parent_version_id, child_model_id) do update
      set previous_child_version_id = dependencies.child_version_id,
          child_version_id          = excluded.child_version_id,
          interface_version_id      = excluded.interface_version_id,
          child_missing_in_export   = false
      where dependencies.child_version_id is distinct from excluded.child_version_id;
    get diagnostics v_n = row_count;
    v_omgezet := v_omgezet + v_n;
  end loop;

  insert into work_items (model_version_id, consultant, description, ticket, status)
  values (v_mv, trim(p_consultant), coalesce(p_description, ''), trim(p_ticket), 'IN_PROGRESS');

  perform public.log_activity(
    'register',
    format('%s %s geregistreerd in %s (%s)', v_model.name, v_version, v_env.name, trim(p_ticket)),
    jsonb_build_object('ticket', trim(p_ticket), 'consultant', trim(p_consultant),
                       'aanroepen_omgezet', v_omgezet, 'aanroepen_overgenomen', v_overgenomen, 'overgenomen_van', v_bron),
    p_model_id, v_mv, p_env_id, null);

  return v_mv;
end $$;

-- ─── Release: promoveren naar een omgeving ────────────────────────────────────
-- p_versions:    [{naar, van|null}]  versie-id's: naar wordt actief, van wordt vervangen
-- p_koppelingen: [{parent_version_id, interface_version_id, child_version_id, child_missing_in_export?}]
--   de aanroepen zoals ze in de doelomgeving moeten komen te staan
create or replace function public.apply_release(
  p_env_id      uuid,
  p_ticket      text,
  p_tested_by   text,
  p_notes       text,
  p_versions    jsonb,
  p_koppelingen jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_env        environments%rowtype;
  v_log        uuid;
  v_v          record;
  v_k          record;
  v_old        dependencies%rowtype;
  v_ev         environment_versions%rowtype;
  v_wi         record;
  v_changes    jsonb := '[]'::jsonb;
  v_naar_st    text;
  v_van_st     text[];
  v_nv         int := 0;
  v_nk         int := 0;
  v_labels     text[] := '{}';
begin
  select * into v_env from environments where id = p_env_id;
  if v_env.id is null then raise exception 'Omgeving niet gevonden'; end if;
  if trim(coalesce(p_ticket, '')) = '' then raise exception 'Vul een ticketnummer in'; end if;
  if trim(coalesce(p_tested_by, '')) = '' then raise exception 'Vul in wie het heeft getest'; end if;

  -- Wat verandert er echt?
  select count(*) into v_nv from (
    select distinct (x ->> 'naar')::uuid
      from jsonb_array_elements(coalesce(p_versions, '[]'::jsonb)) x
     where (x ->> 'naar') is not null and (x ->> 'naar') is distinct from (x ->> 'van')) s;

  select count(*) into v_nk from (
    select 1
      from jsonb_array_elements(coalesce(p_koppelingen, '[]'::jsonb)) x
      join model_versions cv on cv.id = (x ->> 'child_version_id')::uuid
      left join dependencies d
        on d.environment_id = p_env_id
       and d.parent_version_id = (x ->> 'parent_version_id')::uuid
       and d.child_model_id = cv.model_id
     where d.id is null
        or d.child_version_id <> cv.id
        or d.interface_version_id <> (x ->> 'interface_version_id')::uuid) s;

  if v_nv = 0 and v_nk = 0 then
    raise exception 'Alles staat al gelijk in %', v_env.name;
  end if;

  insert into deployment_logs (environment_id, ticket, tested_by, notes, deployed_by)
  values (p_env_id, trim(p_ticket), trim(p_tested_by), nullif(trim(coalesce(p_notes, '')), ''), public.current_user_email())
  returning id into v_log;

  -- Werkstatus die bij deze omgeving hoort
  if v_env.name = 'PROD' then
    v_naar_st := 'DONE';   v_van_st := array['IN_PROGRESS', 'REVIEW'];
  elsif v_env.name = 'ACC' then
    v_naar_st := 'REVIEW'; v_van_st := array['IN_PROGRESS'];
  else
    v_naar_st := null;     v_van_st := array[]::text[];
  end if;

  -- Versies activeren
  for v_v in
    select distinct on (naar) naar, van from (
      select (x ->> 'naar')::uuid as naar, nullif(x ->> 'van', '')::uuid as van
        from jsonb_array_elements(coalesce(p_versions, '[]'::jsonb)) x
       where (x ->> 'naar') is not null) s
     where naar is distinct from van
     order by naar, van
  loop
    if not exists (select 1 from model_versions where id = v_v.naar) then
      raise exception 'Versie bestaat niet (%)', v_v.naar;
    end if;
    select * into v_ev from environment_versions
     where environment_id = p_env_id and model_version_id = v_v.naar;

    insert into deployment_log_versions (deployment_log_id, model_version_id, role, was_present, previous_activated_at)
    values (v_log, v_v.naar, 'DEPLOYED', v_ev.id is not null, v_ev.activated_at);
    if v_v.van is not null then
      insert into deployment_log_versions (deployment_log_id, model_version_id, role, was_present)
      values (v_log, v_v.van, 'REPLACED', true);
    end if;

    insert into environment_versions (environment_id, model_version_id, activated_at)
    values (p_env_id, v_v.naar, now())
    on conflict (environment_id, model_version_id) do update set activated_at = now();

    if v_naar_st is not null then
      for v_wi in select id, status from work_items
                   where model_version_id = v_v.naar and status = any(v_van_st)
      loop
        update work_items set status = v_naar_st where id = v_wi.id;
        v_changes := v_changes || jsonb_build_object('id', v_wi.id, 'van', v_wi.status, 'naar', v_naar_st);
      end loop;
    end if;

    v_labels := v_labels || public.mv_label(v_v.naar);
  end loop;

  -- Aanroepen omzetten, met wat er stond erbij
  for v_k in
    select (x ->> 'parent_version_id')::uuid    as parent_version_id,
           (x ->> 'interface_version_id')::uuid as interface_version_id,
           (x ->> 'child_version_id')::uuid     as child_version_id,
           coalesce((x ->> 'child_missing_in_export')::boolean, false) as missing,
           cv.model_id                          as child_model_id
      from jsonb_array_elements(coalesce(p_koppelingen, '[]'::jsonb)) x
      join model_versions cv on cv.id = (x ->> 'child_version_id')::uuid
  loop
    select * into v_old from dependencies
     where environment_id = p_env_id
       and parent_version_id = v_k.parent_version_id
       and child_model_id = v_k.child_model_id
     for update;

    if v_old.id is not null
       and v_old.child_version_id = v_k.child_version_id
       and v_old.interface_version_id = v_k.interface_version_id then
      continue;
    end if;

    insert into deployment_log_dependencies
      (deployment_log_id, parent_version_id, interface_version_id, child_model_id,
       old_child_version_id, old_interface_version_id, old_child_missing, new_child_version_id)
    values
      (v_log, v_k.parent_version_id, v_k.interface_version_id, v_k.child_model_id,
       v_old.child_version_id, v_old.interface_version_id, coalesce(v_old.child_missing_in_export, false), v_k.child_version_id);

    insert into dependencies (environment_id, parent_version_id, interface_version_id, child_version_id, child_missing_in_export)
    values (p_env_id, v_k.parent_version_id, v_k.interface_version_id, v_k.child_version_id, v_k.missing)
    on conflict (environment_id, parent_version_id, child_model_id) do update
      set previous_child_version_id = case when dependencies.child_version_id <> excluded.child_version_id
                                           then dependencies.child_version_id
                                           else dependencies.previous_child_version_id end,
          child_version_id          = excluded.child_version_id,
          interface_version_id      = excluded.interface_version_id,
          child_missing_in_export   = excluded.child_missing_in_export;
  end loop;

  update deployment_logs set work_item_changes = v_changes where id = v_log;

  perform public.log_activity(
    'release',
    format('Release naar %s: %s (ticket %s)', v_env.name,
           case when cardinality(v_labels) = 0 then format('%s aanroep(en) omgezet', v_nk)
                when cardinality(v_labels) <= 3 then array_to_string(v_labels, ', ')
                else format('%s versies', cardinality(v_labels)) end,
           trim(p_ticket)),
    jsonb_build_object('ticket', trim(p_ticket), 'tested_by', trim(p_tested_by),
                       'versies', v_labels, 'aanroepen', v_nk),
    null, null, p_env_id, v_log);

  return v_log;
end $$;

-- ─── Release terugdraaien ─────────────────────────────────────────────────────
-- Zet alles terug zoals het vóór de release stond en markeert de release als
-- teruggedraaid; hij blijft in de geschiedenis staan.
create or replace function public.rollback_release(p_log_id uuid, p_reason text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_log       deployment_logs%rowtype;
  v_env       environments%rowtype;
  v_modellen  uuid[];
  v_nieuwer   record;
  v_d         record;
  v_dep       dependencies%rowtype;
  v_v         record;
  v_wi        record;
  v_hersteld  int := 0;
  v_weg       int := 0;
  v_aanroepen int := 0;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'Geef een reden voor het terugdraaien'; end if;

  select * into v_log from deployment_logs where id = p_log_id for update;
  if v_log.id is null then raise exception 'Release niet gevonden'; end if;
  if v_log.rolled_back_at is not null then raise exception 'Deze release is al teruggedraaid'; end if;
  select * into v_env from environments where id = v_log.environment_id;

  select array_agg(distinct m) into v_modellen from (
    select mv.model_id as m
      from deployment_log_versions v join model_versions mv on mv.id = v.model_version_id
     where v.deployment_log_id = p_log_id
    union
    select d.child_model_id from deployment_log_dependencies d where d.deployment_log_id = p_log_id) x;

  select l.deployed_at, l.ticket into v_nieuwer
    from deployment_logs l
   where l.environment_id = v_log.environment_id
     and l.deployed_at > v_log.deployed_at
     and l.rolled_back_at is null
     and (exists (select 1 from deployment_log_versions v join model_versions mv on mv.id = v.model_version_id
                   where v.deployment_log_id = l.id and mv.model_id = any(v_modellen))
          or exists (select 1 from deployment_log_dependencies d
                      where d.deployment_log_id = l.id and d.child_model_id = any(v_modellen)))
   order by l.deployed_at
   limit 1;
  if found then
    raise exception 'Er is hierna een nieuwere release over dezelfde modellen gegaan (%, ticket %). Draai die eerst terug.',
      to_char(v_nieuwer.deployed_at, 'DD-MM-YYYY'), coalesce(v_nieuwer.ticket, '-');
  end if;

  -- Aanroepen terug
  for v_d in select * from deployment_log_dependencies where deployment_log_id = p_log_id loop
    select * into v_dep from dependencies
     where environment_id = v_log.environment_id
       and parent_version_id = v_d.parent_version_id
       and child_model_id = v_d.child_model_id
     for update;
    if v_dep.id is null then
      if v_d.old_child_version_id is null then continue; end if;
      raise exception 'De aanroep van % naar % is sindsdien weggehaald; leg die eerst terug.',
        public.mv_label(v_d.parent_version_id), (select name from models where id = v_d.child_model_id);
    end if;
    if v_dep.child_version_id <> v_d.new_child_version_id then
      raise exception 'De aanroep van % naar % is sindsdien met de hand gewijzigd (nu %); zet die eerst terug.',
        public.mv_label(v_d.parent_version_id), (select name from models where id = v_d.child_model_id),
        (select version from model_versions where id = v_dep.child_version_id);
    end if;
    if v_d.old_child_version_id is null then
      delete from dependencies where id = v_dep.id;
    else
      update dependencies
         set child_version_id          = v_d.old_child_version_id,
             interface_version_id      = coalesce(v_d.old_interface_version_id, interface_version_id),
             child_missing_in_export   = v_d.old_child_missing,
             previous_child_version_id = null
       where id = v_dep.id;
    end if;
    v_aanroepen := v_aanroepen + 1;
  end loop;

  -- Versies terug
  for v_v in select * from deployment_log_versions where deployment_log_id = p_log_id loop
    if v_v.role = 'DEPLOYED' then
      if v_v.was_present then
        update environment_versions
           set activated_at = coalesce(v_v.previous_activated_at, activated_at)
         where environment_id = v_log.environment_id and model_version_id = v_v.model_version_id;
      else
        delete from environment_versions
         where environment_id = v_log.environment_id and model_version_id = v_v.model_version_id;
      end if;
      v_weg := v_weg + 1;
    else
      insert into environment_versions (environment_id, model_version_id, activated_at)
      values (v_log.environment_id, v_v.model_version_id, now())
      on conflict (environment_id, model_version_id) do update set activated_at = now();
      v_hersteld := v_hersteld + 1;
    end if;
  end loop;

  -- Werkstatus terug, alleen als die nog is wat de release zette
  for v_wi in
    select (x ->> 'id')::uuid as id, x ->> 'van' as van, x ->> 'naar' as naar
      from jsonb_array_elements(coalesce(v_log.work_item_changes, '[]'::jsonb)) x
  loop
    update work_items set status = v_wi.van where id = v_wi.id and status = v_wi.naar;
  end loop;

  update deployment_logs
     set rolled_back_at = now(), rolled_back_by = public.current_user_email(), rollback_reason = trim(p_reason)
   where id = p_log_id;

  perform public.log_activity(
    'rollback',
    format('Release naar %s van %s teruggedraaid (ticket %s): %s', v_env.name,
           to_char(v_log.deployed_at, 'DD-MM-YYYY'), coalesce(v_log.ticket, '-'), trim(p_reason)),
    jsonb_build_object('hersteld', v_hersteld, 'verwijderd', v_weg, 'aanroepen', v_aanroepen, 'reden', trim(p_reason)),
    null, null, v_log.environment_id, p_log_id);

  return jsonb_build_object('hersteld', v_hersteld, 'verwijderd', v_weg, 'aanroepen', v_aanroepen);
end $$;

-- ─── Versie verwijderen ───────────────────────────────────────────────────────
-- Voor een versie die verkeerd is geregistreerd. Weigert zodra er historie aan
-- hangt of iets erop terugvalt dat niet te herstellen is.
create or replace function public.delete_version(p_mv_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mv     model_versions%rowtype;
  v_model  models%rowtype;
  v_rel    record;
  v_lijst  text;
  v_n      int;
  v_envs   text;
begin
  select * into v_mv from model_versions where id = p_mv_id for update;
  if v_mv.id is null then raise exception 'Versie niet gevonden'; end if;
  select * into v_model from models where id = v_mv.model_id;

  select l.deployed_at, l.ticket, e.name as env into v_rel
    from deployment_logs l join environments e on e.id = l.environment_id
   where exists (select 1 from deployment_log_versions v where v.deployment_log_id = l.id and v.model_version_id = p_mv_id)
      or exists (select 1 from deployment_log_dependencies d where d.deployment_log_id = l.id
                    and p_mv_id in (d.parent_version_id, d.interface_version_id, d.old_child_version_id, d.new_child_version_id, d.old_interface_version_id))
   order by l.deployed_at desc
   limit 1;
  if found then
    raise exception '% % zit in een release (% naar %, ticket %). Releases blijven staan; draai hem eventueel terug, maar de versie blijft bestaan.',
      v_model.name, v_mv.version, to_char(v_rel.deployed_at, 'DD-MM-YYYY'), v_rel.env, coalesce(v_rel.ticket, '-');
  end if;

  select string_agg(e.name, ', ' order by e.display_order) into v_envs
    from environment_versions ev join environments e on e.id = ev.environment_id
   where ev.model_version_id = p_mv_id and e.name <> 'TST';
  if v_envs is not null then
    raise exception '% % staat in % en is daar niet zomaar weg te halen. Verwijderen kan alleen voor een versie die alleen in TST staat.',
      v_model.name, v_mv.version, v_envs;
  end if;

  select count(*) into v_n from dependencies where interface_version_id = p_mv_id;
  if v_n > 0 then
    raise exception 'Interface % % wordt nog in % aanroep(en) gebruikt. Wijzig die aanroepen eerst.', v_model.name, v_mv.version, v_n;
  end if;

  select string_agg(public.mv_label(d.parent_version_id) || ' (' || e.name || ')', ', ') into v_lijst
    from dependencies d join environments e on e.id = d.environment_id
   where d.child_version_id = p_mv_id and d.previous_child_version_id is null;
  if v_lijst is not null then
    raise exception '% % wordt nog aangeroepen door % en er is geen vorige versie om op terug te vallen. Zet die aanroepen eerst om.',
      v_model.name, v_mv.version, v_lijst;
  end if;

  -- Aanroepers terug naar de versie van vóór de registratie
  update dependencies
     set child_version_id = previous_child_version_id, previous_child_version_id = null
   where child_version_id = p_mv_id and previous_child_version_id is not null;
  get diagnostics v_n = row_count;

  delete from model_versions where id = p_mv_id;

  perform public.log_activity(
    'delete_version',
    format('%s %s verwijderd (%s aanroep(en) teruggezet)', v_model.name, v_mv.version, v_n),
    jsonb_build_object('version', v_mv.version, 'aanroepen_teruggezet', v_n),
    v_model.id, null, null, null);
end $$;

-- ─── Eén aanroep vastleggen of wijzigen ───────────────────────────────────────
-- p_targets: [{env_id, parent_version_id}]: in elk van die omgevingen gaat die
-- ouderversie het submodel aanroepen op de opgegeven versie via de interface.
create or replace function public.set_dependency(
  p_targets            jsonb,
  p_interface_model_id uuid,
  p_interface_version  text,
  p_child_model_id     uuid,
  p_child_version      text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_iface_model models%rowtype;
  v_child_model models%rowtype;
  v_iface_mv    uuid;
  v_child_mv    uuid;
  v_t           record;
  v_parent      model_versions%rowtype;
  v_env         environments%rowtype;
  v_n           int := 0;
  v_labels      text[] := '{}';
begin
  if trim(coalesce(p_interface_version, '')) = '' then raise exception 'Vul de interfaceversie in'; end if;
  if trim(coalesce(p_child_version, '')) = '' then raise exception 'Vul de versie van het submodel in'; end if;
  if jsonb_array_length(coalesce(p_targets, '[]'::jsonb)) = 0 then raise exception 'Kies minstens één omgeving'; end if;

  select * into v_iface_model from models where id = p_interface_model_id;
  if v_iface_model.id is null or v_iface_model.type <> 'INTERFACE' then raise exception 'Kies een interface'; end if;
  select * into v_child_model from models where id = p_child_model_id;
  if v_child_model.id is null or v_child_model.type <> 'MODEL' then raise exception 'Kies een submodel'; end if;

  insert into model_versions (model_id, version, created_by)
  values (p_interface_model_id, trim(p_interface_version), public.current_user_email())
  on conflict (model_id, version) do update set version = excluded.version
  returning id into v_iface_mv;

  insert into model_versions (model_id, version, created_by)
  values (p_child_model_id, trim(p_child_version), public.current_user_email())
  on conflict (model_id, version) do update set version = excluded.version
  returning id into v_child_mv;

  for v_t in
    select (x ->> 'env_id')::uuid as env_id, (x ->> 'parent_version_id')::uuid as parent_version_id
      from jsonb_array_elements(p_targets) x
  loop
    select * into v_env from environments where id = v_t.env_id;
    if v_env.id is null then raise exception 'Omgeving niet gevonden'; end if;
    select * into v_parent from model_versions where id = v_t.parent_version_id;
    if v_parent.id is null then raise exception 'Ouderversie niet gevonden'; end if;
    if v_parent.model_id = p_child_model_id then raise exception 'Een model kan zichzelf niet aanroepen'; end if;

    insert into dependencies (environment_id, parent_version_id, interface_version_id, child_version_id, child_missing_in_export)
    values (v_t.env_id, v_t.parent_version_id, v_iface_mv, v_child_mv, false)
    on conflict (environment_id, parent_version_id, child_model_id) do update
      set previous_child_version_id = case when dependencies.child_version_id <> excluded.child_version_id
                                           then dependencies.child_version_id
                                           else dependencies.previous_child_version_id end,
          child_version_id          = excluded.child_version_id,
          interface_version_id      = excluded.interface_version_id,
          child_missing_in_export   = false;
    v_n := v_n + 1;
    v_labels := v_labels || (public.mv_label(v_t.parent_version_id) || ' (' || v_env.name || ')');
  end loop;

  perform public.log_activity(
    'set_dependency',
    format('%s roept voortaan %s %s aan via %s %s', array_to_string(v_labels, ', '),
           v_child_model.name, trim(p_child_version), v_iface_model.name, trim(p_interface_version)),
    jsonb_build_object('targets', p_targets, 'interface', v_iface_model.name || ' ' || trim(p_interface_version),
                       'child', v_child_model.name || ' ' || trim(p_child_version)),
    p_child_model_id, v_child_mv, null, null);
end $$;

create or replace function public.remove_dependency(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_d   dependencies%rowtype;
  v_env text;
begin
  delete from dependencies where id = p_id returning * into v_d;
  if v_d.id is null then raise exception 'Aanroep niet gevonden'; end if;
  select name into v_env from environments where id = v_d.environment_id;
  perform public.log_activity(
    'remove_dependency',
    format('Aanroep van %s naar %s weggehaald in %s', public.mv_label(v_d.parent_version_id), public.mv_label(v_d.child_version_id), v_env),
    jsonb_build_object('parent_version_id', v_d.parent_version_id, 'child_version_id', v_d.child_version_id,
                       'interface_version_id', v_d.interface_version_id),
    v_d.child_model_id, v_d.child_version_id, v_d.environment_id, null);
end $$;

-- ─── Momentopname voor de app ─────────────────────────────────────────────────
-- Alles wat de app nodig heeft in één consistente lees-actie en één jsonb-rij,
-- zodat de limiet van 1000 rijen per aanvraag nooit stilzwijgend iets afknipt.
create or replace function public.get_snapshot(p_org_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with org as (select id from organizations where slug = p_org_slug)
  select jsonb_build_object(
    'loaded_at', now(),
    'organization_id', (select id from org),
    'environments', (
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'display_order', e.display_order) order by e.display_order), '[]'::jsonb)
        from environments e where e.organization_id = (select id from org)),
    'models', (
      select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'type', m.type, 'notes', m.notes) order by m.name), '[]'::jsonb)
        from models m where m.organization_id = (select id from org)),
    'chains', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'key', c.key, 'label', c.label, 'root_model_id', c.root_model_id) order by c.label), '[]'::jsonb)
        from chains c where c.organization_id = (select id from org)),
    'versions', (
      select coalesce(jsonb_agg(jsonb_build_object('id', mv.id, 'model_id', mv.model_id, 'version', mv.version, 'notes', mv.notes,
                                                   'created_at', mv.created_at, 'created_by', mv.created_by)), '[]'::jsonb)
        from model_versions mv join models m on m.id = mv.model_id
       where m.organization_id = (select id from org)),
    'current', (
      select coalesce(jsonb_agg(jsonb_build_object('model_id', c.model_id, 'model_version_id', c.model_version_id, 'env', c.env_name,
                                                   'version', c.version, 'activated_at', c.activated_at)), '[]'::jsonb)
        from public.get_current_versions((select id from org)) c),
    'present', (
      select coalesce(jsonb_agg(jsonb_build_object('environment_id', ev.environment_id, 'env', e.name,
                                                   'model_version_id', ev.model_version_id, 'activated_at', ev.activated_at)), '[]'::jsonb)
        from environment_versions ev join environments e on e.id = ev.environment_id
       where e.organization_id = (select id from org)),
    'deps', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'environment_id', d.environment_id, 'env', e.name,
               'parent_version_id', d.parent_version_id, 'parent_model_id', pv.model_id, 'parent_version', pv.version,
               'interface_version_id', d.interface_version_id, 'iface_model_id', iv.model_id, 'iface_version', iv.version,
               'child_version_id', d.child_version_id, 'child_model_id', d.child_model_id, 'child_version', cv.version,
               'ontbreekt', d.child_missing_in_export, 'previous_child_version_id', d.previous_child_version_id)), '[]'::jsonb)
        from dependencies d
        join environments e on e.id = d.environment_id
        join model_versions pv on pv.id = d.parent_version_id
        join model_versions iv on iv.id = d.interface_version_id
        join model_versions cv on cv.id = d.child_version_id
       where e.organization_id = (select id from org)),
    'work_items', (
      select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'model_version_id', w.model_version_id, 'model_id', mv.model_id,
                                                   'version', mv.version, 'consultant', w.consultant, 'description', w.description,
                                                   'ticket', w.ticket, 'status', w.status, 'created_at', w.created_at, 'updated_at', w.updated_at)
                                 order by w.created_at), '[]'::jsonb)
        from work_items w join model_versions mv on mv.id = w.model_version_id join models m on m.id = mv.model_id
       where m.organization_id = (select id from org))
  );
$$;

-- ─── Rechten ──────────────────────────────────────────────────────────────────
-- Alleen ingelogde gebruikers mogen de functies aanroepen; anoniem niets.
revoke execute on function public.register_version(uuid, text, uuid, text, text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.apply_release(uuid, text, text, text, jsonb, jsonb)             from public, anon;
revoke execute on function public.rollback_release(uuid, text)                                    from public, anon;
revoke execute on function public.delete_version(uuid)                                            from public, anon;
revoke execute on function public.set_dependency(jsonb, uuid, text, uuid, text)                   from public, anon;
revoke execute on function public.remove_dependency(uuid)                                         from public, anon;
revoke execute on function public.get_snapshot(text)                                              from public, anon;
revoke execute on function public.log_activity(text, text, jsonb, uuid, uuid, uuid, uuid)         from public, anon;
revoke execute on function public.ensure_present(uuid, uuid)                                      from public, anon;

grant execute on function public.register_version(uuid, text, uuid, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.apply_release(uuid, text, text, text, jsonb, jsonb)             to authenticated;
grant execute on function public.rollback_release(uuid, text)                                    to authenticated;
grant execute on function public.delete_version(uuid)                                            to authenticated;
grant execute on function public.set_dependency(jsonb, uuid, text, uuid, text)                   to authenticated;
grant execute on function public.remove_dependency(uuid)                                         to authenticated;
grant execute on function public.get_snapshot(text)                                              to authenticated;
grant execute on function public.log_activity(text, text, jsonb, uuid, uuid, uuid, uuid)         to authenticated;
grant execute on function public.ensure_present(uuid, uuid)                                      to authenticated;
grant execute on function public.current_user_email()                                            to authenticated;
grant execute on function public.mv_label(uuid)                                                  to authenticated;
