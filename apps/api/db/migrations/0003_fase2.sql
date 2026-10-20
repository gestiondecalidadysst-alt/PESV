-- Fase 2: mantenimiento, siniestros, acciones, comité, plan anual, formación, riesgos, metas,
-- desplazamientos y reportes a VIGIA 2.

-- ---------------------------------------------------------------------------
-- Mantenimiento (pasos 16 y 17)
-- ---------------------------------------------------------------------------

create table maintenance_plans (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  vehicle_id       uuid not null references vehicles (id) on delete cascade,
  name             text not null,
  interval_km      integer check (interval_km > 0),
  interval_days    integer check (interval_days > 0),
  last_done_on     date,
  last_done_km     integer check (last_done_km >= 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  check (interval_km is not null or interval_days is not null)
);

create table work_orders (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations (id) on delete cascade,
  vehicle_id           uuid not null references vehicles (id) on delete cascade,
  kind                 text not null check (kind in ('preventivo', 'correctivo')),
  source               text not null check (source in ('plan', 'inspeccion', 'manual')),
  plan_id              uuid references maintenance_plans (id) on delete set null,
  inspection_id        uuid references inspections (id) on delete set null,
  item_code            text,
  description          text not null,
  priority             text not null default 'normal' check (priority in ('critica', 'normal')),
  status               text not null default 'abierta' check (status in ('abierta', 'en_proceso', 'cerrada')),
  provider_name        text,
  provider_nit         text,
  technician_name      text,
  technician_document  text,
  technician_role      text,
  cost                 numeric(14, 2) check (cost >= 0),
  odometer_km          integer check (odometer_km >= 0),
  notes                text,
  opened_at            timestamptz not null default now(),
  closed_at            timestamptz,
  closed_by            uuid references users (id),
  check (status <> 'cerrada' or closed_at is not null)
);
create index work_orders_vehicle_idx on work_orders (organization_id, vehicle_id, status);

-- ---------------------------------------------------------------------------
-- Acciones: compromisos del comité, acciones de siniestros y de auditoría (paso 23)
-- ---------------------------------------------------------------------------

create table actions (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations (id) on delete cascade,
  source               text not null check (source in ('comite', 'siniestro', 'auditoria', 'hallazgo', 'manual')),
  source_id            uuid,
  kind                 text not null default 'compromiso' check (kind in ('correctiva', 'preventiva', 'mejora', 'compromiso')),
  description          text not null,
  responsible_user_id  uuid references users (id),
  responsible_name     text not null,
  due_on               date not null,
  status               text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  closure_note         text,
  closed_at            timestamptz,
  closed_by            uuid references users (id),
  created_by           uuid references users (id),
  created_at           timestamptz not null default now()
);
create index actions_org_status_idx on actions (organization_id, status, due_on);

-- ---------------------------------------------------------------------------
-- Siniestros e investigación (pasos 13 y 21)
-- ---------------------------------------------------------------------------

create table crashes (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations (id) on delete cascade,
  occurred_at            timestamptz not null,
  location               text not null,
  municipality           text,
  vehicle_id             uuid references vehicles (id) on delete set null,
  plate                  text not null,
  driver_id              uuid references drivers (id) on delete set null,
  driver_name            text not null,
  driver_document        text not null,
  fatalities             smallint not null default 0 check (fatalities >= 0),
  serious_injuries       smallint not null default 0 check (serious_injuries >= 0),
  minor_injuries         smallint not null default 0 check (minor_injuries >= 0),
  ipat_number            text,
  authority              text,
  description            text not null,
  in_mission             boolean not null default true,
  direct_cost            numeric(14, 2) not null default 0 check (direct_cost >= 0),
  indirect_cost          numeric(14, 2) not null default 0 check (indirect_cost >= 0),
  committee_reviewed_on  date,
  status                 text not null default 'abierto' check (status in ('abierto', 'en_investigacion', 'cerrado')),
  created_by             uuid references users (id),
  created_at             timestamptz not null default now()
);
create index crashes_org_date_idx on crashes (organization_id, occurred_at desc);

create table crash_investigations (
  crash_id          uuid primary key references crashes (id) on delete cascade,
  organization_id   uuid not null references organizations (id) on delete cascade,
  required          boolean not null,
  investigators     text,
  facts             text,
  immediate_causes  text,
  root_causes       text,
  lessons_learned   text,
  status            text not null default 'pendiente' check (status in ('pendiente', 'en_curso', 'cerrada')),
  closed_at         timestamptz,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Comité de seguridad vial (paso 2): integrantes, reuniones, asistencia y decisiones
-- ---------------------------------------------------------------------------

create table committee_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  user_id          uuid references users (id),
  full_name        text not null,
  position         text,
  committee_role   text not null default 'integrante' check (committee_role in ('presidente', 'secretario', 'lider_pesv', 'integrante')),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table committee_meetings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  scheduled_at     timestamptz not null,
  location         text,
  kind             text not null default 'ordinaria' check (kind in ('ordinaria', 'extraordinaria')),
  status           text not null default 'programada' check (status in ('programada', 'en_curso', 'cerrada', 'firmada')),
  agenda           jsonb not null default '[]'::jsonb,
  quorum_required  smallint not null check (quorum_required >= 1),
  transcript       text,
  started_at       timestamptz,
  closed_at        timestamptz,
  minutes_key      text,
  minutes_checksum text,
  evidence_id      uuid references evidences (id) on delete set null,
  created_by       uuid references users (id),
  created_at       timestamptz not null default now()
);

create table meeting_attendance (
  meeting_id       uuid not null references committee_meetings (id) on delete cascade,
  member_id        uuid not null references committee_members (id) on delete cascade,
  organization_id  uuid not null references organizations (id) on delete cascade,
  present          boolean not null default false,
  checked_in_at    timestamptz,
  signed_at        timestamptz,
  signature_hash   text,
  primary key (meeting_id, member_id)
);

create table meeting_decisions (
  id               uuid primary key default gen_random_uuid(),
  meeting_id       uuid not null references committee_meetings (id) on delete cascade,
  organization_id  uuid not null references organizations (id) on delete cascade,
  agenda_item_id   text,
  text             text not null,
  votes_for        smallint not null default 0 check (votes_for >= 0),
  votes_against    smallint not null default 0 check (votes_against >= 0),
  abstentions      smallint not null default 0 check (abstentions >= 0),
  approved         boolean not null,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Planificación: riesgos (6), metas (7), plan anual (9) y formación (10)
-- ---------------------------------------------------------------------------

create table road_risks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  road_actor       text not null check (road_actor in ('conductor', 'motociclista', 'ciclista', 'peaton', 'pasajero', 'todos')),
  hazard           text not null,
  description      text not null,
  probability      smallint not null check (probability between 1 and 5),
  severity         smallint not null check (severity between 1 and 5),
  controls         text,
  residual_probability smallint check (residual_probability between 1 and 5),
  residual_severity    smallint check (residual_severity between 1 and 5),
  owner_name       text,
  status           text not null default 'abierto' check (status in ('abierto', 'controlado', 'cerrado')),
  identified_on    date not null default current_date,
  created_at       timestamptz not null default now()
);

create table goals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  year             smallint not null check (year between 2020 and 2100),
  objective        text not null,
  indicator        text not null,
  target           numeric(14, 2) not null,
  current_value    numeric(14, 2),
  direction        text not null default 'menor_o_igual' check (direction in ('menor_o_igual', 'mayor_o_igual')),
  created_at       timestamptz not null default now()
);

create table plan_activities (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations (id) on delete cascade,
  year                 smallint not null check (year between 2020 and 2100),
  title                text not null,
  step_number          smallint check (step_number between 1 and 24),
  responsible_name     text not null,
  responsible_user_id  uuid references users (id),
  planned_start        date not null,
  planned_end          date not null,
  status               text not null default 'planeada' check (status in ('planeada', 'en_curso', 'ejecutada', 'cancelada')),
  executed_on          date,
  budget               numeric(14, 2) check (budget >= 0),
  created_at           timestamptz not null default now(),
  check (planned_end >= planned_start)
);

create table trainings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  title            text not null,
  topic            text not null,
  planned_on       date not null,
  executed_on      date,
  hours            numeric(5, 2) check (hours > 0),
  instructor       text,
  status           text not null default 'programada' check (status in ('programada', 'ejecutada', 'cancelada')),
  created_at       timestamptz not null default now()
);

create table training_attendance (
  id               uuid primary key default gen_random_uuid(),
  training_id      uuid not null references trainings (id) on delete cascade,
  organization_id  uuid not null references organizations (id) on delete cascade,
  driver_id        uuid references drivers (id) on delete set null,
  full_name        text not null,
  document_number  text not null,
  attended         boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Desplazamientos (pasos 14 y 15)
-- ---------------------------------------------------------------------------

create table routes (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations (id) on delete cascade,
  name                 text not null,
  origin               text not null,
  destination          text not null,
  distance_km          numeric(10, 2) not null check (distance_km > 0),
  trips_per_month      integer not null default 0 check (trips_per_month >= 0),
  speed_limit_kmh      smallint check (speed_limit_kmh between 5 and 150),
  risk_notes           text,
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

create table trips (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  route_id         uuid references routes (id) on delete set null,
  vehicle_id       uuid not null references vehicles (id) on delete cascade,
  driver_id        uuid not null references drivers (id) on delete cascade,
  departure_at     timestamptz not null,
  arrival_at       timestamptz,
  distance_km      numeric(10, 2) check (distance_km >= 0),
  max_speed_kmh    smallint check (max_speed_kmh >= 0),
  speeding         boolean not null default false,
  over_shift       boolean not null default false,
  source           text not null default 'manual' check (source in ('manual', 'telematica')),
  external_id      text,
  status           text not null default 'programado' check (status in ('programado', 'en_curso', 'terminado', 'cancelado')),
  created_by       uuid references users (id),
  created_at       timestamptz not null default now(),
  unique (organization_id, external_id)
);
create index trips_org_departure_idx on trips (organization_id, departure_at desc);

-- ---------------------------------------------------------------------------
-- Reportes a VIGIA 2 (Supertransporte)
-- ---------------------------------------------------------------------------

create table vigia_reports (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  form             text not null check (form in ('siniestros', 'administrativo', 'funcionamiento', 'vehiculos')),
  period           text not null,
  status           text not null default 'generado' check (status in ('generado', 'enviado')),
  file_key         text,
  file_name        text,
  indicators       jsonb not null default '{}'::jsonb,
  generated_by     uuid references users (id),
  generated_at     timestamptz not null default now(),
  sent_at          timestamptz,
  sent_by          uuid references users (id),
  unique (organization_id, form, period)
);

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['maintenance_plans', 'work_orders', 'actions', 'crashes', 'crash_investigations',
                          'committee_members', 'committee_meetings', 'meeting_attendance', 'meeting_decisions',
                          'road_risks', 'goals', 'plan_activities', 'trainings', 'training_attendance',
                          'routes', 'trips', 'vigia_reports'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (organization_id = app_current_org()) with check (organization_id = app_current_org())', t);
    execute format('create policy owner_access on %I to %I using (true) with check (true)', t, current_user);
    execute format('grant select, insert, update, delete on %I to pesv_app', t);
  end loop;
end $$;

grant usage on all sequences in schema public to pesv_app;
