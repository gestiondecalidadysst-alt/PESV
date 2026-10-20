const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 3000),
  /** Conexión con el rol pesv_app: sin privilegios de dueño, para que RLS siempre aplique. */
  databaseUrl: required('DATABASE_URL', 'postgres://pesv_app:pesv_app_dev@localhost:5432/pesv'),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),
};
