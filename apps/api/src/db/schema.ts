import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const creado = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const actualizado = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const org = () => uuid('organization_id').notNull();

// Espejo en TypeScript de db/migrations. Las migraciones SQL son la fuente de verdad del
// esquema (incluyen RLS y permisos); este archivo solo tipa las consultas.

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  nit: text('nit').notNull(),
  misionalidad: smallint('misionalidad').notNull(),
  modalityId: text('modality_id'),
  actionRadius: text('action_radius'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const classifications = pgTable('classifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  normativeVersionId: text('normative_version_id').notNull(),
  misionalidad: smallint('misionalidad').notNull(),
  modalityId: text('modality_id'),
  vehicles: integer('vehicles').notNull(),
  drivers: integer('drivers').notNull(),
  obligated: boolean('obligated').notNull(),
  level: text('level'),
  levelByVehicles: text('level_by_vehicles'),
  levelByDrivers: text('level_by_drivers'),
  reportsToSupertransporte: boolean('reports_to_supertransporte').notNull(),
  applicableSteps: smallint('applicable_steps').array().notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stepCompliance = pgTable(
  'step_compliance',
  {
    organizationId: uuid('organization_id').notNull(),
    normativeVersionId: text('normative_version_id').notNull(),
    stepNumber: smallint('step_number').notNull(),
    status: text('status').notNull(),
    updatedBy: uuid('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.normativeVersionId, t.stepNumber] })],
);

export const auditLog = pgTable('audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: uuid('organization_id').notNull(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  data: jsonb('data').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash'),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: creado(),
});

export const memberships = pgTable(
  'memberships',
  {
    organizationId: org(),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    createdAt: creado(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId, t.role] })],
);

export const evidences = pgTable('evidences', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  title: text('title').notNull(),
  description: text('description'),
  fileKey: text('file_key'),
  originalFilename: text('original_filename'),
  mimeType: text('mime_type'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  checksumSha256: text('checksum_sha256'),
  version: integer('version').notNull().default(1),
  replacesId: uuid('replaces_id'),
  status: text('status').notNull().default('borrador'),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  uploadedBy: uuid('uploaded_by'),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  createdAt: creado(),
});

export const evidenceLinks = pgTable(
  'evidence_links',
  {
    evidenceId: uuid('evidence_id').notNull(),
    organizationId: org(),
    norm: text('norm').notNull(),
    versionId: text('version_id').notNull(),
    ref: text('ref').notNull(),
  },
  (t) => [primaryKey({ columns: [t.evidenceId, t.norm, t.ref] })],
);

export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  plate: text('plate').notNull(),
  vehicleType: text('vehicle_type').notNull(),
  serviceType: text('service_type').notNull().default('particular'),
  ownership: text('ownership').notNull(),
  motorized: boolean('motorized').notNull().default(true),
  brand: text('brand'),
  modelYear: smallint('model_year'),
  capacity: text('capacity'),
  soatExpiresOn: date('soat_expires_on'),
  rtmExpiresOn: date('rtm_expires_on'),
  odometerKm: integer('odometer_km'),
  status: text('status').notNull().default('apto'),
  createdAt: creado(),
  updatedAt: actualizado(),
});

export const drivers = pgTable('drivers', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  userId: uuid('user_id'),
  documentNumber: text('document_number').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  email: text('email'),
  licenseCategory: text('license_category'),
  licenseExpiresOn: date('license_expires_on'),
  medicalExamExpiresOn: date('medical_exam_expires_on'),
  contractType: text('contract_type').notNull().default('directo'),
  roadRole: text('road_role').notNull().default('conductor'),
  dataConsentAt: timestamp('data_consent_at', { withTimezone: true }).notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: creado(),
  updatedAt: actualizado(),
});

export const inspections = pgTable('inspections', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  vehicleId: uuid('vehicle_id').notNull(),
  driverId: uuid('driver_id'),
  inspectedBy: uuid('inspected_by'),
  templateId: text('template_id').notNull(),
  odometerKm: integer('odometer_km'),
  result: text('result').notNull(),
  notes: text('notes'),
  clientId: text('client_id'),
  performedAt: timestamp('performed_at', { withTimezone: true }).notNull(),
  createdAt: creado(),
});

export const inspectionItems = pgTable(
  'inspection_items',
  {
    inspectionId: uuid('inspection_id').notNull(),
    organizationId: org(),
    itemCode: text('item_code').notNull(),
    ok: boolean('ok').notNull(),
    critical: boolean('critical').notNull(),
    note: text('note'),
  },
  (t) => [primaryKey({ columns: [t.inspectionId, t.itemCode] })],
);

export const aiSettings = pgTable('ai_settings', {
  organizationId: uuid('organization_id').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  economicModel: text('economic_model'),
  baseUrl: text('base_url'),
  deployment: text('deployment'),
  apiVersion: text('api_version'),
  apiKeyEncrypted: text('api_key_encrypted'),
  apiKeyLast4: text('api_key_last4'),
  monthlyBudgetUsd: numeric('monthly_budget_usd', { mode: 'number' }),
  priceInputPerMtok: numeric('price_input_per_mtok', { mode: 'number' }).notNull().default(0),
  priceOutputPerMtok: numeric('price_output_per_mtok', { mode: 'number' }).notNull().default(0),
  alertThresholdPct: smallint('alert_threshold_pct').notNull().default(80),
  enabledAgents: text('enabled_agents').array().notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  updatedBy: uuid('updated_by'),
  updatedAt: actualizado(),
});

export const aiUsage = pgTable('ai_usage', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: org(),
  userId: uuid('user_id'),
  agent: text('agent').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: numeric('cost_usd', { mode: 'number' }).notNull().default(0),
  createdAt: creado(),
});

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  userId: uuid('user_id'),
  role: text('role').notNull(),
  content: text('content').notNull(),
  sources: jsonb('sources').notNull().default([]),
  createdAt: creado(),
});

export const eventOutbox = pgTable('event_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  dedupKey: text('dedup_key'),
  createdAt: creado(),
});

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  secretEncrypted: text('secret_encrypted').notNull(),
  events: text('events').array().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: creado(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: org(),
  endpointId: uuid('endpoint_id').notNull(),
  eventId: uuid('event_id').notNull(),
  status: text('status').notNull().default('pendiente'),
  attempts: smallint('attempts').notNull().default(0),
  responseCode: smallint('response_code'),
  responseBody: text('response_body'),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: actualizado(),
});

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  tokenPrefix: text('token_prefix').notNull(),
  scopes: text('scopes').array().notNull(),
  createdBy: uuid('created_by'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: creado(),
});
