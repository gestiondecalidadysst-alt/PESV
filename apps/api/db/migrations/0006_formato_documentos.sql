-- Versión 2 · Identidad documental: logo de la organización y formato del sistema de gestión
-- (encabezado y pie) para los PDF y Excel que genera la plataforma.

alter table organizations add column logo_key text;
alter table organizations add column logo_mime text check (logo_mime in ('image/png', 'image/jpeg'));
alter table organizations add column logo_updated_at timestamptz;

-- Valores generales del formato: prefijo de códigos, pie y responsables por defecto.
create table document_settings (
  organization_id  uuid primary key references organizations (id) on delete cascade,
  code_prefix      text not null default 'PESV' check (code_prefix ~ '^[A-Z0-9-]{1,12}$'),
  footer_note      text default 'Documento controlado. Toda copia impresa se considera no controlada.',
  primary_color    text not null default '#0F1B2D' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  prepared_name    text,
  prepared_role    text,
  reviewed_name    text,
  reviewed_role    text,
  approved_name    text,
  approved_role    text,
  updated_by       uuid references users (id),
  updated_at       timestamptz not null default now()
);

-- Código, versión y responsables de cada documento generado (matriz, planes, actas…).
create table document_formats (
  organization_id  uuid not null references organizations (id) on delete cascade,
  doc_type         text not null,
  code             text not null check (code ~ '^[A-Z0-9.-]{2,30}$'),
  version          integer not null default 1 check (version between 1 and 999),
  version_date     date not null default current_date,
  prepared_name    text,
  prepared_role    text,
  reviewed_name    text,
  reviewed_role    text,
  approved_name    text,
  approved_role    text,
  updated_by       uuid references users (id),
  updated_at       timestamptz not null default now(),
  primary key (organization_id, doc_type)
);

do $$
declare t text;
begin
  foreach t in array array['document_settings', 'document_formats'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (organization_id = app_current_org()) with check (organization_id = app_current_org())', t);
    execute format('create policy owner_access on %I to %I using (true) with check (true)', t, current_user);
    execute format('grant select, insert, update, delete on %I to pesv_app', t);
  end loop;
end $$;
