-- Versión 2.4: plan anual de formación del PESV (paso 10): programa por tema y público, modalidad,
-- facilitador, evaluación de la capacitación y de su eficacia, y relación con el plan de trabajo.

alter table trainings
  add column year               smallint,
  add column kind               text not null default 'formacion'
    check (kind in ('induccion', 'reinduccion', 'formacion', 'sensibilizacion', 'entrenamiento')),
  add column topic_id           text not null default 'otro',
  add column objective          text,
  add column audience           text[] not null default '{conductores}',
  add column modality           text not null default 'presencial' check (modality in ('presencial', 'virtual', 'mixta', 'practica')),
  add column location           text,
  add column provider_type      text not null default 'interno' check (provider_type in ('interno', 'externo', 'arl')),
  add column evaluation         text not null default 'evaluacion_escrita'
    check (evaluation in ('evaluacion_escrita', 'practica', 'observacion', 'sin_evaluacion')),
  add column passing_score      numeric(5, 2) not null default 70 check (passing_score between 0 and 100),
  add column effective          boolean,
  add column effectiveness_on   date,
  add column effectiveness_note text,
  add column risk_id            uuid references road_risks (id) on delete set null,
  add column plan_activity_id   uuid references plan_activities (id) on delete set null,
  add column updated_at         timestamptz not null default now();

update trainings set year = extract(year from planned_on)::smallint;
alter table trainings alter column year set not null;
alter table trainings add constraint trainings_year_check check (year between 2020 and 2100);
create index trainings_org_year_idx on trainings (organization_id, year);

alter table training_attendance
  add column job_role    text,
  add column score       numeric(5, 2) check (score between 0 and 100),
  add column created_at  timestamptz not null default now();
create index training_attendance_driver_idx on training_attendance (driver_id) where driver_id is not null;
