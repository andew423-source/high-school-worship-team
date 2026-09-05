import { z } from "zod";
import { IMPORT_KINDS, guessMapping, validateMappedRows, type ImportMapping } from "@/domain/imports";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";
import { readSpreadsheet } from "@/lib/spreadsheet";

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (context.error) return context.error;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kindResult = z.enum(IMPORT_KINDS).safeParse(form?.get("kind"));
  if (!(file instanceof File) || !kindResult.success) return apiError("파일과 가져오기 종류를 확인해주세요.");

  try {
    const sheet = await readSpreadsheet(file);
    const mappingInput = form?.get("mapping");
    const mapping = typeof mappingInput === "string" && mappingInput
      ? JSON.parse(mappingInput) as ImportMapping
      : guessMapping(sheet.headers, kindResult.data);
    const validation = validateMappedRows(kindResult.data, sheet.rows, mapping);
    return dataResponse({
      fileName: file.name,
      headers: sheet.headers,
      sampleRows: sheet.rows.slice(0, 5),
      rawRows: sheet.rows,
      mapping,
      validRows: validation.rows.length,
      errors: validation.errors,
      rowWarnings: validation.warnings,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
  }
}
