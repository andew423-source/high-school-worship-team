import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = { createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() };

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(), platformUserId: text("platform_user_id").notNull(), email: text("email").notNull(),
  displayName: text("display_name").notNull(), role: text("role").notNull(), status: text("status").notNull(), staffId: text("staff_id"), ...timestamps,
}, (table) => [uniqueIndex("idx_app_users_platform_user_id").on(table.platformUserId), uniqueIndex("idx_app_users_email").on(table.email)]);

export const students = sqliteTable("students", {
  id: text("id").primaryKey(), name: text("name").notNull(), grade: integer("grade"), gender: text("gender"),
  servicePart: integer("service_part").notNull(), worshipTeam: text("worship_team"),
  isStudentLeader: integer("is_student_leader", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true), notes: text("notes"), ...timestamps,
}, (table) => [index("idx_students_active_service").on(table.active, table.servicePart), index("idx_students_name").on(table.name)]);

export const termStudents = sqliteTable("term_students", {
  id: text("id").primaryKey(), termId: text("term_id").notNull(), studentId: text("student_id").notNull(),
  grade: integer("grade"), gender: text("gender"), servicePart: integer("service_part").notNull(), worshipTeam: text("worship_team"),
  isStudentLeader: integer("is_student_leader", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true), ...timestamps,
}, (table) => [
  uniqueIndex("idx_term_students_term_student").on(table.termId, table.studentId),
  index("idx_term_students_term_active_service").on(table.termId, table.active, table.servicePart),
]);

export const staff = sqliteTable("staff", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email"), duty: text("duty"),
  canSing: integer("can_sing", { mode: "boolean" }).notNull().default(false), canLeadGroup: integer("can_lead_group", { mode: "boolean" }).notNull().default(false),
  preferredService: integer("preferred_service"), active: integer("active", { mode: "boolean" }).notNull().default(true), notes: text("notes"), ...timestamps,
}, (table) => [index("idx_staff_active").on(table.active), index("idx_staff_email").on(table.email)]);

export const terms = sqliteTable("terms", {
  id: text("id").primaryKey(), name: text("name").notNull(), startDate: text("start_date").notNull(), endDate: text("end_date").notNull(),
  eligibleStatuses: text("eligible_statuses").notNull().default("present"), status: text("status").notNull().default("draft"), ...timestamps,
}, (table) => [index("idx_terms_status").on(table.status)]);

export const meetings = sqliteTable("meetings", {
  id: text("id").primaryKey(), termId: text("term_id").notNull(), meetingDate: text("meeting_date").notNull(), kind: text("kind").notNull().default("regular"),
  title: text("title"), ...timestamps,
}, (table) => [uniqueIndex("idx_meetings_term_date").on(table.termId, table.meetingDate), index("idx_meetings_date").on(table.meetingDate)]);

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(), termId: text("term_id").notNull(), name: text("name").notNull(), capacity: integer("capacity").notNull(),
  requiredStaff: integer("required_staff").notNull().default(1), status: text("status").notNull().default("draft"), sortOrder: integer("sort_order").notNull().default(0), ...timestamps,
}, (table) => [uniqueIndex("idx_groups_term_name").on(table.termId, table.name), index("idx_groups_term").on(table.termId)]);

export const groupMembers = sqliteTable("group_members", {
  id: text("id").primaryKey(), termId: text("term_id").notNull(), groupId: text("group_id").notNull(), studentId: text("student_id").notNull(),
  assignedBy: text("assigned_by").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_group_members_term_student").on(table.termId, table.studentId), index("idx_group_members_group").on(table.groupId)]);

export const groupStaff = sqliteTable("group_staff", {
  id: text("id").primaryKey(), termId: text("term_id").notNull(), groupId: text("group_id").notNull(), staffId: text("staff_id").notNull(),
  assignedBy: text("assigned_by").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_group_staff_term_staff").on(table.termId, table.staffId), index("idx_group_staff_group").on(table.groupId)]);

export const groupConstraints = sqliteTable("group_constraints", {
  id: text("id").primaryKey(), termId: text("term_id").notNull(), type: text("type").notNull(), studentAId: text("student_a_id").notNull(),
  studentBId: text("student_b_id").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_group_constraints_term").on(table.termId)]);

export const groupingSettings = sqliteTable("grouping_settings", {
  termId: text("term_id").primaryKey(), studentMin: integer("student_min").notNull().default(1), studentMax: integer("student_max").notNull().default(8),
  staffMin: integer("staff_min").notNull().default(1), staffMax: integer("staff_max").notNull().default(1),
  clusterGender: integer("cluster_gender", { mode: "boolean" }).notNull().default(false), clusterGrade: integer("cluster_grade", { mode: "boolean" }).notNull().default(false),
  splitWorshipRole: integer("split_worship_role", { mode: "boolean" }).notNull().default(false), ...timestamps,
});

export const groupRules = sqliteTable("group_rules", {
  id: text("id").primaryKey(), termId: text("term_id").notNull(), type: text("type").notNull(), configJson: text("config_json").notNull().default("{}"), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_group_rules_term").on(table.termId)]);

export const groupRuleMembers = sqliteTable("group_rule_members", {
  id: text("id").primaryKey(), ruleId: text("rule_id").notNull(), studentId: text("student_id").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_group_rule_members_rule_student").on(table.ruleId, table.studentId), index("idx_group_rule_members_rule").on(table.ruleId)]);

export const attendance = sqliteTable("attendance", {
  id: text("id").primaryKey(), meetingId: text("meeting_id").notNull(), studentId: text("student_id").notNull(), status: text("status").notNull(),
  note: text("note"), updatedBy: text("updated_by").notNull(), ...timestamps,
}, (table) => [uniqueIndex("idx_attendance_meeting_student").on(table.meetingId, table.studentId), index("idx_attendance_student").on(table.studentId)]);

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(), termId: text("term_id"), kind: text("kind").notNull(), filename: text("filename").notNull(), objectKey: text("object_key").notNull(),
  rowCount: integer("row_count").notNull(), importedBy: text("imported_by").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_import_batches_kind_created").on(table.kind, table.createdAt)]);

export const services = sqliteTable("services", {
  id: text("id").primaryKey(), termId: text("term_id").notNull(), meetingId: text("meeting_id").notNull(), sundayDate: text("sunday_date").notNull(),
  servicePart: integer("service_part").notNull(), singerSlots: integer("singer_slots").notNull(), choirSlots: integer("choir_slots").notNull(),
  leaderType: text("leader_type"), leaderId: text("leader_id"), status: text("status").notNull().default("draft"), ...timestamps,
}, (table) => [uniqueIndex("idx_services_date_part").on(table.sundayDate, table.servicePart), index("idx_services_term").on(table.termId)]);

export const staffAvailability = sqliteTable("staff_availability", {
  id: text("id").primaryKey(), sundayDate: text("sunday_date").notNull(), staffId: text("staff_id").notNull(), present: integer("present", { mode: "boolean" }).notNull().default(false),
  updatedBy: text("updated_by").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_staff_availability_date_staff").on(table.sundayDate, table.staffId)]);

export const stageAssignments = sqliteTable("stage_assignments", {
  id: text("id").primaryKey(), serviceId: text("service_id").notNull(), personType: text("person_type").notNull(), personId: text("person_id").notNull(),
  role: text("role").notNull(), side: text("side").notNull(), positionOrder: integer("position_order").notNull(), reason: text("reason"),
  isManual: integer("is_manual", { mode: "boolean" }).notNull().default(false), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_stage_assignments_service_person").on(table.serviceId, table.personType, table.personId), index("idx_stage_assignments_history").on(table.personType, table.personId)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), actorUserId: text("actor_user_id").notNull(), action: text("action").notNull(), entityType: text("entity_type").notNull(),
  entityId: text("entity_id"), beforeJson: text("before_json"), afterJson: text("after_json"), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_audit_logs_created").on(table.createdAt)]);
