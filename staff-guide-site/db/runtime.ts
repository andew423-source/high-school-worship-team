import { env } from "cloudflare:workers";

type D1Result<T = unknown> = { results?: T[]; success?: boolean; meta?: unknown };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<D1Result>;
};
type D1Binding = { prepare: (sql: string) => D1Prepared; batch: (statements: D1Prepared[]) => Promise<D1Result[]> };
type R2Binding = { put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => Promise<unknown>; get: (key: string) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null> };
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
    `CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, name TEXT NOT NULL, grade INTEGER, gender TEXT, service_part INTEGER NOT NULL, worship_team TEXT, is_student_leader INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS term_students (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, student_id TEXT NOT NULL, grade INTEGER, gender TEXT, service_part INTEGER NOT NULL, worship_team TEXT, is_student_leader INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(term_id, student_id))`,
    `CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT, email TEXT, duty TEXT, can_sing INTEGER NOT NULL DEFAULT 0, can_lead_group INTEGER NOT NULL DEFAULT 0, preferred_service INTEGER, active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS terms (id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, eligible_statuses TEXT NOT NULL DEFAULT 'present', status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, meeting_date TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'regular', title TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(term_id, meeting_date))`,
    `CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, name TEXT NOT NULL, capacity INTEGER NOT NULL, required_staff INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'draft', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(term_id, name))`,
    `CREATE TABLE IF NOT EXISTS group_members (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, group_id TEXT NOT NULL, student_id TEXT NOT NULL, assigned_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(term_id, student_id))`,
    `CREATE TABLE IF NOT EXISTS group_staff (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, group_id TEXT NOT NULL, staff_id TEXT NOT NULL, assigned_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(term_id, staff_id))`,
    `CREATE TABLE IF NOT EXISTS group_constraints (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, type TEXT NOT NULL, student_a_id TEXT NOT NULL, student_b_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS grouping_settings (term_id TEXT PRIMARY KEY, student_min INTEGER NOT NULL DEFAULT 1, student_max INTEGER NOT NULL DEFAULT 8, staff_min INTEGER NOT NULL DEFAULT 1, staff_max INTEGER NOT NULL DEFAULT 1, cluster_gender INTEGER NOT NULL DEFAULT 0, cluster_grade INTEGER NOT NULL DEFAULT 0, split_worship_role INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS group_rules (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, type TEXT NOT NULL, config_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS group_rule_members (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, student_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(rule_id, student_id))`,
    `CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, student_id TEXT NOT NULL, status TEXT NOT NULL, note TEXT, updated_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(meeting_id, student_id))`,
    `CREATE TABLE IF NOT EXISTS import_batches (id TEXT PRIMARY KEY, term_id TEXT, kind TEXT NOT NULL, filename TEXT NOT NULL, object_key TEXT NOT NULL, row_count INTEGER NOT NULL, imported_by TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, term_id TEXT NOT NULL, meeting_id TEXT NOT NULL, sunday_date TEXT NOT NULL, service_part INTEGER NOT NULL, singer_slots INTEGER NOT NULL, choir_slots INTEGER NOT NULL, leader_type TEXT, leader_id TEXT, special_notes TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(sunday_date, service_part))`,
    `CREATE TABLE IF NOT EXISTS staff_availability (id TEXT PRIMARY KEY, sunday_date TEXT NOT NULL, staff_id TEXT NOT NULL, present INTEGER NOT NULL DEFAULT 0, stage_role TEXT NOT NULL DEFAULT 'session', updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(sunday_date, staff_id))`,
    `CREATE TABLE IF NOT EXISTS stage_assignments (id TEXT PRIMARY KEY, service_id TEXT NOT NULL, person_type TEXT NOT NULL, person_id TEXT NOT NULL, role TEXT NOT NULL, side TEXT NOT NULL, position_order INTEGER NOT NULL, reason TEXT, is_manual INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE(service_id, person_type, person_id))`,
    `CREATE TABLE IF NOT EXISTS stage_overrides (id TEXT PRIMARY KEY, service_id TEXT NOT NULL, student_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'force', role TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(service_id, student_id))`,
    `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, before_json TEXT, after_json TEXT, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_students_active_service ON students(active, service_part)`,
    `CREATE INDEX IF NOT EXISTS idx_term_students_term_active_service ON term_students(term_id, active, service_part)`,
    `CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(active)`,
    `CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date)`,
    `CREATE INDEX IF NOT EXISTS idx_groups_term ON groups(term_id)`,
    `CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)`,
    `CREATE INDEX IF NOT EXISTS idx_group_staff_group ON group_staff(group_id)`,
    `CREATE INDEX IF NOT EXISTS idx_group_rules_term ON group_rules(term_id)`,
    `CREATE INDEX IF NOT EXISTS idx_group_rule_members_rule ON group_rule_members(rule_id)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_services_term ON services(term_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stage_assignments_history ON stage_assignments(person_type, person_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stage_overrides_service ON stage_overrides(service_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)`,
  ];
  await db.batch(statements.map((sql) => db.prepare(sql)));
  const studentColumns = await db.prepare("PRAGMA table_info(students)").all<{ name: string }>();
  if (!(studentColumns.results ?? []).some((column) => column.name === "worship_team")) {
    await db.prepare("ALTER TABLE students ADD COLUMN worship_team TEXT").run();
  }
  const importColumns = await db.prepare("PRAGMA table_info(import_batches)").all<{ name: string }>();
  if (!(importColumns.results ?? []).some((column) => column.name === "term_id")) {
    await db.prepare("ALTER TABLE import_batches ADD COLUMN term_id TEXT").run();
  }
  const staffColumns = await db.prepare("PRAGMA table_info(staff)").all<{ name: string }>();
  if (!(staffColumns.results ?? []).some((column) => column.name === "gender")) {
    await db.prepare("ALTER TABLE staff ADD COLUMN gender TEXT").run();
  }
  const availabilityColumns = await db.prepare("PRAGMA table_info(staff_availability)").all<{ name: string }>();
  if (!(availabilityColumns.results ?? []).some((column) => column.name === "stage_role")) {
    await db.prepare("ALTER TABLE staff_availability ADD COLUMN stage_role TEXT NOT NULL DEFAULT 'session'").run();
  }
  const serviceColumns = await db.prepare("PRAGMA table_info(services)").all<{ name: string }>();
  if (!(serviceColumns.results ?? []).some((column) => column.name === "special_notes")) {
    await db.prepare("ALTER TABLE services ADD COLUMN special_notes TEXT").run();
  }
  const overrideColumns = await db.prepare("PRAGMA table_info(stage_overrides)").all<{ name: string }>();
  if (!(overrideColumns.results ?? []).some((column) => column.name === "kind")) {
    await db.prepare("ALTER TABLE stage_overrides ADD COLUMN kind TEXT NOT NULL DEFAULT 'force'").run();
  }
  await db.prepare(`INSERT OR IGNORE INTO term_students (id,term_id,student_id,grade,gender,service_part,worship_team,is_student_leader,active,created_at,updated_at)
    SELECT 'termstudent_' || lower(hex(randomblob(16))),t.id,s.id,s.grade,s.gender,s.service_part,s.worship_team,s.is_student_leader,s.active,s.created_at,s.updated_at
    FROM students s JOIN terms t ON t.status='active'
    WHERE NOT EXISTS (SELECT 1 FROM term_students ts WHERE ts.term_id=t.id AND ts.student_id=s.id)`).run();
  await db.prepare("UPDATE import_batches SET term_id=(SELECT id FROM terms WHERE status='active' ORDER BY start_date DESC LIMIT 1) WHERE kind='students' AND term_id IS NULL").run();
  await db.prepare("INSERT OR IGNORE INTO group_rules (id,term_id,type,config_json,created_at) SELECT 'legacy_' || id,term_id,type,'{}',created_at FROM group_constraints").run();
  await db.prepare("INSERT OR IGNORE INTO group_rule_members (id,rule_id,student_id,created_at) SELECT 'legacy_a_' || id,'legacy_' || id,student_a_id,created_at FROM group_constraints").run();
  await db.prepare("INSERT OR IGNORE INTO group_rule_members (id,rule_id,student_id,created_at) SELECT 'legacy_b_' || id,'legacy_' || id,student_b_id,created_at FROM group_constraints").run();
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
