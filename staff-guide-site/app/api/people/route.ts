import * as XLSX from "xlsx";
import { all, audit, createId, getUploads, now, run } from "../../../db/runtime";
import { jsonError, requireApiUser } from "../../../lib/api-auth";

export const dynamic = "force-dynamic";
type RawRow = Record<string, unknown>;
const aliases: Record<string, string[]> = {
  name: ["이름", "성명", "name"], grade: ["학년", "grade"], gender: ["성별", "gender"], servicePart: ["예배부서", "부", "1부2부", "service", "servicepart"],
  isStudentLeader: ["학생인도자", "인도자", "학생인도", "leader"], email: ["이메일", "email"], duty: ["역할", "담당", "role", "duty"],
  canSing: ["싱어가능", "싱어스탭", "싱어", "cansing"], canLeadGroup: ["조담당가능", "조담당", "canleadgroup"], preferredService: ["선호예배", "선호부", "preferredservice"], notes: ["비고", "메모", "notes"],
};
function cleanKey(value: string) { return value.toLowerCase().replace(/[\s_()-]/g, ""); }
function valueFor(row: RawRow, field: string, mapping: Record<string, string>) { if (mapping[field]) return row[mapping[field]]; const entry = Object.entries(row).find(([key]) => aliases[field]?.map(cleanKey).includes(cleanKey(key))); return entry?.[1]; }
function booleanValue(value: unknown) { return ["1", "true", "y", "yes", "예", "가능", "o", "싱어"].includes(String(value ?? "").trim().toLowerCase()); }
function serviceValue(value: unknown) { const match = String(value ?? "").match(/[12]/); return match ? Number(match[0]) : null; }

export async function GET() {
  const { user, error } = await requireApiUser(); if (error) return error;
  const [students, staff, imports, users] = await Promise.all([
    all("SELECT * FROM students ORDER BY active DESC, service_part, name"), all("SELECT * FROM staff ORDER BY active DESC, name"),
    user?.role === "admin" ? all("SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 20") : Promise.resolve([]),
    user?.role === "admin" ? all("SELECT u.*,s.name staff_name FROM app_users u LEFT JOIN staff s ON s.id=u.staff_id ORDER BY u.created_at DESC") : Promise.resolve([]),
  ]);
  return Response.json({ students, staff, imports, users, role: user?.role });
}

export async function POST(request: Request) {
  const { user, error } = await requireApiUser(["admin"]); if (error || !user) return error;
  const form = await request.formData(); const file = form.get("file"); const kind = form.get("kind");
  if (!(file instanceof File) || (kind !== "students" && kind !== "staff")) return jsonError("학생 또는 스탭 파일을 선택해주세요.");
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return jsonError("CSV 또는 XLSX 파일만 올릴 수 있습니다.");
  let mapping: Record<string, string> = {}; try { mapping = JSON.parse(String(form.get("mapping") || "{}")); } catch { return jsonError("열 매핑 형식이 올바르지 않습니다."); }
  const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer, { type: "array", cellDates: false }); const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  const headers = Object.keys(rawRows[0] ?? {}); const suggestedMapping = Object.fromEntries(Object.keys(aliases).map((field) => [field, headers.find((header) => aliases[field].map(cleanKey).includes(cleanKey(header))) ?? ""]));
  const existingNames = new Set((await all<{ name: string }>(`SELECT name FROM ${kind === "students" ? "students" : "staff"} WHERE active = 1`)).map((row) => row.name.trim()));
  const rows = rawRows.map((row, index) => {
    const name = String(valueFor(row, "name", mapping) ?? "").trim(); const errors: string[] = [];
    if (!name) errors.push("이름이 없습니다.");
    if (kind === "students") {
      const servicePart = serviceValue(valueFor(row, "servicePart", mapping)); if (!servicePart) errors.push("예배 부서는 1부 또는 2부여야 합니다.");
      return { rowNumber: index + 2, name, grade: Number(valueFor(row, "grade", mapping)) || null, gender: String(valueFor(row, "gender", mapping) ?? "").trim() || null, servicePart, isStudentLeader: booleanValue(valueFor(row, "isStudentLeader", mapping)), notes: String(valueFor(row, "notes", mapping) ?? "").trim() || null, duplicate: existingNames.has(name), errors };
    }
    return { rowNumber: index + 2, name, email: String(valueFor(row, "email", mapping) ?? "").trim().toLowerCase() || null, duty: String(valueFor(row, "duty", mapping) ?? "").trim() || null, canSing: booleanValue(valueFor(row, "canSing", mapping)), canLeadGroup: booleanValue(valueFor(row, "canLeadGroup", mapping)), preferredService: serviceValue(valueFor(row, "preferredService", mapping)), notes: String(valueFor(row, "notes", mapping) ?? "").trim() || null, duplicate: existingNames.has(name), errors };
  });
  const objectKey = String(form.get("objectKey") || `imports/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, "_")}`);
  if (!form.get("objectKey")) await getUploads().put(objectKey, buffer, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
  return Response.json({ kind, filename: file.name, objectKey, headers, mapping: { ...suggestedMapping, ...mapping }, rows, summary: { total: rows.length, errors: rows.filter((row) => row.errors.length).length, duplicates: rows.filter((row) => row.duplicate).length } });
}

export async function PUT(request: Request) {
  const { user, error } = await requireApiUser(["admin"]); if (error || !user) return error;
  const body = await request.json() as { action?: string; kind: "students" | "staff"; rows?: Array<Record<string, unknown>>; objectKey?: string; filename?: string; allowDuplicates?: boolean; record?: Record<string, unknown>; userId?: string; role?: string; staffId?: string | null; status?: string };
  if (body.action === "authorize_user" && body.userId) {
    const role = ["admin", "group_staff", "staff"].includes(body.role ?? "") ? body.role : "staff";
    const status = body.status === "disabled" ? "disabled" : "active";
    await run("UPDATE app_users SET role=?,status=?,staff_id=?,updated_at=? WHERE id=?", [role, status, body.staffId || null, now(), body.userId]);
    await audit(user.id, "authorize", "app_user", body.userId, null, { role, status, staffId: body.staffId }); return Response.json({ ok: true });
  }
  if (body.action === "save_record" && body.record) {
    const record = body.record; const timestamp = now(); const id = String(record.id || createId(body.kind === "students" ? "student" : "staff"));
    if (!String(record.name ?? "").trim()) return jsonError("이름은 필수입니다.");
    if (body.kind === "students") await run("INSERT INTO students (id,name,grade,gender,service_part,is_student_leader,active,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,grade=excluded.grade,gender=excluded.gender,service_part=excluded.service_part,is_student_leader=excluded.is_student_leader,active=excluded.active,notes=excluded.notes,updated_at=excluded.updated_at",
      [id, String(record.name).trim(), Number(record.grade) || null, record.gender || null, Number(record.servicePart || record.service_part) || 1, Number(Boolean(record.isStudentLeader ?? record.is_student_leader)), Number(record.active ?? 1), record.notes || null, timestamp, timestamp]);
    else await run("INSERT INTO staff (id,name,email,duty,can_sing,can_lead_group,preferred_service,active,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,duty=excluded.duty,can_sing=excluded.can_sing,can_lead_group=excluded.can_lead_group,preferred_service=excluded.preferred_service,active=excluded.active,notes=excluded.notes,updated_at=excluded.updated_at",
      [id, String(record.name).trim(), record.email || null, record.duty || null, Number(Boolean(record.canSing ?? record.can_sing)), Number(Boolean(record.canLeadGroup ?? record.can_lead_group)), Number(record.preferredService ?? record.preferred_service) || null, Number(record.active ?? 1), record.notes || null, timestamp, timestamp]);
    await audit(user.id, "save", body.kind, id, null, record); return Response.json({ ok: true, id });
  }
  if (!body.rows?.length || !body.objectKey || !body.filename) return jsonError("가져올 데이터가 없습니다.");
  const validRows = body.rows.filter((row) => !(row.errors as unknown[])?.length && (body.allowDuplicates || !row.duplicate)); const timestamp = now();
  for (const row of validRows) {
    if (body.kind === "students") await run("INSERT INTO students (id,name,grade,gender,service_part,is_student_leader,active,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?,?)",
      [createId("student"), row.name, row.grade || null, row.gender || null, row.servicePart, Number(Boolean(row.isStudentLeader)), row.notes || null, timestamp, timestamp]);
    else await run("INSERT INTO staff (id,name,email,duty,can_sing,can_lead_group,preferred_service,active,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)",
      [createId("staff"), row.name, row.email || null, row.duty || null, Number(Boolean(row.canSing)), Number(Boolean(row.canLeadGroup)), row.preferredService || null, row.notes || null, timestamp, timestamp]);
  }
  const batchId = createId("import"); await run("INSERT INTO import_batches (id,kind,filename,object_key,row_count,imported_by,created_at) VALUES (?,?,?,?,?,?,?)", [batchId, body.kind, body.filename, body.objectKey, validRows.length, user.id, timestamp]);
  await audit(user.id, "import", body.kind, batchId, null, { count: validRows.length, filename: body.filename });
  return Response.json({ ok: true, imported: validRows.length, skipped: body.rows.length - validRows.length });
}
