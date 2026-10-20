const leer = (name: string, porDefectoEnDesarrollo?: string): string => {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production' || porDefectoEnDesarrollo === undefined) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return porDefectoEnDesarrollo;
};

const produccion = process.env.NODE_ENV === 'production';

export const config = {
  produccion,
  port: Number(process.env.PORT ?? 3000),
  /** Conexión con el rol pesv_app: sin privilegios de dueño, para que RLS siempre aplique. */
  databaseUrl: leer('DATABASE_URL', 'postgres://pesv_app:pesv_app_dev@localhost:5432/pesv'),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),
  /** Secreto para firmar las sesiones (mínimo 32 caracteres). */
  sessionSecret: leer('SESSION_SECRET', 'desarrollo-solamente-cambia-este-secreto-0123456789'),
  sessionHours: Number(process.env.SESSION_HOURS ?? 12),
  /** Clave de 32 bytes en base64 para cifrar credenciales de IA y secretos de integraciones. */
  encryptionKey: leer('ENCRYPTION_KEY', 'ZGVzYXJyb2xsby1zb2xhbWVudGUtMzItYnl0ZXMhISE='),
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
    localDir: process.env.STORAGE_DIR ?? './storage',
    s3Bucket: process.env.S3_BUCKET ?? '',
    s3Region: process.env.S3_REGION ?? 'us-east-1',
    s3Endpoint: process.env.S3_ENDPOINT || undefined,
  },
  /** Tamaño máximo por archivo; coincide con el límite de soportes de VIGIA 2 (RN-24). */
  maxUploadBytes: 15 * 1024 * 1024,
  /** URL pública de la web, para enlaces en notificaciones. */
  webUrl: (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  /**
   * Cookie de sesión solo por HTTPS. Activa en producción; COOKIE_SECURE=false solo para probar
   * un servidor sin dominio ni certificado.
   */
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : produccion,
  /** Saltos de proxy confiables para conocer la IP real (Caddy delante de la API = 1). */
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  /**
   * Correo saliente por SMTP (cualquier proveedor: Gmail, Zoho, Brevo, Amazon SES…). Sin
   * SMTP_HOST los correos se escriben en el registro de la API en vez de enviarse.
   */
  correo: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'PESV <no-responder@localhost>',
  },
  /** Formato de los registros: «json» en producción (una línea por evento), «texto» en desarrollo. */
  formatoLogs: (process.env.LOG_FORMAT ?? (produccion ? 'json' : 'texto')) as 'json' | 'texto',
};

if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres');
if (Buffer.from(config.encryptionKey, 'base64').length !== 32) {
  throw new Error('ENCRYPTION_KEY debe ser una clave de 32 bytes en base64 (openssl rand -base64 32)');
}
