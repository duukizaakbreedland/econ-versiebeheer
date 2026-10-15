-- ═══════════════════════════════════════════════════════════════════════════════
-- 013 — keten = hoofdmodel, strengere koppelingen, aanwezigheid, historie, log
--
-- Alles in dit bestand is toevoegen of aanscherpen; niets wordt verwijderd. De
-- app van vóór deze migratie blijft dus werken. Opruimen (chain_nodes en
-- chain_edges weg) gebeurt pas in 015, na verificatie.
--
-- Elke stap begint met een controle die de hele migratie laat afbreken als de
-- data niet is wat we verwachten; db push draait het bestand als één transactie.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Keten = hoofdmodel ────────────────────────────────────────────────────
-- De graph wordt voortaan afgeleid uit de koppelingen, vanaf het hoofdmodel.
-- De vaste structuur (chain_nodes/chain_edges) is daarmee overbodig; het enige
-- dat een keten nog nodig heeft is zijn hoofdmodel.
alter table chains add column if not exists root_model_id uuid references models(id);

-- Het hoofdmodel is de node zonder inkomende verbinding. Bewust zonder limit:
-- levert een keten er meer dan één op, dan stopt de migratie hier.
update chains c
   set root_model_id = (
     select cn.model_id
       from chain_nodes cn
      where cn.chain_id = c.id
        and not exists (select 1 from chain_edges e
                         where e.chain_id = c.id and e.target_key = cn.node_key))
 where root_model_id is null;

do $$
begin
  if exists (select 1 from chains where root_model_id is null) then
    raise exception 'Niet elke keten heeft een hoofdmodel; vul chains.root_model_id eerst aan';
  end if;
end $$;

alter table chains alter column root_model_id set not null;
alter table chains add constraint chains_org_root_key unique (organization_id, root_model_id);
create index if not exists chains_root_model_idx on chains (root_model_id);

comment on column chains.root_model_id is
  'Het hoofdmodel van de keten. De keten is wat vanaf dit model via de koppelingen bereikbaar is.';

-- ─── 2. Koppelingen: één aanroep per ouderversie en submodel per omgeving ─────
-- De oude sleutel had de interfaceversie erin, waardoor dezelfde ouder hetzelfde
-- submodel twee keer kon aanroepen via twee interfaceversies. Dat komt in eCon
-- niet voor en de app werkte er al omheen.
do $$
declare v_n int;
begin
  select count(*) into v_n from (
    select 1 from dependencies
     group by environment_id, parent_version_id, child_model_id
    having count(*) > 1) x;
  if v_n > 0 then
    raise exception 'Er zijn % dubbele koppelingen (omgeving, ouderversie, submodel); los die eerst op', v_n;
  end if;
end $$;

alter table dependencies drop constraint dependencies_env_parent_iface_child_key;
alter table dependencies add constraint dependencies_env_parent_child_key
  unique (environment_id, parent_version_id, child_model_id);

create index if not exists dependencies_child_version_idx on dependencies (child_version_id);
create index if not exists dependencies_iface_version_idx on dependencies (interface_version_id);
create index if not exists dependencies_prev_child_idx    on dependencies (previous_child_version_id);

-- ─── 3. Integriteit van een koppeling ─────────────────────────────────────────
-- child_model_id blijft bestaan (de unieke sleutel heeft hem nodig) maar wordt
-- voortaan door de trigger gevuld uit child_version_id, zodat hij nooit meer
-- kan afwijken. De overige regels: ouder en submodel zijn modellen, de
-- interface is een interface, een model roept zichzelf niet aan, en de vorige
-- kindversie hoort bij hetzelfde submodel.
create or replace function public.dependencies_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_child_model  uuid;
  v_child_type   text;
  v_parent_model uuid;
  v_parent_type  text;
  v_iface_type   text;
  v_prev_model   uuid;
begin
  select mv.model_id, m.type into v_child_model, v_child_type
    from model_versions mv join models m on m.id = mv.model_id
   where mv.id = new.child_version_id;
  if v_child_model is null then
    raise exception 'Koppeling ongeldig: de aangeroepen versie bestaat niet';
  end if;
  if new.child_model_id is not null and new.child_model_id <> v_child_model then
    raise exception 'Koppeling ongeldig: child_model_id hoort niet bij de aangeroepen versie';
  end if;
  new.child_model_id := v_child_model;
  if v_child_type <> 'MODEL' then
    raise exception 'Koppeling ongeldig: het aangeroepen submodel moet een model zijn, geen interface';
  end if;

  select mv.model_id, m.type into v_parent_model, v_parent_type
    from model_versions mv join models m on m.id = mv.model_id
   where mv.id = new.parent_version_id;
  if v_parent_type is distinct from 'MODEL' then
    raise exception 'Koppeling ongeldig: de ouder moet een model zijn';
  end if;
  if v_parent_model = v_child_model then
    raise exception 'Koppeling ongeldig: een model kan zichzelf niet aanroepen';
  end if;

  select m.type into v_iface_type
    from model_versions mv join models m on m.id = mv.model_id
   where mv.id = new.interface_version_id;
  if v_iface_type is distinct from 'INTERFACE' then
    raise exception 'Koppeling ongeldig: de interface moet van het type interface zijn';
  end if;

  if new.previous_child_version_id is not null then
    select model_id into v_prev_model from model_versions where id = new.previous_child_version_id;
    if v_prev_model is distinct from v_child_model then
      raise exception 'Koppeling ongeldig: de vorige aangeroepen versie hoort niet bij hetzelfde submodel';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists dependencies_check on dependencies;
create trigger dependencies_check
  before insert or update on dependencies
  for each row execute function public.dependencies_check();

-- Alle bestaande koppelingen door dezelfde controle halen: faalt er één, dan
-- stopt de migratie. De rijen zelf veranderen niet.
update dependencies set id = id;

-- ─── 4. Aanwezigheid per omgeving ─────────────────────────────────────────────
-- environment_versions betekent voortaan: deze versie bestaat in deze omgeving.
-- Voor een hoofdmodel is de laatst geactiveerde versie de actuele; voor een
-- submodel zegt dat niets, want zijn versie in een keten is wat zijn ouder
-- aanroept. ensure_present legt een aanwezigheidsrij aan zonder ooit de actuele
-- versie te veranderen: hij krijgt een tijdstip vóór de nieuwste activering.
-- Heeft een hoofdmodel in die omgeving nog geen versie, dan doet hij niets:
-- een hoofdmodel wordt alleen expliciet actief gezet.
create or replace function public.ensure_present(p_env uuid, p_mv uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_model uuid;
  v_at    timestamptz;
begin
  if p_env is null or p_mv is null then return; end if;
  if exists (select 1 from environment_versions
              where environment_id = p_env and model_version_id = p_mv) then
    return;
  end if;
  select model_id into v_model from model_versions where id = p_mv;
  if v_model is null then return; end if;

  select max(ev.activated_at) - interval '1 second' into v_at
    from environment_versions ev
    join model_versions x on x.id = ev.model_version_id
   where ev.environment_id = p_env and x.model_id = v_model;

  if v_at is null and exists (select 1 from chains where root_model_id = v_model) then
    return;
  end if;

  insert into environment_versions (environment_id, model_version_id, activated_at)
  values (p_env, p_mv, least(now(), coalesce(v_at, now())))
  on conflict (environment_id, model_version_id) do nothing;
end $$;

-- Elke versie die in een koppeling voorkomt (ouder, interface, kind) bestaat in
-- die omgeving. Backfill voor de bestaande koppelingen…
do $$
begin
  perform public.ensure_present(d.environment_id, v)
     from dependencies d
    cross join lateral unnest(array[d.parent_version_id, d.interface_version_id, d.child_version_id]) as v;
end $$;

-- …en voortaan automatisch, ook als de sync-tool rechtstreeks SQL draait.
create or replace function public.dependencies_present()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.ensure_present(new.environment_id, new.parent_version_id);
  perform public.ensure_present(new.environment_id, new.interface_version_id);
  perform public.ensure_present(new.environment_id, new.child_version_id);
  return null;
end $$;

drop trigger if exists dependencies_present on dependencies;
create trigger dependencies_present
  after insert or update of environment_id, parent_version_id, interface_version_id, child_version_id
  on dependencies
  for each row execute function public.dependencies_present();

-- ─── 5. Actuele versie: vaste volgorde bij gelijke tijdstippen ────────────────
-- De seed en de eerste import deelden één now(); zonder tiebreaker was de
-- uitkomst dan toevallig.
create or replace function public.get_current_versions(p_org_id uuid)
returns table(
  model_id         uuid,
  model_version_id uuid,
  env_name         text,
  version          text,
  activated_at     timestamptz
)
language sql
stable
set search_path = public
as $$
  select distinct on (mv.model_id, e.name)
    mv.model_id,
    mv.id          as model_version_id,
    e.name         as env_name,
    mv.version,
    ev.activated_at
  from environment_versions ev
  join model_versions mv on mv.id = ev.model_version_id
  join environments   e  on e.id  = ev.environment_id
  where e.organization_id = p_org_id
  order by mv.model_id, e.name, ev.activated_at desc, ev.id desc;
$$;

-- ─── 6. Historie die een release nodig heeft om exact terug te kunnen ─────────
alter table model_versions add column if not exists created_by text;

alter table deployment_logs
  add column if not exists deployed_by       text,
  add column if not exists rolled_back_at    timestamptz,
  add column if not exists rolled_back_by    text,
  add column if not exists rollback_reason   text,
  add column if not exists work_item_changes jsonb not null default '[]'::jsonb;

comment on column deployment_logs.work_item_changes is
  'Per werk-item [{id, van, naar}]: welke status de release heeft gezet, zodat terugdraaien precies dat herstelt.';

alter table deployment_log_versions
  add column if not exists was_present           boolean not null default true,
  add column if not exists previous_activated_at timestamptz;

comment on column deployment_log_versions.was_present is
  'Stond de versie al in de omgeving vóór deze release? Zo ja, dan laat terugdraaien de aanwezigheid staan en zet alleen het tijdstip terug.';

-- Releases van vóór deze migratie: de versie kwam met de release mee, dus
-- terugdraaien mag de aanwezigheid weghalen, zoals rollbackDeployment al deed.
update deployment_log_versions set was_present = false;

alter table deployment_log_dependencies
  add column if not exists old_interface_version_id uuid references model_versions(id) on delete cascade;

-- work_items.updated_at liep nooit mee; nu wel
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists work_items_updated_at on work_items;
create trigger work_items_updated_at
  before update on work_items
  for each row execute function public.set_updated_at();

-- ─── 7. Activiteitenlog ───────────────────────────────────────────────────────
-- Wie deed wat, wanneer. Elke RPC schrijft één regel met een leesbare samenvatting.
create table if not exists activity_log (
  id                 uuid primary key default gen_random_uuid(),
  at                 timestamptz not null default now(),
  user_email         text not null,
  action             text not null,
  summary            text not null,
  model_id           uuid references models(id) on delete set null,
  model_version_id   uuid references model_versions(id) on delete set null,
  environment_id     uuid references environments(id) on delete set null,
  deployment_log_id  uuid references deployment_logs(id) on delete set null,
  details            jsonb not null default '{}'::jsonb
);

create index if not exists activity_log_at_idx        on activity_log (at desc);
create index if not exists activity_log_model_idx     on activity_log (model_id);
create index if not exists activity_log_mv_idx        on activity_log (model_version_id);
create index if not exists activity_log_env_idx       on activity_log (environment_id);
create index if not exists activity_log_log_idx       on activity_log (deployment_log_id);

alter table public.activity_log enable row level security;
drop policy if exists activity_log_authenticated_select on public.activity_log;
create policy activity_log_authenticated_select on public.activity_log
  for select to authenticated using (true);
drop policy if exists activity_log_authenticated_insert on public.activity_log;
create policy activity_log_authenticated_insert on public.activity_log
  for insert to authenticated with check (true);
-- Bewust geen update- of delete-policy: het log is alleen-toevoegen.

-- ─── 8. Indexen op foreign keys (adviseur) ────────────────────────────────────
create index if not exists deployment_log_dependencies_parent_idx     on deployment_log_dependencies (parent_version_id);
create index if not exists deployment_log_dependencies_iface_idx      on deployment_log_dependencies (interface_version_id);
create index if not exists deployment_log_dependencies_child_idx      on deployment_log_dependencies (child_model_id);
create index if not exists deployment_log_dependencies_old_child_idx  on deployment_log_dependencies (old_child_version_id);
create index if not exists deployment_log_dependencies_new_child_idx  on deployment_log_dependencies (new_child_version_id);
create index if not exists deployment_log_dependencies_old_iface_idx  on deployment_log_dependencies (old_interface_version_id);
create index if not exists deployment_log_versions_log_idx            on deployment_log_versions (deployment_log_id);
create index if not exists deployment_log_versions_mv_idx             on deployment_log_versions (model_version_id);
create index if not exists deployment_logs_env_idx                    on deployment_logs (environment_id);
create index if not exists environment_versions_mv_idx                on environment_versions (model_version_id);
create index if not exists work_items_mv_idx                          on work_items (model_version_id);
