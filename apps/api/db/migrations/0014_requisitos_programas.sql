-- Versión 3.1: requisitos de cada paso de la Res. 40595 con su verificación, y programas de
-- gestión de riesgos críticos del paso 8 (velocidad, fatiga, distracción, alcohol y sustancias,
-- actores viales vulnerables) con sus registros: equipos de medición de velocidad, pruebas de
-- alcohol y sustancias y revisión trimestral de resultados.

-- Verificación manual de un requisito por el líder, soportada en una evidencia aprobada del paso.
create table step_requirement_checks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  requirement_id   text not null,
  step_number      smallint not null check (step_number between 1 and 24),
  status           text not null check (status in ('cumple', 'no_cumple')),
  note             text not null check (length(note) >= 3),
  evidence_id      uuid references evidences (id),
  checked_by       uuid references users (id),
  checked_at       timestamptz not null default now(),
  unique (organization_id, requirement_id),
  check (status = 'no_cumple' or evidence_id is not null)
);

create table critical_programs (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations (id) on delete cascade,
  kind                 text not null check (kind in ('velocidad', 'fatiga', 'distraccion', 'alcohol_spa', 'vulnerables', 'otro')),
  name                 text not null,
  guidelines           text,
  scope                text,
  start_on             date,
  duration_months      smallint check (duration_months between 1 and 120),
  baseline             text,
  objectives           text,
  performance_factors  text,
  responsible_name     text,
  budget               numeric(14, 2) check (budget >= 0),
  follow_up            text,
  elements             text[] not null default '{}',
  indicator_ids        uuid[] not null default '{}',
  risk_ids             uuid[] not null default '{}',
  reviewed_on          date,
  disseminated_on      date,
  dissemination_note   text,
  active               boolean not null default true,
  created_by           uuid references users (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (disseminated_on is null or dissemination_note is not null)
);
-- Un solo programa de cada tipo obligatorio por organización; los "otros" pueden ser varios.
create unique index critical_programs_kind_uq on critical_programs (organization_id, kind) where kind <> 'otro';

create table program_reviews (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  period           text not null check (period ~ '^[0-9]{4}-T[1-4]$'),
  reviewed_on      date not null,
  instance         text not null check (instance in ('comite', 'lider_direccion')),
  meeting_id       uuid references committee_meetings (id) on delete set null,
  participants     text not null,
  conclusions      text not null check (length(conclusions) >= 10),
  created_by       uuid references users (id),
  created_at       timestamptz not null default now(),
  unique (organization_id, period)
);

create table speed_devices (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references organizations (id) on delete cascade,
  kind                     text not null check (kind in ('gps', 'tacografo', 'obc', 'limitador', 'radar', 'otro')),
  name                     text not null,
  serial                   text,
  vehicle_id               uuid references vehicles (id) on delete set null,
  calibrated_on            date,
  calibration_expires_on   date,
  notes                    text,
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (calibrated_on is null or calibration_expires_on is null or calibration_expires_on >= calibrated_on)
);
create index speed_devices_vehicle_idx on speed_devices (organization_id, vehicle_id);

-- Datos sensibles de salud (Ley 1581 de 2012): solo los consultan quienes tienen el permiso
-- «datos_sensibles»; la API lo exige. El consentimiento del colaborador es obligatorio.
create table substance_tests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  driver_id        uuid not null references drivers (id) on delete cascade,
  kind             text not null check (kind in ('alcohol_aleatoria', 'sustancias_aleatoria', 'alcohol_sangre_anual', 'sustancias_orina_anual')),
  method           text,
  performed_on     date not null,
  result           text not null check (result in ('negativo', 'positivo', 'no_realizada')),
  consent          boolean not null check (consent),
  action_id        uuid references actions (id) on delete set null,
  notes            text,
  recorded_by      uuid references users (id),
  created_at       timestamptz not null default now()
);
create index substance_tests_driver_idx on substance_tests (organization_id, driver_id, performed_on desc);

-- Las acciones y actividades del plan pueden venir de un programa del paso 8.
alter table actions drop constraint actions_source_check;
alter table actions add constraint actions_source_check
  check (source in ('comite', 'siniestro', 'auditoria', 'hallazgo', 'manual', 'indicador', 'riesgo', 'capacitacion', 'paso', 'programa'));
alter table plan_activities drop constraint plan_activities_source_check;
alter table plan_activities add constraint plan_activities_source_check
  check (source in ('manual', 'riesgo', 'hallazgo', 'indicador', 'paso', 'capacitacion', 'programa'));

do $$
declare t text;
begin
  foreach t in array array['step_requirement_checks', 'critical_programs', 'program_reviews', 'speed_devices', 'substance_tests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (organization_id = app_current_org()) with check (organization_id = app_current_org())', t);
    execute format('create policy owner_access on %I to current_user using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to pesv_app', t);
  end loop;
end $$;
