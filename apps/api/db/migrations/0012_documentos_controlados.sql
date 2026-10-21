-- Versión 2.7: documentos controlados del PESV (política, procedimientos, programas…) con lista
-- maestra (paso 19), versiones, revisión, aprobación con firma y divulgación (paso 3).

create table controlled_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  code             text not null,
  title            text not null,
  class            text not null check (class in ('politica', 'procedimiento', 'programa', 'plan', 'manual', 'instructivo', 'formato', 'acta', 'otro')),
  step_number      smallint check (step_number between 1 and 24),
  owner_name       text,
  retention        text,
  created_by       uuid references users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, code)
);

create table document_versions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations (id) on delete cascade,
  document_id        uuid not null references controlled_documents (id) on delete cascade,
  version            smallint not null check (version >= 1),
  content            text,
  file_key           text,
  file_name          text,
  file_mime          text,
  change_summary     text,
  status             text not null default 'borrador' check (status in ('borrador', 'en_revision', 'aprobado', 'obsoleto')),
  prepared_by        uuid references users (id),
  prepared_name      text,
  submitted_at       timestamptz,
  reviewed_by        uuid references users (id),
  reviewed_name      text,
  reviewed_at        timestamptz,
  approved_by        uuid references users (id),
  approved_name      text,
  approved_at        timestamptz,
  return_note        text,
  effective_on       date,
  disseminated_on    date,
  dissemination_note text,
  evidence_id        uuid references evidences (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (document_id, version),
  check (status not in ('aprobado', 'obsoleto') or (approved_at is not null and effective_on is not null))
);
-- Solo una versión en elaboración por documento.
create unique index document_versions_en_curso_idx on document_versions (document_id) where status in ('borrador', 'en_revision');
-- Solo una versión vigente por documento.
create unique index document_versions_vigente_idx on document_versions (document_id) where status = 'aprobado';

alter table controlled_documents enable row level security;
alter table controlled_documents force row level security;
create policy tenant_isolation on controlled_documents using (organization_id = app_current_org()) with check (organization_id = app_current_org());
create policy owner_access on controlled_documents to current_user using (true) with check (true);
grant select, insert, update, delete on controlled_documents to pesv_app;

alter table document_versions enable row level security;
alter table document_versions force row level security;
create policy tenant_isolation on document_versions using (organization_id = app_current_org()) with check (organization_id = app_current_org());
create policy owner_access on document_versions to current_user using (true) with check (true);
grant select, insert, update, delete on document_versions to pesv_app;
