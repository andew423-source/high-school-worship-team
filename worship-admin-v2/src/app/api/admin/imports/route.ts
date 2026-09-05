import { z } from "zod";
import { IMPORT_KINDS, validateMappedRows, type ImportMapping } from "@/domain/imports";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";
import { readSpreadsheet } from "@/lib/spreadsheet";

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (context.error) return context.error;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kindResult = z.enum(IMPORT_KINDS).safeParse(form?.get("kind"));
  const termId = form?.get("termId");
  const mappingInput = form?.get("mapping");
  if (!(file instanceof File) || !kindResult.success || typeof mappingInput !== "string") return apiError("가져오기 요청이 올바르지 않습니다.");
  if (kindResult.data === "STUDENTS" && (typeof termId !== "string" || !z.uuid().safeParse(termId).success)) return apiError("학생을 등록할 학기를 선택해주세요.");

  let mapping: ImportMapping;
  try { mapping = JSON.parse(mappingInput) as ImportMapping; }
  catch { return apiError("열 매핑을 읽지 못했습니다."); }

  try {
    const sheet = await readSpreadsheet(file);
    const validation = validateMappedRows(kindResult.data, sheet.rows, mapping);
    if (validation.errors.length) return apiError(`오류 ${validation.errors.length}개를 먼저 수정해주세요.`);

    const duplicateIssues = await findExistingDuplicates(context.supabase, kindResult.data, termId as string | null, validation.rows);
    if (duplicateIssues.length) return apiError(duplicateIssues.join(" "), 409, "duplicate_review_required");

    const safeName = file.name.replaceAll(/[^a-zA-Z0-9._가-힣-]/g, "_");
    const objectPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await context.supabase.storage.from("imports").upload(objectPath, file, { upsert: false });
    if (uploadError) return apiError("원본 파일을 안전하게 보관하지 못했습니다.", 500, uploadError.message);

    const rpc = kindResult.data === "STUDENTS"
      ? await context.supabase.rpc("import_term_students", { p_term_id: termId, p_rows: validation.rows })
      : await context.supabase.rpc("import_staff", { p_rows: validation.rows });
    if (rpc.error) {
      await context.supabase.storage.from("imports").remove([objectPath]);
      return apiError("DB에 명단을 저장하지 못했습니다.", 400, rpc.error.code);
    }

    await context.supabase.from("import_batches").insert({
      term_id: kindResult.data === "STUDENTS" ? termId : null,
      kind: kindResult.data,
      file_name: file.name,
      object_path: objectPath,
      status: "COMPLETED",
      row_count: rpc.data,
      mapping,
      errors: [],
      created_by: context.user.id,
    });

    return dataResponse({ importedCount: rpc.data, batchPath: objectPath }, {
      warnings: validation.warnings.map((warning) => `${warning.row}행: ${warning.message}`),
      status: 201,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "명단을 가져오지 못했습니다.");
  }
}

async function findExistingDuplicates(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>,
  kind: "STUDENTS" | "STAFF",
  termId: string | null,
  rows: Array<Record<string, unknown>>,
) {
  if (kind === "STAFF") {
    const { data } = await supabase.from("staff").select("name,email");
    const names = new Set((data ?? []).map((person) => person.name.replaceAll(" ", "").toLocaleLowerCase("ko-KR")));
    const emails = new Set((data ?? []).map((person) => person.email).filter(Boolean));
    return rows.flatMap((row) => {
      if (row.email && emails.has(row.email as string)) return [`${row.name}의 이메일은 이미 스탭 DB에 있습니다.`];
      if (names.has(String(row.name).replaceAll(" ", "").toLocaleLowerCase("ko-KR"))) return [`${row.name}과 같은 이름의 스탭이 있습니다. 자동 병합하지 않았습니다.`];
      return [];
    });
  }

  const { data } = await supabase.from("term_students")
    .select("student_id,students(name,internal_code)")
    .eq("term_id", termId);
  const existing = (data ?? []).flatMap((item) => Array.isArray(item.students) ? item.students : item.students ? [item.students] : []);
  const names = new Set(existing.map((student) => student.name.replaceAll(" ", "").toLocaleLowerCase("ko-KR")));
  const codes = new Set(existing.map((student) => student.internal_code).filter(Boolean));
  return rows.flatMap((row) => {
    if (row.internalCode && codes.has(row.internalCode as string)) return [`${row.name}의 내부 ID는 이미 이 학기에 있습니다.`];
    if (names.has(String(row.name).replaceAll(" ", "").toLocaleLowerCase("ko-KR"))) return [`${row.name}과 같은 이름의 학생이 이 학기에 있습니다. 자동 병합하지 않았습니다.`];
    return [];
  });
}
