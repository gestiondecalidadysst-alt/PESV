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
  voluntary: boolean('voluntary').notNull().default(false),
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

// ---------------------------------------------------------------------------
// Fase 2
// ---------------------------------------------------------------------------

export const maintenancePlans = pgTable('maintenance_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  vehicleId: uuid('vehicle_id').notNull(),
  name: text('name').notNull(),
  intervalKm: integer('interval_km'),
  intervalDays: integer('interval_days'),
  lastDoneOn: date('last_done_on'),
  lastDoneKm: integer('last_done_km'),
  active: boolean('active').notNull().default(true),
  createdAt: creado(),
});

export const workOrders = pgTable('work_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  vehicleId: uuid('vehicle_id').notNull(),
  kind: text('kind').notNull(),
  source: text('source').notNull(),
  planId: uuid('plan_id'),
  inspectionId: uuid('inspection_id'),
  itemCode: text('item_code'),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('normal'),
  status: text('status').notNull().default('abierta'),
  providerName: text('provider_name'),
  providerNit: text('provider_nit'),
  technicianName: text('technician_name'),
  technicianDocument: text('technician_document'),
  technicianRole: text('technician_role'),
  cost: numeric('cost', { mode: 'number' }),
  odometerKm: integer('odometer_km'),
  notes: text('notes'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by'),
});

export const actions = pgTable('actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  source: text('source').notNull(),
  sourceId: uuid('source_id'),
  kind: text('kind').notNull().default('compromiso'),
  description: text('description').notNull(),
  responsibleUserId: uuid('responsible_user_id'),
  responsibleName: text('responsible_name').notNull(),
  dueOn: date('due_on').notNull(),
  status: text('status').notNull().default('abierta'),
  closureNote: text('closure_note'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by'),
  createdBy: uuid('created_by'),
  createdAt: creado(),
});

export const crashes = pgTable('crashes', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  location: text('location').notNull(),
  municipality: text('municipality'),
  vehicleId: uuid('vehicle_id'),
  plate: text('plate').notNull(),
  driverId: uuid('driver_id'),
  driverName: text('driver_name').notNull(),
  driverDocument: text('driver_document').notNull(),
  fatalities: smallint('fatalities').notNull().default(0),
  seriousInjuries: smallint('serious_injuries').notNull().default(0),
  minorInjuries: smallint('minor_injuries').notNull().default(0),
  ipatNumber: text('ipat_number'),
  authority: text('authority'),
  description: text('description').notNull(),
  inMission: boolean('in_mission').notNull().default(true),
  directCost: numeric('direct_cost', { mode: 'number' }).notNull().default(0),
  indirectCost: numeric('indirect_cost', { mode: 'number' }).notNull().default(0),
  committeeReviewedOn: date('committee_reviewed_on'),
  status: text('status').notNull().default('abierto'),
  createdBy: uuid('created_by'),
  createdAt: creado(),
});

export const crashInvestigations = pgTable('crash_investigations', {
  crashId: uuid('crash_id').primaryKey(),
  organizationId: org(),
  required: boolean('required').notNull(),
  investigators: text('investigators'),
  facts: text('facts'),
  immediateCauses: text('immediate_causes'),
  rootCauses: text('root_causes'),
  lessonsLearned: text('lessons_learned'),
  status: text('status').notNull().default('pendiente'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  updatedAt: actualizado(),
});

export const committeeMembers = pgTable('committee_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  userId: uuid('user_id'),
  fullName: text('full_name').notNull(),
  position: text('position'),
  committeeRole: text('committee_role').notNull().default('integrante'),
  active: boolean('active').notNull().default(true),
  createdAt: creado(),
});

export interface PuntoAgenda {
  id: string;
  titulo: string;
  notas: string;
  origen?: string;
}

export const committeeMeetings = pgTable('committee_meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  location: text('location'),
  kind: text('kind').notNull().default('ordinaria'),
  status: text('status').notNull().default('programada'),
  agenda: jsonb('agenda').$type<PuntoAgenda[]>().notNull().default([]),
  quorumRequired: smallint('quorum_required').notNull(),
  transcript: text('transcript'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  minutesKey: text('minutes_key'),
  minutesChecksum: text('minutes_checksum'),
  evidenceId: uuid('evidence_id'),
  createdBy: uuid('created_by'),
  createdAt: creado(),
});

export const meetingAttendance = pgTable(
  'meeting_attendance',
  {
    meetingId: uuid('meeting_id').notNull(),
    memberId: uuid('member_id').notNull(),
    organizationId: org(),
    present: boolean('present').notNull().default(false),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signatureHash: text('signature_hash'),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.memberId] })],
);

export const meetingDecisions = pgTable('meeting_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').notNull(),
  organizationId: org(),
  agendaItemId: text('agenda_item_id'),
  text: text('text').notNull(),
  votesFor: smallint('votes_for').notNull().default(0),
  votesAgainst: smallint('votes_against').notNull().default(0),
  abstentions: smallint('abstentions').notNull().default(0),
  approved: boolean('approved').notNull(),
  createdAt: creado(),
});

export const roadRisks = pgTable('road_risks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  roadActor: text('road_actor').notNull(),
  hazard: text('hazard').notNull(),
  description: text('description').notNull(),
  probability: smallint('probability').notNull(),
  severity: smallint('severity').notNull(),
  controls: text('controls'),
  residualProbability: smallint('residual_probability'),
  residualSeverity: smallint('residual_severity'),
  ownerName: text('owner_name'),
  status: text('status').notNull().default('abierto'),
  identifiedOn: date('identified_on').notNull().$defaultFn(() => new Date().toISOString().slice(0, 10)),
  createdAt: creado(),
});

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  year: smallint('year').notNull(),
  objective: text('objective').notNull(),
  indicator: text('indicator').notNull(),
  target: numeric('target', { mode: 'number' }).notNull(),
  currentValue: numeric('current_value', { mode: 'number' }),
  direction: text('direction').notNull().default('menor_o_igual'),
  createdAt: creado(),
});

export const planActivities = pgTable('plan_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  year: smallint('year').notNull(),
  title: text('title').notNull(),
  stepNumber: smallint('step_number'),
  responsibleName: text('responsible_name').notNull(),
  responsibleUserId: uuid('responsible_user_id'),
  plannedStart: date('planned_start').notNull(),
  plannedEnd: date('planned_end').notNull(),
  status: text('status').notNull().default('planeada'),
  executedOn: date('executed_on'),
  budget: numeric('budget', { mode: 'number' }),
  createdAt: creado(),
});

export const trainings = pgTable('trainings', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  title: text('title').notNull(),
  topic: text('topic').notNull(),
  plannedOn: date('planned_on').notNull(),
  executedOn: date('executed_on'),
  hours: numeric('hours', { mode: 'number' }),
  instructor: text('instructor'),
  status: text('status').notNull().default('programada'),
  createdAt: creado(),
});

export const trainingAttendance = pgTable('training_attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  trainingId: uuid('training_id').notNull(),
  organizationId: org(),
  driverId: uuid('driver_id'),
  fullName: text('full_name').notNull(),
  documentNumber: text('document_number').notNull(),
  attended: boolean('attended').notNull().default(true),
});

export const routes = pgTable('routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  name: text('name').notNull(),
  origin: text('origin').notNull(),
  destination: text('destination').notNull(),
  distanceKm: numeric('distance_km', { mode: 'number' }).notNull(),
  tripsPerMonth: integer('trips_per_month').notNull().default(0),
  speedLimitKmh: smallint('speed_limit_kmh'),
  riskNotes: text('risk_notes'),
  active: boolean('active').notNull().default(true),
  createdAt: creado(),
});

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  routeId: uuid('route_id'),
  vehicleId: uuid('vehicle_id').notNull(),
  driverId: uuid('driver_id').notNull(),
  departureAt: timestamp('departure_at', { withTimezone: true }).notNull(),
  arrivalAt: timestamp('arrival_at', { withTimezone: true }),
  distanceKm: numeric('distance_km', { mode: 'number' }),
  maxSpeedKmh: smallint('max_speed_kmh'),
  speeding: boolean('speeding').notNull().default(false),
  overShift: boolean('over_shift').notNull().default(false),
  source: text('source').notNull().default('manual'),
  externalId: text('external_id'),
  status: text('status').notNull().default('programado'),
  createdBy: uuid('created_by'),
  createdAt: creado(),
});

export const vigiaReports = pgTable('vigia_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  form: text('form').notNull(),
  period: text('period').notNull(),
  status: text('status').notNull().default('generado'),
  fileKey: text('file_key'),
  fileName: text('file_name'),
  indicators: jsonb('indicators').notNull().default({}),
  generatedBy: uuid('generated_by'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  sentBy: uuid('sent_by'),
});

// Fase 3 ---------------------------------------------------------------------

export const audits = pgTable('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  kind: text('kind').notNull(),
  scope: text('scope').notNull(),
  auditorName: text('auditor_name').notNull(),
  auditorIndependent: boolean('auditor_independent').notNull().default(true),
  includesIso: boolean('includes_iso').notNull().default(false),
  plannedOn: date('planned_on').notNull(),
  executedOn: date('executed_on'),
  status: text('status').notNull().default('planeada'),
  conclusions: text('conclusions'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: creado(),
});

export const auditFindings = pgTable('audit_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: org(),
  auditId: uuid('audit_id').notNull(),
  kind: text('kind').notNull(),
  stepNumber: smallint('step_number'),
  isoClause: text('iso_clause'),
  description: text('description').notNull(),
  evidence: text('evidence'),
  rootCause: text('root_cause'),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  status: text('status').notNull().default('abierto'),
  verification: text('verification'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by'),
  createdBy: uuid('created_by'),
  createdAt: creado(),
});

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  levels: text('levels').array().notNull().default([]),
  maxVehicles: integer('max_vehicles'),
  maxDrivers: integer('max_drivers'),
  maxUsers: integer('max_users'),
  features: text('features').array().notNull().default([]),
  monthlyPrice: numeric('monthly_price', { mode: 'number' }),
  currency: text('currency').notNull().default('COP'),
  trialDays: integer('trial_days').notNull().default(0),
  active: boolean('active').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: creado(),
  updatedAt: actualizado(),
});

export const subscriptions = pgTable('subscriptions', {
  organizationId: uuid('organization_id').primaryKey(),
  planId: uuid('plan_id'),
  status: text('status').notNull().default('prueba'),
  trialEndsOn: date('trial_ends_on'),
  periodEndsOn: date('period_ends_on'),
  notes: text('notes'),
  updatedBy: uuid('updated_by'),
  updatedAt: actualizado(),
});
