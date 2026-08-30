export type UserRole = "admin" | "group_staff" | "staff";
export type AttendanceStatus = "present" | "late" | "left_early" | "absent" | "excused" | "unset";
export type StageRole = "leader" | "singer" | "choir";
export type StudentRecord = { id: string; name: string; grade: number | null; gender: string | null; service_part: number; is_student_leader: number; active: number; notes?: string | null };
export type StaffRecord = { id: string; name: string; email?: string | null; duty?: string | null; can_sing: number; can_lead_group: number; preferred_service?: number | null; active: number; notes?: string | null };
export type GroupRecord = { id: string; term_id: string; name: string; capacity: number; required_staff: number; status: string; sort_order: number };
export type GroupConstraint = { id: string; type: "together" | "apart"; student_a_id: string; student_b_id: string };
