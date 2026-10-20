// Da acceso de administrador de la plataforma a una cuenta existente (o lo quita con --quitar).
// Uso: DATABASE_ADMIN_URL=... pnpm --filter @pesv/api admin:plataforma correo@empresa.co [--quitar]
import pg from 'pg';

const adminUrl = process.env.DATABASE_ADMIN_URL;
const email = process.argv[2]?.trim().toLowerCase();
const activo = !process.argv.includes('--quitar');
if (!adminUrl || !email) {
  console.error('Uso: DATABASE_ADMIN_URL=... pnpm --filter @pesv/api admin:plataforma correo@empresa.co [--quitar]');
  process.exit(1);
}
const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
try {
  const { rowCount } = await client.query('update users set is_platform_admin = $2 where email = $1', [email, activo]);
  if (!rowCount) {
    console.error(`No hay una cuenta con el correo ${email}. Regístrala primero en la aplicación.`);
    process.exitCode = 1;
  } else {
    console.log(activo ? `${email} ahora administra la plataforma.` : `${email} ya no administra la plataforma.`);
  }
} finally {
  await client.end();
}
