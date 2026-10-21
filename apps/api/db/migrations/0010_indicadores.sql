-- Versión 2.5: indicadores del PESV (paso 20) con ficha técnica, resultados por periodo con su
-- análisis, y metas (paso 7) conectadas a un indicador para su seguimiento.

create table indicators (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete cascade,
  calculation       text,
  name              text not null,
  objective         text,
  kind              text not null check (kind in ('resultado', 'gestion', 'actividad')),
  formula           text not null,
  unit              text not null check (unit in ('porcentaje', 'numero', 'tasa')),
  frequency         text not null check (frequency in ('mensual', 'trimestral', 'semestral', 'anual')),
  direction         text not null check (direction in ('mayor_o_igual', 'menor_o_igual')),
  target            numeric(16, 4) not null,
  warning           numeric(16, 4),
  data_source       text,
  responsible_name  text,
  step_number       smallint check (step_number between 1 and 24),
  active            boolean not null default true,
  created_by        uuid references users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Un mismo cálculo automático no se repite en la organización.
create unique index indicators_calculo_idx on indicators (organization_id, calculation) where calculation is not null;

create table indicator_results (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete cascade,
  indicator_id      uuid not null references indicators (id) on delete cascade,
  period            text not null check (period ~ '^\d{4}(-(0[1-9]|1[0-2])|-T[1-4]|-S[12])?$'),
  value             numeric(16, 4),
  numerator         numeric(16, 4),
  denominator       numeric(16, 4),
  origin            text not null check (origin in ('automatico', 'manual')),
  analysis          text,
  action_id         uuid references actions (id) on delete set null,
  recorded_by       uuid references users (id),
  recorded_at       timestamptz not null default now(),
  unique (indicator_id, period)
);
create index indicator_results_org_idx on indicator_results (organization_id);

alter table goals add column indicator_id uuid references indicators (id) on delete set null;
alter table goals alter column indicator drop not null;

-- El plan de acción recibe acciones originadas en indicadores, riesgos, capacitaciones y pasos.
alter table actions drop constraint actions_source_check;
alter table actions add constraint actions_source_check
  check (source in ('comite', 'siniestro', 'auditoria', 'hallazgo', 'manual', 'indicador', 'riesgo', 'capacitacion', 'paso'));

alter table indicators enable row level security;
alter table indicators force row level security;
create policy tenant_isolation on indicators using (organization_id = app_current_org()) with check (organization_id = app_current_org());
create policy owner_access on indicators to current_user using (true) with check (true);
grant select, insert, update, delete on indicators to pesv_app;

alter table indicator_results enable row level security;
alter table indicator_results force row level security;
create policy tenant_isolation on indicator_results using (organization_id = app_current_org()) with check (organization_id = app_current_org());
create policy owner_access on indicator_results to current_user using (true) with check (true);
grant select, insert, update, delete on indicator_results to pesv_app;
