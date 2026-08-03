-- ═══════════════════════════════════════════════════════════════════════════════
-- 006 — eenmalige backfill van de koppelingen
--
-- Leidt uit de bestaande ketenstructuur (parent → interface → child) af welke
-- versies er op dit moment per omgeving aan elkaar hangen, en legt die vast.
-- Vanaf nu houdt de app het bij: elke promotie schrijft een nieuwe momentopname.
--
-- Idempotent: opnieuw draaien voegt niets dubbel toe.
-- ═══════════════════════════════════════════════════════════════════════════════

with cur as (
  select o.id as org_id, g.*
  from organizations o
  cross join lateral get_current_versions(o.id) g
)
insert into dependencies (
  environment_id, parent_version_id, interface_version_id, child_version_id, child_model_id
)
select e.id, pv.model_version_id, iv.model_version_id, cv.model_version_id, cn_c.model_id
from chains ch
join environments e   on e.organization_id = ch.organization_id
join chain_nodes cn_i on cn_i.chain_id = ch.id
join models mi        on mi.id = cn_i.model_id and mi.type = 'INTERFACE'
join chain_edges e_pi on e_pi.chain_id = ch.id and e_pi.target_key = cn_i.node_key
join chain_edges e_ic on e_ic.chain_id = ch.id and e_ic.source_key = cn_i.node_key
join chain_nodes cn_p on cn_p.chain_id = ch.id and cn_p.node_key = e_pi.source_key
join chain_nodes cn_c on cn_c.chain_id = ch.id and cn_c.node_key = e_ic.target_key
join cur pv on pv.org_id = ch.organization_id and pv.model_id = cn_p.model_id and pv.env_name = e.name
join cur iv on iv.org_id = ch.organization_id and iv.model_id = cn_i.model_id and iv.env_name = e.name
join cur cv on cv.org_id = ch.organization_id and cv.model_id = cn_c.model_id and cv.env_name = e.name
on conflict (environment_id, parent_version_id, interface_version_id, child_model_id) do nothing;
