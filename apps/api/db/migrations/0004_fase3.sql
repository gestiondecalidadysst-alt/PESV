-- Fase 3: auditorías y hallazgos (pasos 22 y 23), adopción voluntaria, telemática, planes y
-- suscripciones configurables desde el panel de la plataforma.

-- ---------------------------------------------------------------------------
-- Adopción voluntaria (RN-01): una organización no obligada puede tener nivel básico.
-- ---------------------------------------------------------------------------

do $$
declare restriccion text;
begin
  select conname into restriccion
    from pg_constraint
   where conrelid = 'classifications'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%obligated = (level IS NOT NULL)%';
  if restriccion is not null then
    execute format('alter table classifications drop constraint %I', restriccion);
  end if;
end $$;

alter table classifications add column voluntary boolean not null default false;
alter table classifications add constraint classifications_nivel_check
  check ((obligated and level is not null and not voluntary)
      or (not obligated and voluntary and level = 'basico')
      or (not obligated and not voluntary and level is null));

-- ---------------------------------------------------------------------------
-- Auditorías (paso 22) y hallazgos con acciones correctivas (paso 23)
-- ---------------------------------------------------------------------------

create table audits (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations (id) on delete cascade,
  kind                   text not null check (kind in ('interna', 'externa', 'simulada')),
  scope                  text not null,
  auditor_name           text not null,
  auditor_independent    boolean not null default true,
  includes_iso           boolean not null default false,
  planned_on             date not null,
  executed_on            date,
  status                 text not null default 'planeada' check (status in ('planeada', 'en_curso', 'cerrada')),
  conclusions            text,
  closed_at              timestamptz,
  created_by             uuid references users (id),
  created_at             timestamptz not null default now()
);
create index audits_org_planned_idx on audits (organization_id, planned_on desc);

create table audit_findings (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete cascade,
  audit_id          uuid not null references audits (id) on delete cascade,
  kind              text not null check (kind in ('no_conformidad_mayor', 'no_conformidad_menor', 'observacion', 'oportunidad_mejora')),
  step_number       smallint check (step_number between 1 and 24),
  iso_clause        text,
  description       text not null,
  evidence          text,
  root_cause        text,
  ai_generated      boolean not null default false,
  status            text not null default 'abierto' check (status in ('abierto', 'cerrado')),
  verification      text,
  closed_at         timestamptz,
  closed_by         uuid references users (id),
  created_by        uuid references users (id),
  created_at        timestamptz not null default now()
);
create index audit_findings_audit_idx on audit_findings (audit_id);

-- ---------------------------------------------------------------------------
-- Telemática: los viajes pueden llegar desde la plataforma GPS por token de API.
-- ---------------------------------------------------------------------------

alter table trips drop constraint if exists trips_organization_id_external_id_key;
create unique index trips_org_source_external_idx on trips (organization_id, source, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- Planes (globales, los administra la plataforma) y suscripciones por organización
-- ---------------------------------------------------------------------------

create table plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  name             text not null,
  description      text,
  levels           text[] not null default '{}',
  max_vehicles     integer check (max_vehicles > 0),
  max_drivers      integer check (max_drivers > 0),
  max_users        integer check (max_users > 0),
  features         text[] not null default '{}',
  monthly_price    numeric(14, 2) check (monthly_price >= 0),
  currency         char(3) not null default 'COP',
  trial_days       integer not null default 0 check (trial_days >= 0),
  active           boolean not null default true,
  is_default       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index plans_un_solo_defecto on plans (is_default) where is_default;

create table subscriptions (
  organization_id   uuid primary key references organizations (id) on delete cascade,
  plan_id           uuid references plans (id) on delete set null,
  status            text not null default 'prueba' check (status in ('prueba', 'activa', 'mora', 'cancelada')),
  trial_ends_on     date,
  period_ends_on    date,
  notes             text,
  updated_by        uuid references users (id),
  updated_at        timestamptz not null default now()
);

-- Vista de la plataforma: todas las organizaciones con su suscripción y uso. Solo la usa el
-- panel de administración (la API la protege con @AdminPlataforma).
create function admin_organizations_overview()
  returns table (
    id uuid, name text, nit text, created_at timestamptz, level text, voluntary boolean,
    plan_id uuid, plan_name text, status text, period_ends_on date, trial_ends_on date,
    vehicles bigint, drivers bigint, users bigint
  )
  language sql stable security definer set search_path = public
  as $$
    select o.id, o.name, o.nit, o.created_at, c.level, coalesce(c.voluntary, false),
           s.plan_id, p.name, coalesce(s.status, 'prueba'), s.period_ends_on, s.trial_ends_on,
           (select count(*) from vehicles v where v.organization_id = o.id and v.status <> 'inactivo'),
           (select count(*) from drivers d where d.organization_id = o.id and d.active),
           (select count(distinct m.user_id) from memberships m where m.organization_id = o.id)
      from organizations o
      left join lateral (
        select level, voluntary from classifications c where c.organization_id = o.id order by c.created_at desc limit 1
      ) c on true
      left join subscriptions s on s.organization_id = o.id
      left join plans p on p.id = s.plan_id
     order by o.created_at desc
  $$;
revoke all on function admin_organizations_overview() from public;
grant execute on function admin_organizations_overview() to pesv_app;

-- Alta o baja de administradores de la plataforma (la API exige ser administrador).
create function admin_set_platform_admin(p_email text, p_active boolean) returns uuid
  language sql volatile security definer set search_path = public
  as $$ update users set is_platform_admin = p_active where email = lower(p_email) returning id $$;
revoke all on function admin_set_platform_admin(text, boolean) from public;
grant execute on function admin_set_platform_admin(text, boolean) to pesv_app;

create function admin_platform_admins() returns table (id uuid, email text, full_name text)
  language sql stable security definer set search_path = public
  as $$ select id, email, full_name from users where is_platform_admin order by full_name $$;
revoke all on function admin_platform_admins() from public;
grant execute on function admin_platform_admins() to pesv_app;

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['audits', 'audit_findings', 'subscriptions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (organization_id = app_current_org()) with check (organization_id = app_current_org())', t);
    execute format('create policy owner_access on %I to %I using (true) with check (true)', t, current_user);
    execute format('grant select, insert, update, delete on %I to pesv_app', t);
  end loop;
end $$;

-- Los planes son catálogo global: sin RLS, editables solo a través del panel de la plataforma.
grant select, insert, update on plans to pesv_app;
