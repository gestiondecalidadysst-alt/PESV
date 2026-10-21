-- Versión 2.8: pasos conectados. Hallazgos por paso que se tratan en el plan de acción unificado
-- (paso 23) y relación de cada acción con su paso del PESV.

alter table actions add column step_number smallint check (step_number between 1 and 24);
create index actions_step_idx on actions (organization_id, step_number);

-- Acciones existentes: el paso se deduce de su origen.
update actions set step_number = 2 where source = 'comite' and step_number is null;
update actions set step_number = 13 where source = 'siniestro' and step_number is null;
update actions a set step_number = f.step_number
  from audit_findings f
 where a.source = 'hallazgo' and a.source_id = f.id and a.step_number is null and f.step_number is not null;
update actions a set step_number = i.step_number
  from indicators i
 where a.source = 'indicador' and a.source_id = i.id and a.step_number is null;

create table step_findings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  step_number      smallint not null check (step_number between 1 and 24),
  kind             text not null check (kind in ('no_conformidad', 'observacion', 'oportunidad_mejora')),
  origin           text not null default 'autoevaluacion' check (origin in ('autoevaluacion', 'comite', 'revision_direccion', 'auditoria', 'autoridad')),
  description      text not null,
  cause            text,
  detected_on      date not null,
  status           text not null default 'abierto' check (status in ('abierto', 'cerrado')),
  closure_note     text,
  closed_at        timestamptz,
  closed_by        uuid references users (id),
  created_by       uuid references users (id),
  created_at       timestamptz not null default now(),
  check (status = 'abierto' or (closed_at is not null and closure_note is not null))
);
create index step_findings_org_step_idx on step_findings (organization_id, step_number, status);

alter table step_findings enable row level security;
alter table step_findings force row level security;
create policy tenant_isolation on step_findings using (organization_id = app_current_org()) with check (organization_id = app_current_org());
create policy owner_access on step_findings to current_user using (true) with check (true);
grant select, insert, update, delete on step_findings to pesv_app;
