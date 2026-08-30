import { env } from "cloudflare:workers";

type D1Result<T = unknown> = { results?: T[]; success?: boolean; meta?: unknown };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<D1Result>;
};
type D1Binding = { prepare: (sql: string) => D1Prepared; batch: (statements: D1Prepared[]) => Promise<D1Result[]> };
type R2Binding = { put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => Promise<unknown> };
let schemaReady = false;

export function getD1(): D1Binding {
  const binding = (env as unknown as { DB?: D1Binding }).DB;
  if (!binding) throw new Error("D1 binding DB is unavailable");
  return binding;
}

export function getUploads(): R2Binding {
  const binding = (env as unknown as { UPLOADS?: R2Binding }).UPLOADS;
  if (!binding) throw new Error("R2 binding UPLOADS is unavailable");
  return binding;
}

export async function ensureSchema() {
  if (schemaReady) return;
  const db = getD1();
  const statements = [
    `CREATE TABLE IF NOT EXISTS app_users (id TEXT PRIMARY KEY, platform_user_id TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, staff_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, name TEXT NOT NULL, grade INTEGER, gender TEXT, service_part INTEGER NOT NULL, is_student_leader INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, duty TEXT, can_sing INTEGER NOT NULL DEFAULT 0, can_lead_group INTEGER NOT NULL DEFAULT 0, preferred_service INTEGER, active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS terms (id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, eligible_statuses TEXT NOT NULL DEFAULT 'present', status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, meeting_date TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'regular', title TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(term_id, meeting_date))`,
    `CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, name TEXT NOT NULL, capacity INTEGER NOT NULL, required_staff INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'draft', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(term_id, name))`,
    `CREATE TABLE IF NOT EXISTS group_members (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, group_id TEXT NOT NULL, student_id TEXT NOT NULL, assigned_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(term_id, student_id))`,
    `CREATE TABLE IF NOT EXISTS group_staff (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, group_id TEXT NOT NULL, staff_id TEXT NOT NULL, assigned_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(term_id, staff_id))`,
    `CREATE TABLE IF NOT EXISTS group_constraints (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, type TEXT NOT NULL, student_a_id TEXT NOT NULL, student_b_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, student_id TEXT NOT NULL, status TEXT NOT NULL, note TEXT, updated_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(meeting_id, student_id))`,
    `CREATE TABLE IF NOT EXISTS import_batches (id TEXT PRIMARY KEY, kind TEXT NOT NULL, filename TEXT NOT NULL, object_key TEXT NOT NULL, row_count INTEGER NOT NULL, imported_by TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, meeting_id TEXT NOT NULL, sunday_date TEXT NOT NULL, service_part INTEGER NOT NULL, singer_slots INTEGER NOT NULL, choir_slots INTEGER NOT NULL, leader_type TEXT, leader_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(sunday_date, service_part))`,
    `CREATE TABLE IF NOT EXISTS staff_availability (id TEXT PRIMARY KEY, sunday_date TEXT NOT NULL, staff_id TEXT NOT NULL, present INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(sunday_date, staff_id))`,
    `CREATE TABLE IF NOT EXISTS stage_assignments (id TEXT PRIMARY KEY, service_id TEXT NOT NULL, person_type TEXT NOT NULL, person_id TEXT NOT NULL, role TEXT NOT NULL, side TEXT NOT NULL, position_order INTEGER NOT NULL, reason TEXT, is_manual INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE(service_id, person_type, person_id))`,
    `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, before_json TEXT, after_json TEXT, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_students_active_service ON students(active, service_part)`,
    `CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(active)`,
    `CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date)`,
    `CREATE INDEX IF NOT EXISTS idx_groups_term ON groups(term_id)`,
    `CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)`,
    `CREATE INDEX IF NOT EXISTS idx_group_staff_group ON group_staff(group_id)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_services_term ON services(term_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stage_assignments_history ON stage_assignments(person_type, person_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)`,
  ];
  await db.batch(statements.map((sql) => db.prepare(sql)));
  await db.prepare("PRAGMA optimize").run();
  schemaReady = true;
}

export async function all<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const result = await getD1().prepare(sql).bind(...values).all<T>();
  return result.results ?? [];
}
export async function first<T>(sql: string, values: unknown[] = []): Promise<T | null> {
  await ensureSchema(); return getD1().prepare(sql).bind(...values).first<T>();
}
export async function run(sql: string, values: unknown[] = []) {
  await ensureSchema(); return getD1().prepare(sql).bind(...values).run();
}
export function now() { return new Date().toISOString(); }
export function createId(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
export async function audit(actorUserId: string, action: string, entityType: string, entityId: string | null, before: unknown, after: unknown) {
  await run("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [createId("audit"), actorUserId, action, entityType, entityId, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), now()]);
}
