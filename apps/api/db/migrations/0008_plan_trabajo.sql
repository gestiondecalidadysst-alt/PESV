-- Versión 2.3: plan anual de trabajo del PESV (paso 9) con cronograma mensual programado/ejecutado,
-- relación con los objetivos y metas (paso 7), ciclo PHVA, recursos, presupuesto y seguimiento.

alter table plan_activities
  add column goal_id          uuid references goals (id) on delete set null,
  add column phase            text not null default 'hacer' check (phase in ('planear', 'hacer', 'verificar', 'actuar')),
  add column description      text,
  add column resources        text,
  add column deliverable      text,
  add column executed_budget  numeric(16, 2) check (executed_budget >= 0),
  add column planned_months   smallint[] not null default '{}'
    check (planned_months <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::smallint[]),
  add column updated_at       timestamptz not null default now();

-- Las actividades existentes quedan programadas en los meses de su rango de fechas dentro del año.
update plan_activities a
   set planned_months = coalesce((
     select array_agg(m order by m)::smallint[]
       from generate_series(
              case when extract(year from a.planned_start) < a.year then 1 else extract(month from a.planned_start)::int end,
              case when extract(year from a.planned_end) > a.year then 12 else extract(month from a.planned_end)::int end
            ) as m
   ), array[extract(month from a.planned_end)::smallint]);

-- Seguimiento mensual: un registro por actividad y mes programado.
create table plan_followups (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  activity_id      uuid not null references plan_activities (id) on delete cascade,
  month            smallint not null check (month between 1 and 12),
  executed         boolean not null,
  executed_on      date,
  note             text,
  evidence_id      uuid references evidences (id) on delete set null,
  created_by       uuid references users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (activity_id, month),
  check (not executed or executed_on is not null)
);
create index plan_followups_org_idx on plan_followups (organization_id);

-- Las actividades ya ejecutadas quedan con todos sus meses ejecutados.
insert into plan_followups (organization_id, activity_id, month, executed, executed_on, note)
select a.organization_id, a.id, m, true, coalesce(a.executed_on, a.planned_end), 'Registrado antes del cronograma mensual'
  from plan_activities a, unnest(a.planned_months) as m
 where a.status = 'ejecutada';

alter table plan_followups enable row level security;
alter table plan_followups force row level security;
create policy tenant_isolation on plan_followups using (organization_id = app_current_org()) with check (organization_id = app_current_org());
create policy owner_access on plan_followups to current_user using (true) with check (true);
grant select, insert, update, delete on plan_followups to pesv_app;
