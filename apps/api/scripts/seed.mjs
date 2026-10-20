// Siembra el catálogo normativo desde @pesv/shared (única fuente de verdad). Idempotente.
import pg from 'pg';
import {
  RES_40595_2022, PASOS_PESV, REGLAS_NIVEL, MODALIDADES,
  ISO_39001_VERSION, CLAUSULAS_ISO_39001, CORRESPONDENCIA_PESV_ISO,
} from '@pesv/shared';

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error('Falta DATABASE_ADMIN_URL');
  process.exit(1);
}
const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
try {
  await client.query('begin');
  const v = RES_40595_2022;
  await client.query(
    `insert into normative_versions (id, kind, name, issued_on, authority) values ($1,'PESV',$2,$3,$4)
     on conflict (id) do update set name = excluded.name, issued_on = excluded.issued_on, authority = excluded.authority`,
    [v.id, v.nombre, v.fechaExpedicion, v.autoridad],
  );
  await client.query(
    `insert into normative_versions (id, kind, name) values ($1,'ISO39001',$2)
     on conflict (id) do update set name = excluded.name`,
    [ISO_39001_VERSION.id, ISO_39001_VERSION.nombre],
  );
  for (const p of PASOS_PESV) {
    await client.query(
      `insert into pesv_steps (version_id, number, phase, name, levels) values ($1,$2,$3,$4,$5)
       on conflict (version_id, number) do update set phase = excluded.phase, name = excluded.name, levels = excluded.levels`,
      [v.id, p.numero, p.fase, p.nombre, [...p.niveles]],
    );
  }
  for (const r of REGLAS_NIVEL) {
    await client.query(
      `insert into level_rules (version_id, misionalidad, level, vehicles_min, vehicles_max, drivers_min, drivers_max)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (version_id, misionalidad, level) do update set vehicles_min = excluded.vehicles_min,
         vehicles_max = excluded.vehicles_max, drivers_min = excluded.drivers_min, drivers_max = excluded.drivers_max`,
      [v.id, r.misionalidad, r.nivel, r.vehiculos.min, r.vehiculos.max, r.conductores.min, r.conductores.max],
    );
  }
  for (const m of MODALIDADES) {
    await client.query(
      `insert into modalities (id, name, misionalidad, reports_to_supertransporte) values ($1,$2,$3,$4)
       on conflict (id) do update set name = excluded.name, misionalidad = excluded.misionalidad,
         reports_to_supertransporte = excluded.reports_to_supertransporte`,
      [m.id, m.nombre, m.misionalidad, m.reportaSupertransporte],
    );
  }
  for (const c of CLAUSULAS_ISO_39001) {
    await client.query(
      `insert into iso_clauses (version_id, code, title, parent_code) values ($1,$2,$3,$4)
       on conflict (version_id, code) do update set title = excluded.title, parent_code = excluded.parent_code`,
      [ISO_39001_VERSION.id, c.codigo, c.titulo, c.padre],
    );
  }
  await client.query('delete from pesv_iso_map where pesv_version_id = $1 and iso_version_id = $2', [v.id, ISO_39001_VERSION.id]);
  for (const [paso, clausulas] of Object.entries(CORRESPONDENCIA_PESV_ISO)) {
    for (const codigo of clausulas) {
      await client.query(
        'insert into pesv_iso_map (pesv_version_id, step_number, iso_version_id, clause_code) values ($1,$2,$3,$4)',
        [v.id, Number(paso), ISO_39001_VERSION.id, codigo],
      );
    }
  }
  await client.query('commit');
  console.log(`Catálogo sembrado: ${PASOS_PESV.length} pasos, ${REGLAS_NIVEL.length} reglas, ${MODALIDADES.length} modalidades, ${CLAUSULAS_ISO_39001.length} cláusulas ISO.`);
} catch (err) {
  await client.query('rollback');
  throw err;
} finally {
  await client.end();
}
