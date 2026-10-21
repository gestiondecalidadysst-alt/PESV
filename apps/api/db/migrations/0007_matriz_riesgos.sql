-- Versión 2 · Matriz de riesgos viales (paso 6) con metodología configurable: GTC 45 adaptada o
-- matriz 5×5. Medidas de intervención por jerarquía de controles, enlazadas al plan de trabajo.

alter table organizations add column risk_methodology text not null default 'gtc45'
  check (risk_methodology in ('gtc45', 'matriz5x5'));
-- Las organizaciones que ya tenían riesgos (evaluados en 5×5) siguen con esa metodología.
update organizations o set risk_methodology = 'matriz5x5'
 where exists (select 1 from road_risks r where r.organization_id = o.id);

alter table road_risks alter column description drop not null;
alter table road_risks alter column probability drop not null;
alter table road_risks alter column severity drop not null;
alter table road_risks
  add column methodology text not null default 'matriz5x5' check (methodology in ('gtc45', 'matriz5x5')),
  add column process text,
  add column activity text,
  add column job_role text,
  add column routine boolean not null default true,
  add column trip_type text not null default 'en_mision' check (trip_type in ('en_mision', 'in_itinere', 'ambos')),
  add column risk_factor text check (risk_factor in ('humano', 'vehiculo', 'via', 'entorno', 'organizacion')),
  add column effects text,
  add column exposed_count integer check (exposed_count >= 0),
  add column control_source text,
  add column control_medium text,
  add column control_individual text,
  add column deficiency smallint check (deficiency in (0, 2, 6, 10)),
  add column exposure smallint check (exposure between 1 and 4),
  add column consequence smallint check (consequence in (10, 25, 60, 100)),
  add column residual_deficiency smallint check (residual_deficiency in (0, 2, 6, 10)),
  add column residual_exposure smallint check (residual_exposure between 1 and 4),
  add column residual_consequence smallint check (residual_consequence in (10, 25, 60, 100)),
  add column worst_consequence text,
  add column legal_requirement boolean not null default false,
  add column legal_reference text,
  add column updated_at timestamptz not null default now();

-- Los riesgos ya registrados conservan sus controles y quedan en un proceso general.
update road_risks set control_medium = controls where controls is not null;
update road_risks set process = 'General' where process is null;

-- Una evaluación completa según la metodología del riesgo.
alter table road_risks add constraint road_risks_evaluacion_completa check (
  (methodology = 'gtc45' and deficiency is not null and exposure is not null and consequence is not null)
  or (methodology = 'matriz5x5' and probability is not null and severity is not null)
);

-- El plan de trabajo sabe de dónde viene cada actividad (una medida de la matriz, un hallazgo…).
alter table plan_activities
  add column source text not null default 'manual' check (source in ('manual', 'riesgo', 'hallazgo', 'indicador', 'paso', 'capacitacion')),
  add column source_id uuid;

create table risk_measures (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete cascade,
  risk_id           uuid not null references road_risks (id) on delete cascade,
  hierarchy         text not null check (hierarchy in ('eliminacion', 'sustitucion', 'ingenieria', 'administrativos', 'epp')),
  description       text not null,
  responsible_name  text,
  due_on            date,
  status            text not null default 'pendiente' check (status in ('pendiente', 'en_curso', 'implementada')),
  plan_activity_id  uuid references plan_activities (id) on delete set null,
  created_by        uuid references users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index risk_measures_risk_idx on risk_measures (risk_id);

alter table risk_measures enable row level security;
alter table risk_measures force row level security;
create policy tenant_isolation on risk_measures using (organization_id = app_current_org()) with check (organization_id = app_current_org());
create policy owner_access on risk_measures to current_user using (true) with check (true);
grant select, insert, update, delete on risk_measures to pesv_app;
