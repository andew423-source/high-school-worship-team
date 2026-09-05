import * as XLSX from "xlsx";
import type { RawRow } from "@/domain/imports";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["csv", "xlsx", "xls"];

export async function readSpreadsheet(file: File): Promise<{ headers: string[]; rows: RawRow[] }> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(extension)) throw new Error("CSV, XLSX, XLS 파일만 사용할 수 있습니다.");
  if (file.size > MAX_FILE_BYTES) throw new Error("파일은 10MB 이하만 사용할 수 있습니다.");

  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("첫 번째 시트를 읽을 수 없습니다.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "", blankrows: false });
  if (!matrix.length) throw new Error("파일에 데이터가 없습니다.");

  const headers = (matrix[0] ?? []).map((value, index) => String(value).trim() || `열 ${index + 1}`);
  const rows = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])))
    .filter((row) => Object.values(row).some((value) => String(value).trim()));
  if (!rows.length) throw new Error("헤더 아래에 가져올 데이터가 없습니다.");
  if (rows.length > 1000) throw new Error("한 번에 1,000명까지만 가져올 수 있습니다.");
  return { headers, rows };
}
