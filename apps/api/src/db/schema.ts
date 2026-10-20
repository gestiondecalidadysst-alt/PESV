import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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
