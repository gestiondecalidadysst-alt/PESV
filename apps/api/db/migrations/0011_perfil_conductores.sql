-- Versión 2.6: encuesta de perfil sociodemográfico y de desplazamientos de los colaboradores
-- (diagnóstico, paso 5). Se responde dentro de la plataforma o por un enlace público.

create table survey_campaigns (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  title            text not null,
  questionnaire    text not null default 'perfil-v1',
  token            text not null unique,
  status           text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  anonymous        boolean not null default false,
  closes_on        date,
  created_by       uuid references users (id),
  created_at       timestamptz not null default now(),
  closed_at        timestamptz
);
create index survey_campaigns_org_idx on survey_campaigns (organization_id, created_at desc);

create table survey_responses (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  campaign_id      uuid not null references survey_campaigns (id) on delete cascade,
  driver_id        uuid references drivers (id) on delete set null,
  document_number  text,
  full_name        text,
  answers          jsonb not null,
  channel          text not null check (channel in ('enlace', 'interno')),
  consent_at       timestamptz not null,
  submitted_at     timestamptz not null default now(),
  submitted_by     uuid references users (id)
);
-- Una respuesta por persona en cada encuesta (cuando no es anónima).
create unique index survey_responses_persona_idx on survey_responses (campaign_id, document_number) where document_number is not null;
create index survey_responses_campaign_idx on survey_responses (campaign_id);

alter table survey_campaigns enable row level security;
alter table survey_campaigns force row level security;
create policy tenant_isolation on survey_campaigns using (organization_id = app_current_org()) with check (organization_id = app_current_org());
create policy owner_access on survey_campaigns to current_user using (true) with check (true);
grant select, insert, update, delete on survey_campaigns to pesv_app;

alter table survey_responses enable row level security;
alter table survey_responses force row level security;
create policy tenant_isolation on survey_responses using (organization_id = app_current_org()) with check (organization_id = app_current_org());
create policy owner_access on survey_responses to current_user using (true) with check (true);
grant select, insert, update, delete on survey_responses to pesv_app;

-- El enlace público solo revela la encuesta y la organización a la que pertenece.
create function survey_by_token(p_token text)
  returns table (campaign_id uuid, organization_id uuid, organization_name text, title text, questionnaire text,
                 status text, anonymous boolean, closes_on date)
  language sql stable security definer set search_path = public
  as $$
    select c.id, c.organization_id, o.name, c.title, c.questionnaire, c.status, c.anonymous, c.closes_on
      from survey_campaigns c join organizations o on o.id = c.organization_id
     where c.token = p_token
  $$;
revoke all on function survey_by_token(text) from public;
grant execute on function survey_by_token(text) to pesv_app;
