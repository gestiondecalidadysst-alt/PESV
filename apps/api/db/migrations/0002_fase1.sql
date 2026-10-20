-- Fase 1: autenticación, flota, conductores, preoperacionales, evidencias e IA del cliente.

-- ---------------------------------------------------------------------------
-- Usuarios y autenticación
-- ---------------------------------------------------------------------------

alter table users add column password_hash text;
alter table users add column is_platform_admin boolean not null default false;
alter table users add column last_login_at timestamptz;

-- Las funciones de autenticación corren con permisos del dueño (SECURITY DEFINER) para buscar
-- un usuario antes de conocer su organización. Exponen solo lo necesario.
create function auth_lookup_user(p_email text)
  returns table (id uuid, email text, full_name text, password_hash text, is_platform_admin boolean)
  language sql stable security definer set search_path = public
  as $$ select u.id, u.email, u.full_name, u.password_hash, u.is_platform_admin from users u where u.email = lower(p_email) $$;

create function auth_user_by_id(p_id uuid)
  returns table (id uuid, email text, full_name text, is_platform_admin boolean)
  language sql stable security definer set search_path = public
  as $$ select u.id, u.email, u.full_name, u.is_platform_admin from users u where u.id = p_id $$;

create function auth_user_memberships(p_user uuid)
  returns table (organization_id uuid, organization_name text, nit text, roles text[])
  language sql stable security definer set search_path = public
  as $$
    select o.id, o.name, o.nit, array_agg(m.role order by m.role)
    from memberships m join organizations o on o.id = m.organization_id
    where m.user_id = p_user
    group by o.id, o.name, o.nit
    order by o.name
  $$;

create function auth_find_user_id(p_email text) returns uuid
  language sql stable security definer set search_path = public
  as $$ select u.id from users u where u.email = lower(p_email) $$;

create function auth_touch_login(p_user uuid) returns void
  language sql volatile security definer set search_path = public
  as $$ update users set last_login_at = now() where id = p_user $$;

revoke all on function auth_lookup_user(text), auth_user_by_id(uuid), auth_user_memberships(uuid),
  auth_find_user_id(text), auth_touch_login(uuid) from public;
grant execute on function auth_lookup_user(text), auth_user_by_id(uuid), auth_user_memberships(uuid),
  auth_find_user_id(text), auth_touch_login(uuid) to pesv_app;

-- ---------------------------------------------------------------------------
-- Flota y conductores
-- ---------------------------------------------------------------------------

create table vehicles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  plate            text not null check (plate ~ '^[A-Z0-9-]{3,10}$'),
  vehicle_type     text not null,
  service_type     text not null default 'particular' check (service_type in ('particular', 'publico', 'oficial', 'diplomatico', 'otro')),
  ownership        text not null check (ownership in ('propio', 'contratista', 'tercero')),
  motorized        boolean not null default true,
  brand            text,
  model_year       smallint check (model_year between 1950 and 2100),
  capacity         text,
  soat_expires_on  date,
  rtm_expires_on   date,
  odometer_km      integer check (odometer_km >= 0),
  status           text not null default 'apto' check (status in ('apto', 'no_apto', 'inactivo')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, plate)
);

create table drivers (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references organizations (id) on delete cascade,
  user_id                  uuid references users (id),
  document_number          text not null check (document_number ~ '^\d{5,12}$'),
  full_name                text not null,
  phone                    text,
  email                    text,
  license_category         text,
  license_expires_on       date,
  medical_exam_expires_on  date,
  contract_type            text not null default 'directo' check (contract_type in ('directo', 'contratista', 'tercero', 'otro')),
  road_role                text not null default 'conductor' check (road_role in ('conductor', 'motociclista', 'ciclista', 'peaton', 'pasajero')),
  data_consent_at          timestamptz not null,
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, document_number)
);

-- ---------------------------------------------------------------------------
-- Preoperacionales (inspección diaria)
-- ---------------------------------------------------------------------------

create table inspections (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  vehicle_id       uuid not null references vehicles (id) on delete cascade,
  driver_id        uuid references drivers (id),
  inspected_by     uuid references users (id),
  template_id      text not null,
  odometer_km      integer check (odometer_km >= 0),
  result           text not null check (result in ('apto', 'falla_menor', 'falla_critica')),
  notes            text,
  client_id        text,
  performed_at     timestamptz not null,
  created_at       timestamptz not null default now(),
  unique (organization_id, client_id)
);
create index inspections_org_date_idx on inspections (organization_id, performed_at desc);

create table inspection_items (
  inspection_id    uuid not null references inspections (id) on delete cascade,
  organization_id  uuid not null references organizations (id) on delete cascade,
  item_code        text not null,
  ok               boolean not null,
  critical         boolean not null,
  note             text,
  primary key (inspection_id, item_code)
);

-- ---------------------------------------------------------------------------
-- Evidencias: datos del archivo y rechazo
-- ---------------------------------------------------------------------------

alter table evidences add column original_filename text;
alter table evidences add column checksum_sha256 text;
alter table evidences add column rejection_reason text;
alter table evidences add column description text;

-- ---------------------------------------------------------------------------
-- IA elegida por el cliente
-- ---------------------------------------------------------------------------

create table ai_settings (
  organization_id         uuid primary key references organizations (id) on delete cascade,
  provider                text not null check (provider in ('anthropic', 'openai', 'google', 'azure', 'local', 'compatible')),
  model                   text not null,
  economic_model          text,
  base_url                text,
  deployment              text,
  api_version             text,
  api_key_encrypted       text,
  api_key_last4           text,
  monthly_budget_usd      numeric(10, 2) check (monthly_budget_usd >= 0),
  price_input_per_mtok    numeric(10, 4) not null default 0 check (price_input_per_mtok >= 0),
  price_output_per_mtok   numeric(10, 4) not null default 0 check (price_output_per_mtok >= 0),
  alert_threshold_pct     smallint not null default 80 check (alert_threshold_pct between 1 and 100),
  enabled_agents          text[] not null default array['copiloto', 'redactor', 'diagnostico', 'lector'],
  verified_at             timestamptz,
  updated_by              uuid references users (id),
  updated_at              timestamptz not null default now()
);

create table ai_usage (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references organizations (id) on delete cascade,
  user_id          uuid references users (id),
  agent            text not null,
  model            text not null,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  cost_usd         numeric(12, 6) not null default 0,
  created_at       timestamptz not null default now()
);
create index ai_usage_org_created_idx on ai_usage (organization_id, created_at desc);

create table ai_messages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  user_id          uuid references users (id),
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  sources          jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);
create index ai_messages_org_user_idx on ai_messages (organization_id, user_id, created_at);

-- ---------------------------------------------------------------------------
-- Eventos e integraciones (n8n): bandeja de salida, destinos y entregas
-- ---------------------------------------------------------------------------

create table event_outbox (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  event_type       text not null,
  payload          jsonb not null,
  dedup_key        text,
  created_at       timestamptz not null default now(),
  unique (organization_id, dedup_key)
);
create index event_outbox_org_created_idx on event_outbox (organization_id, created_at desc);

create table webhook_endpoints (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete cascade,
  name              text not null,
  url               text not null check (url ~ '^https?://'),
  secret_encrypted  text not null,
  events            text[] not null,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create table webhook_deliveries (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references organizations (id) on delete cascade,
  endpoint_id      uuid not null references webhook_endpoints (id) on delete cascade,
  event_id         uuid not null references event_outbox (id) on delete cascade,
  status           text not null default 'pendiente' check (status in ('pendiente', 'entregado', 'reintentando', 'fallido')),
  attempts         smallint not null default 0,
  response_code    smallint,
  response_body    text,
  next_attempt_at  timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (endpoint_id, event_id)
);
create index webhook_deliveries_due_idx on webhook_deliveries (next_attempt_at) where status in ('pendiente', 'reintentando');

-- El despachador toma entregas vencidas de todas las organizaciones (salta RLS de forma
-- controlada) y las reserva un minuto para que dos procesos no las envíen a la vez.
create function webhook_claim_due(p_limit integer)
  returns table (delivery_id bigint, organization_id uuid)
  language sql volatile security definer set search_path = public
  as $$
    with due as (
      select d.id from webhook_deliveries d
      where d.status in ('pendiente', 'reintentando') and d.next_attempt_at <= now()
      order by d.next_attempt_at
      limit p_limit
      for update skip locked
    )
    update webhook_deliveries w set next_attempt_at = now() + interval '1 minute'
    from due where w.id = due.id
    returning w.id, w.organization_id
  $$;
revoke all on function webhook_claim_due(integer) from public;
grant execute on function webhook_claim_due(integer) to pesv_app;

-- Tokens de API para que n8n u otros sistemas consulten o creen registros (RN-31).
create table api_tokens (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  name             text not null,
  token_hash       text not null unique,
  token_prefix     text not null,
  scopes           text[] not null,
  created_by       uuid references users (id),
  last_used_at     timestamptz,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);

create function api_token_lookup(p_hash text)
  returns table (token_id uuid, organization_id uuid, scopes text[], created_by uuid)
  language sql volatile security definer set search_path = public
  as $$
    update api_tokens set last_used_at = now()
    where token_hash = p_hash and revoked_at is null
    returning id, organization_id, scopes, created_by
  $$;
revoke all on function api_token_lookup(text) from public;
grant execute on function api_token_lookup(text) to pesv_app;

-- Tareas programadas: lista de organizaciones para revisar vencimientos y plazos.
create function app_all_organization_ids() returns setof uuid
  language sql stable security definer set search_path = public
  as $$ select id from organizations $$;
revoke all on function app_all_organization_ids() from public;
grant execute on function app_all_organization_ids() to pesv_app;

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['vehicles', 'drivers', 'inspections', 'inspection_items', 'ai_settings', 'ai_usage', 'ai_messages',
                          'event_outbox', 'webhook_endpoints', 'webhook_deliveries', 'api_tokens'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (organization_id = app_current_org()) with check (organization_id = app_current_org())', t);
  end loop;
end $$;

grant select, insert, update, delete on vehicles, drivers, ai_settings, webhook_endpoints to pesv_app;
grant select, insert, update on api_tokens to pesv_app;
grant select, insert on event_outbox to pesv_app;
grant select, insert, update on webhook_deliveries to pesv_app;
grant select, insert, update on inspections to pesv_app;
grant select, insert on inspection_items, ai_usage, ai_messages to pesv_app;
grant usage on all sequences in schema public to pesv_app;

-- El rol dueño del esquema (el que ejecuta las migraciones y es dueño de las funciones
-- SECURITY DEFINER de arriba) necesita ver todas las filas: con FORCE ROW LEVEL SECURITY las
-- políticas aplican también al dueño. La aplicación sigue conectándose con pesv_app.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and rowsecurity loop
    execute format('drop policy if exists owner_access on %I', t.tablename);
    execute format('create policy owner_access on %I to %I using (true) with check (true)', t.tablename, current_user);
  end loop;
end $$;
