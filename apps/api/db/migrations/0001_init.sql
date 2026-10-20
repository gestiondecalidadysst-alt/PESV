-- PESV · esquema inicial
-- Catálogo normativo global + datos por organización aislados con Row Level Security (RLS).
-- La aplicación se conecta con el rol pesv_app (sin privilegios de dueño), así que las
-- políticas RLS siempre aplican. Cada petición fija la organización activa con:
--   select set_config('app.current_org', '<uuid>', true);

-- ---------------------------------------------------------------------------
-- Catálogo normativo (compartido, solo lectura para la aplicación)
-- ---------------------------------------------------------------------------

create table normative_versions (
  id          text primary key,
  kind        text not null check (kind in ('PESV', 'ISO39001')),
  name        text not null,
  issued_on   date,
  authority   text,
  created_at  timestamptz not null default now()
);

create table pesv_steps (
  version_id  text not null references normative_versions (id),
  number      smallint not null check (number between 1 and 24),
  phase       text not null check (phase in ('planear', 'hacer', 'verificar', 'actuar')),
  name        text not null,
  levels      text[] not null check (levels <@ array['basico', 'estandar', 'avanzado']),
  primary key (version_id, number)
);

create table level_rules (
  version_id    text not null references normative_versions (id),
  misionalidad  smallint not null check (misionalidad in (1, 2)),
  level         text not null check (level in ('basico', 'estandar', 'avanzado')),
  vehicles_min  integer not null,
  vehicles_max  integer,
  drivers_min   integer not null,
  drivers_max   integer,
  primary key (version_id, misionalidad, level)
);

create table modalities (
  id                          text primary key,
  name                        text not null,
  misionalidad                smallint not null check (misionalidad in (1, 2)),
  reports_to_supertransporte  boolean not null
);

create table iso_clauses (
  version_id   text not null references normative_versions (id),
  code         text not null,
  title        text not null,
  parent_code  text,
  primary key (version_id, code)
);

create table pesv_iso_map (
  pesv_version_id  text not null,
  step_number      smallint not null,
  iso_version_id   text not null,
  clause_code      text not null,
  primary key (pesv_version_id, step_number, iso_version_id, clause_code),
  foreign key (pesv_version_id, step_number) references pesv_steps (version_id, number),
  foreign key (iso_version_id, clause_code) references iso_clauses (version_id, code)
);

-- ---------------------------------------------------------------------------
-- Organizaciones y personas
-- ---------------------------------------------------------------------------

create table organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  nit            text not null unique check (nit ~ '^\d{6,10}$'),
  misionalidad   smallint not null check (misionalidad in (1, 2)),
  modality_id    text references modalities (id),
  action_radius  text check (action_radius in ('municipal', 'departamental', 'nacional', 'internacional')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique check (email = lower(email)),
  full_name   text not null,
  created_at  timestamptz not null default now()
);

create table memberships (
  organization_id  uuid not null references organizations (id) on delete cascade,
  user_id          uuid not null references users (id) on delete cascade,
  role             text not null check (role in ('admin', 'lider_pesv', 'comite', 'conductor', 'mantenimiento', 'auditor', 'consultor')),
  created_at       timestamptz not null default now(),
  primary key (organization_id, user_id, role)
);

-- ---------------------------------------------------------------------------
-- Clasificación y cumplimiento
-- ---------------------------------------------------------------------------

-- Historial: cada reclasificación es una fila nueva; la vigente es la más reciente.
create table classifications (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references organizations (id) on delete cascade,
  normative_version_id        text not null references normative_versions (id),
  misionalidad                smallint not null check (misionalidad in (1, 2)),
  modality_id                 text references modalities (id),
  vehicles                    integer not null check (vehicles >= 0),
  drivers                     integer not null check (drivers >= 0),
  obligated                   boolean not null,
  level                       text check (level in ('basico', 'estandar', 'avanzado')),
  level_by_vehicles           text check (level_by_vehicles in ('basico', 'estandar', 'avanzado')),
  level_by_drivers            text check (level_by_drivers in ('basico', 'estandar', 'avanzado')),
  reports_to_supertransporte  boolean not null,
  applicable_steps            smallint[] not null,
  created_by                  uuid references users (id),
  created_at                  timestamptz not null default now(),
  check (obligated = (level is not null))
);
create index classifications_org_created_idx on classifications (organization_id, created_at desc);

create table step_compliance (
  organization_id       uuid not null references organizations (id) on delete cascade,
  normative_version_id  text not null,
  step_number           smallint not null,
  status                text not null check (status in ('pendiente', 'en_curso', 'hecho', 'no_aplica')),
  updated_by            uuid references users (id),
  updated_at            timestamptz not null default now(),
  primary key (organization_id, normative_version_id, step_number),
  foreign key (normative_version_id, step_number) references pesv_steps (version_id, number)
);

-- Evidencias versionadas: no se borran, se reemplazan (RN-08). Lo generado por IA solo
-- cuenta cuando una persona lo aprueba (RN-10).
create table evidences (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  title            text not null,
  file_key         text,
  mime_type        text,
  size_bytes       bigint check (size_bytes >= 0),
  version          integer not null default 1 check (version >= 1),
  replaces_id      uuid references evidences (id),
  status           text not null default 'borrador' check (status in ('borrador', 'aprobada', 'rechazada')),
  ai_generated     boolean not null default false,
  uploaded_by      uuid references users (id),
  approved_by      uuid references users (id),
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (status <> 'aprobada' or (approved_by is not null and approved_at is not null))
);
create index evidences_org_idx on evidences (organization_id);

-- Una evidencia puede respaldar requisitos de PESV e ISO 39001 a la vez (RN-09).
create table evidence_links (
  evidence_id      uuid not null references evidences (id) on delete cascade,
  organization_id  uuid not null references organizations (id) on delete cascade,
  norm             text not null check (norm in ('PESV', 'ISO39001')),
  version_id       text not null references normative_versions (id),
  ref              text not null,
  primary key (evidence_id, norm, ref)
);

-- Registro de auditoría: la aplicación solo puede insertar y leer (RN-28).
create table audit_log (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references organizations (id) on delete cascade,
  actor_id         uuid references users (id),
  action           text not null,
  entity           text not null,
  entity_id        text,
  data             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index audit_log_org_created_idx on audit_log (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

create function app_current_org() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.current_org', true), '')::uuid $$;

alter table organizations enable row level security;
alter table organizations force row level security;
create policy tenant_isolation on organizations
  using (id = app_current_org()) with check (id = app_current_org());

alter table memberships enable row level security;
alter table memberships force row level security;
create policy tenant_isolation on memberships
  using (organization_id = app_current_org()) with check (organization_id = app_current_org());

alter table users enable row level security;
alter table users force row level security;
create policy members_of_current_org on users
  using (id in (select m.user_id from memberships m where m.organization_id = app_current_org()));
create policy insert_users on users for insert with check (true);

alter table classifications enable row level security;
alter table classifications force row level security;
create policy tenant_isolation on classifications
  using (organization_id = app_current_org()) with check (organization_id = app_current_org());

alter table step_compliance enable row level security;
alter table step_compliance force row level security;
create policy tenant_isolation on step_compliance
  using (organization_id = app_current_org()) with check (organization_id = app_current_org());

alter table evidences enable row level security;
alter table evidences force row level security;
create policy tenant_isolation on evidences
  using (organization_id = app_current_org()) with check (organization_id = app_current_org());

alter table evidence_links enable row level security;
alter table evidence_links force row level security;
create policy tenant_isolation on evidence_links
  using (organization_id = app_current_org()) with check (organization_id = app_current_org());

alter table audit_log enable row level security;
alter table audit_log force row level security;
create policy tenant_isolation on audit_log
  using (organization_id = app_current_org()) with check (organization_id = app_current_org());

-- ---------------------------------------------------------------------------
-- Permisos del rol de la aplicación
-- ---------------------------------------------------------------------------

grant usage on schema public to pesv_app;
grant select on normative_versions, pesv_steps, level_rules, modalities, iso_clauses, pesv_iso_map to pesv_app;
grant select, insert, update, delete on organizations, memberships, classifications, step_compliance, evidence_links to pesv_app;
grant select, insert, update on users, evidences to pesv_app;
grant select, insert on audit_log to pesv_app;
grant usage on all sequences in schema public to pesv_app;
grant execute on function app_current_org() to pesv_app;
