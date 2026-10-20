// Aplica en orden los archivos de db/migrations que aún no se han aplicado.
// Usa DATABASE_ADMIN_URL (rol dueño del esquema). Crea el rol pesv_app si no existe.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error('Falta DATABASE_ADMIN_URL');
  process.exit(1);
}
const appPassword = process.env.APP_DB_PASSWORD ?? 'pesv_app_dev';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
try {
  await client.query(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'pesv_app') then
        create role pesv_app login password '${appPassword.replace(/'/g, "''")}';
      end if;
    end $$;`);
  await client.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`✔ ${file}`);
    } catch (err) {
      await client.query('rollback');
      throw new Error(`Falló ${file}: ${err.message}`, { cause: err });
    }
  }
  console.log('Migraciones al día.');
} finally {
  await client.end();
}
