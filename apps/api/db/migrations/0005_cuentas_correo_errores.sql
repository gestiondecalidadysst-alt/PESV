-- Recuperación de contraseña, invitaciones por correo, notificaciones por correo y registro de
-- errores de la plataforma.

-- ---------------------------------------------------------------------------
-- Sesiones y contraseñas
-- ---------------------------------------------------------------------------

-- Las sesiones firmadas antes de esta fecha dejan de valer (cambio de contraseña o «cerrar
-- sesión en todos los dispositivos»).
alter table users add column sessions_valid_from timestamptz;

drop function auth_user_by_id(uuid);
create function auth_user_by_id(p_id uuid)
  returns table (id uuid, email text, full_name text, is_platform_admin boolean, sessions_valid_from timestamptz)
  language sql stable security definer set search_path = public
  as $$ select u.id, u.email, u.full_name, u.is_platform_admin, u.sessions_valid_from from users u where u.id = p_id $$;
revoke all on function auth_user_by_id(uuid) from public;
grant execute on function auth_user_by_id(uuid) to pesv_app;

-- Enlaces de un solo uso para recuperar la contraseña o crearla al aceptar una invitación. Solo
-- se guarda el hash del token. La tabla no tiene permisos para la aplicación: se usa por funciones.
create table password_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  token_hash   text not null unique,
  purpose      text not null check (purpose in ('recuperacion', 'invitacion')),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index password_tokens_user_idx on password_tokens (user_id, created_at desc);

-- Crea un enlace si el correo existe. Máximo 3 enlaces de recuperación cada 15 minutos por
-- cuenta; los enlaces anteriores sin usar quedan anulados. Sin filas = no se envía nada.
create function auth_create_password_token(p_email text, p_hash text, p_purpose text, p_minutes integer)
  returns table (user_id uuid, email text, full_name text)
  language plpgsql volatile security definer set search_path = public
  as $$
  #variable_conflict use_column
  declare v_user users%rowtype;
  begin
    select * into v_user from users where users.email = lower(p_email);
    if not found then return; end if;
    if p_purpose = 'recuperacion' and (
      select count(*) from password_tokens t
       where t.user_id = v_user.id and t.purpose = 'recuperacion' and t.created_at > now() - interval '15 minutes'
    ) >= 3 then
      return;
    end if;
    update password_tokens t set used_at = now()
     where t.user_id = v_user.id and t.purpose = p_purpose and t.used_at is null;
    insert into password_tokens (user_id, token_hash, purpose, expires_at)
    values (v_user.id, p_hash, p_purpose, now() + make_interval(mins => p_minutes));
    return query select v_user.id, v_user.email, v_user.full_name;
  end $$;

-- Dice si un enlace sigue vigente, sin consumirlo (para mostrar el formulario).
create function auth_check_password_token(p_hash text)
  returns table (email text, full_name text, purpose text)
  language sql stable security definer set search_path = public
  as $$
    select u.email, u.full_name, t.purpose
      from password_tokens t join users u on u.id = t.user_id
     where t.token_hash = p_hash and t.used_at is null and t.expires_at > now()
  $$;

-- Consume el enlace, cambia la contraseña e invalida las sesiones abiertas.
create function auth_consume_password_token(p_hash text, p_password_hash text)
  returns table (user_id uuid, email text, full_name text, purpose text)
  language plpgsql volatile security definer set search_path = public
  as $$
  #variable_conflict use_column
  declare v_token password_tokens%rowtype;
  begin
    update password_tokens t set used_at = now()
     where t.token_hash = p_hash and t.used_at is null and t.expires_at > now()
    returning * into v_token;
    if not found then return; end if;
    update password_tokens t set used_at = now() where t.user_id = v_token.user_id and t.used_at is null;
    update users u set password_hash = p_password_hash, sessions_valid_from = now() where u.id = v_token.user_id;
    return query select u.id, u.email, u.full_name, v_token.purpose from users u where u.id = v_token.user_id;
  end $$;

-- Cambio de contraseña con sesión iniciada (la API verifica antes la contraseña actual).
create function auth_set_password(p_user uuid, p_password_hash text) returns void
  language sql volatile security definer set search_path = public
  as $$ update users set password_hash = p_password_hash, sessions_valid_from = now() where id = p_user $$;

-- Cierra todas las sesiones de una cuenta.
create function auth_revoke_sessions(p_user uuid) returns void
  language sql volatile security definer set search_path = public
  as $$ update users set sessions_valid_from = now() where id = p_user $$;

revoke all on function auth_create_password_token(text, text, text, integer), auth_check_password_token(text),
  auth_consume_password_token(text, text), auth_set_password(uuid, text), auth_revoke_sessions(uuid) from public;
grant execute on function auth_create_password_token(text, text, text, integer), auth_check_password_token(text),
  auth_consume_password_token(text, text), auth_set_password(uuid, text), auth_revoke_sessions(uuid) to pesv_app;

-- ---------------------------------------------------------------------------
-- Correo: reglas de notificación por evento y cola de envío
-- ---------------------------------------------------------------------------

create table email_rules (
  organization_id  uuid not null references organizations (id) on delete cascade,
  event_type       text not null,
  roles            text[] not null default '{}',
  extra_emails     text[] not null default '{}',
  active           boolean not null default true,
  updated_at       timestamptz not null default now(),
  primary key (organization_id, event_type)
);

create table email_outbox (
  id               bigserial primary key,
  organization_id  uuid not null references organizations (id) on delete cascade,
  event_id         uuid references event_outbox (id) on delete set null,
  recipient        text not null,
  subject          text not null,
  html             text not null,
  body_text        text not null,
  status           text not null default 'pendiente' check (status in ('pendiente', 'reintentando', 'enviado', 'fallido')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index email_outbox_due_idx on email_outbox (next_attempt_at) where status in ('pendiente', 'reintentando');
create index email_outbox_org_idx on email_outbox (organization_id, created_at desc);

create function email_claim_due(p_limit integer)
  returns table (email_id bigint, organization_id uuid)
  language sql volatile security definer set search_path = public
  as $$
    with due as (
      select e.id from email_outbox e
       where e.status in ('pendiente', 'reintentando') and e.next_attempt_at <= now()
       order by e.next_attempt_at
       limit p_limit
       for update skip locked
    )
    update email_outbox o set next_attempt_at = now() + interval '2 minutes'
      from due where o.id = due.id
    returning o.id, o.organization_id
  $$;
revoke all on function email_claim_due(integer) from public;
grant execute on function email_claim_due(integer) to pesv_app;

-- Reglas por defecto para las organizaciones existentes (las nuevas las reciben al crearse).
insert into email_rules (organization_id, event_type, roles)
select o.id, r.event_type, r.roles
  from organizations o
 cross join (values
   ('documento.vencido', array['admin', 'lider_pesv']),
   ('documento.por_vencer', array['lider_pesv']),
   ('preoperacional.falla', array['lider_pesv', 'mantenimiento']),
   ('evidencia.por_revisar', array['lider_pesv']),
   ('siniestro.creado', array['admin', 'lider_pesv', 'comite']),
   ('mantenimiento.vencido', array['mantenimiento']),
   ('vigia.plazo', array['lider_pesv']),
   ('accion.por_vencer', array['lider_pesv']),
   ('comite.reunion', array['comite', 'lider_pesv']),
   ('auditoria.hallazgo', array['lider_pesv']),
   ('riesgo.critico', array['lider_pesv']),
   ('ia.presupuesto', array['admin'])
 ) as r (event_type, roles)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Registro de errores de la plataforma (API, web y tareas)
-- ---------------------------------------------------------------------------

-- Datos de la plataforma, no de una organización: sin RLS. Solo el panel de administración los lee.
create table error_groups (
  fingerprint      text primary key,
  source           text not null check (source in ('api', 'web', 'tarea')),
  message          text not null,
  status           text not null default 'abierto' check (status in ('abierto', 'resuelto', 'ignorado')),
  occurrences      integer not null default 0,
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  last_alert_at    timestamptz
);

create table error_events (
  id               bigserial primary key,
  fingerprint      text not null references error_groups (fingerprint) on delete cascade,
  source           text not null,
  message          text not null,
  stack            text,
  method           text,
  path             text,
  status           integer,
  request_id       text,
  user_id          uuid,
  organization_id  uuid,
  user_agent       text,
  context          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index error_events_group_idx on error_events (fingerprint, created_at desc);
create index error_events_created_idx on error_events (created_at);

grant select, insert, update, delete on error_groups, error_events to pesv_app;

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['email_rules', 'email_outbox'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (organization_id = app_current_org()) with check (organization_id = app_current_org())', t);
    execute format('create policy owner_access on %I to %I using (true) with check (true)', t, current_user);
    execute format('grant select, insert, update, delete on %I to pesv_app', t);
  end loop;
end $$;

grant usage on all sequences in schema public to pesv_app;
