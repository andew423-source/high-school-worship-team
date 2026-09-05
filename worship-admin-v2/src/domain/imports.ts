import { z } from "zod";

export const IMPORT_KINDS = ["STUDENTS", "STAFF"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
export type ImportMapping = Record<string, string>;
export type RawRow = Record<string, unknown>;

export const studentFields = [
  { key: "internalCode", label: "내부 ID", required: false, aliases: ["내부 id", "내부id", "학번", "id"] },
  { key: "name", label: "이름", required: true, aliases: ["이름", "성명", "학생명"] },
  { key: "grade", label: "학년", required: true, aliases: ["학년"] },
  { key: "gender", label: "성별", required: true, aliases: ["성별"] },
  { key: "serviceDepartment", label: "예배 부서", required: true, aliases: ["예배 부서", "예배부서", "부서", "예배"] },
  {
    key: "team",
    label: "팀",
    required: true,
    aliases: ["팀", "파트", "팀 구분", "싱어팀·세션팀", "싱어팀/세션팀", "싱어·세션", "싱어/세션"],
  },
  { key: "isStudentLeader", label: "학생 인도자 여부", required: false, aliases: ["학생 인도자 여부", "인도자 여부", "학생인도자", "인도자"] },
  { key: "note", label: "기본 비고", required: false, aliases: ["기본 비고"] },
  { key: "termNote", label: "학기 비고", required: false, aliases: ["비고", "학기 비고", "특이사항"] },
  { key: "active", label: "재적", required: false, aliases: ["재적", "활성", "재적 상태"] },
] as const;

export const staffFields = [
  { key: "name", label: "이름", required: true, aliases: ["이름", "성명", "스탭명"] },
  { key: "email", label: "이메일", required: false, aliases: ["이메일", "email"] },
  { key: "gender", label: "성별", required: true, aliases: ["성별"] },
  {
    key: "roleTitle",
    label: "역할",
    required: false,
    aliases: ["역할", "직책", "담당", "팀", "팀 구분", "싱어팀·세션팀", "싱어팀/세션팀"],
  },
  { key: "singerCapable", label: "싱어 가능", required: false, aliases: ["싱어 가능", "싱어가능", "싱어"] },
  { key: "groupLeaderCapable", label: "조 담당 가능", required: false, aliases: ["조 담당 가능", "조담당가능", "조 담당"] },
  { key: "preferredService", label: "선호 예배", required: false, aliases: ["선호 예배", "선호예배", "예배"] },
  { key: "defaultStageRole", label: "기본 주일 역할", required: false, aliases: ["기본 주일 역할", "기본주일역할", "주일 역할", "주일역할", "등단 역할"] },
  { key: "excludeFromAutoSinger", label: "자동 싱어 제외", required: false, aliases: ["자동 싱어 제외", "자동싱어제외", "자동 배정 제외"] },
  { key: "isDefaultStageLeader", label: "기본 인도자", required: false, aliases: ["기본 인도자", "기본인도자", "주일 인도자"] },
  { key: "note", label: "비고", required: false, aliases: ["비고", "특이사항"] },
  { key: "active", label: "활성", required: false, aliases: ["활성", "재적"] },
] as const;

export const studentImportSchema = z.object({
  internalCode: z.string().trim().max(100).nullable().default(null),
  name: z.string().trim().min(1, "이름이 없습니다.").max(100),
  grade: z.number().int().min(1).max(3),
  gender: z.enum(["FEMALE", "MALE"]),
  serviceDepartment: z.enum(["FIRST", "SECOND"]),
  team: z.enum(["SINGER", "SESSION"]),
  isStudentLeader: z.boolean().default(false),
  note: z.string().trim().max(1000).nullable().default(null),
  termNote: z.string().trim().max(1000).nullable().default(null),
  active: z.boolean().default(true),
});

export const staffImportSchema = z.object({
  name: z.string().trim().min(1, "이름이 없습니다.").max(100),
  email: z.union([z.email(), z.literal("")]).transform((value) => value || null),
  gender: z.enum(["FEMALE", "MALE"]),
  roleTitle: z.string().trim().max(100).nullable().default(null),
  singerCapable: z.boolean().default(true),
  groupLeaderCapable: z.boolean().default(false),
  preferredService: z.enum(["FIRST", "SECOND", "BOTH"]),
  defaultStageRole: z.enum(["SINGER", "SESSION"]),
  excludeFromAutoSinger: z.boolean().default(false),
  isDefaultStageLeader: z.boolean().default(false),
  note: z.string().trim().max(1000).nullable().default(null),
  active: z.boolean().default(true),
});

export type StudentImportRow = z.infer<typeof studentImportSchema>;
export type StaffImportRow = z.infer<typeof staffImportSchema>;

export type RowIssue = { row: number; message: string };

export function fieldsFor(kind: ImportKind) {
  return kind === "STUDENTS" ? studentFields : staffFields;
}

export function guessMapping(headers: string[], kind: ImportKind): ImportMapping {
  const fields = fieldsFor(kind);
  return Object.fromEntries(headers.map((header) => {
    const normalized = normalizeHeader(header);
    const field = fields.find((candidate) => candidate.aliases.some((alias) => normalizeHeader(alias) === normalized));
    return [header, field?.key ?? ""];
  }));
}

export function validateMappedRows(kind: ImportKind, rawRows: RawRow[], mapping: ImportMapping) {
  const rows: Array<StudentImportRow | StaffImportRow> = [];
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const names = new Map<string, number>();
  const internalCodes = new Map<string, number>();
  const mappedTargets = new Set(Object.values(mapping).filter(Boolean));
  const missingFields = fieldsFor(kind).filter((field) => field.required && !mappedTargets.has(field.key));

  if (missingFields.length) {
    return {
      rows,
      errors: missingFields.map((field) => ({ row: 1, message: `필수 열 '${field.label}'이 연결되지 않았습니다.` })),
      warnings,
    };
  }

  rawRows.forEach((raw, index) => {
    const mapped = Object.fromEntries(Object.entries(mapping)
      .filter(([, target]) => target)
      .map(([source, target]) => [target, raw[source]]));
    const rowNumber = index + 2;
    const normalized = kind === "STUDENTS" ? normalizeStudent(mapped) : normalizeStaff(mapped);
    const result = kind === "STUDENTS" ? studentImportSchema.safeParse(normalized) : staffImportSchema.safeParse(normalized);

    if (!result.success) {
      errors.push({
        row: rowNumber,
        message: result.error.issues.map((issue) => formatValidationIssue(kind, issue.path[0], mapped)).join(" · "),
      });
      return;
    }

    const nameKey = result.data.name.replaceAll(" ", "").toLocaleLowerCase("ko-KR");
    if (names.has(nameKey)) warnings.push({ row: rowNumber, message: `같은 파일에 '${result.data.name}' 이름이 중복됩니다. 서로 다른 사람인지 확인해주세요.` });
    else names.set(nameKey, rowNumber);

    if (kind === "STUDENTS") {
      const code = (result.data as StudentImportRow).internalCode;
      if (code && internalCodes.has(code)) errors.push({ row: rowNumber, message: `내부 ID '${code}'가 파일 안에서 중복됩니다.` });
      else if (code) internalCodes.set(code, rowNumber);
    }
    rows.push(result.data);
  });

  return { rows, errors, warnings };
}

function normalizeStudent(row: RawRow) {
  return {
    internalCode: nullableText(row.internalCode),
    name: text(row.name),
    grade: parseGrade(row.grade),
    gender: parseGender(row.gender),
    serviceDepartment: parseService(row.serviceDepartment, false),
    team: parseTeam(row.team),
    isStudentLeader: parseBoolean(row.isStudentLeader, false),
    note: nullableText(row.note),
    termNote: nullableText(row.termNote),
    active: parseBoolean(row.active, true),
  };
}

function normalizeStaff(row: RawRow) {
  const roleTitle = nullableText(row.roleTitle);
  const normalizedName = text(row.name).replaceAll(" ", "");
  return {
    name: text(row.name),
    email: text(row.email).toLowerCase(),
    gender: parseGender(row.gender),
    roleTitle,
    singerCapable: parseSingerCapable(row.singerCapable, roleTitle, row.name),
    groupLeaderCapable: parseBoolean(row.groupLeaderCapable, false),
    preferredService: text(row.preferredService) ? parseService(row.preferredService, true) : "BOTH",
    defaultStageRole: text(row.defaultStageRole)
      ? parseStageRole(row.defaultStageRole)
      : normalizedName === "이소정" ? "SESSION" : "SINGER",
    excludeFromAutoSinger: parseBoolean(row.excludeFromAutoSinger, normalizedName === "황현민"),
    isDefaultStageLeader: parseBoolean(row.isDefaultStageLeader, normalizedName === "황현민"),
    note: nullableText(row.note),
    active: parseBoolean(row.active, true),
  };
}

function normalizeHeader(value: string) { return value.trim().replaceAll(/[_\-\s]/g, "").toLowerCase(); }
function text(value: unknown) { return value == null ? "" : String(value).trim(); }
function nullableText(value: unknown) { const valueText = text(value); return valueText || null; }
function parseGrade(value: unknown) { const match = text(value).match(/[1-3]/); return match ? Number(match[0]) : Number.NaN; }
function parseGender(value: unknown) {
  const valueText = text(value).toLowerCase();
  if (["여", "여자", "여성", "f", "female"].includes(valueText)) return "FEMALE";
  if (["남", "남자", "남성", "m", "male"].includes(valueText)) return "MALE";
  return "";
}
function parseService(value: unknown, allowBoth: boolean) {
  const valueText = text(value).replaceAll(" ", "").toLowerCase();
  if (allowBoth && ["모두", "양쪽", "1·2부", "1,2부", "both"].includes(valueText)) return "BOTH";
  if (["1", "1부", "first"].includes(valueText)) return "FIRST";
  if (["2", "2부", "second"].includes(valueText)) return "SECOND";
  return "";
}
function parseTeam(value: unknown) {
  const valueText = text(value).replaceAll(/[_\-\s]/g, "").toLowerCase();
  if (["싱어", "싱어팀", "singer", "singerteam", "vocal", "보컬", "보컬팀"].includes(valueText)) return "SINGER";
  if (["세션", "세션팀", "session", "sessionteam", "악기", "악기팀"].includes(valueText)) return "SESSION";
  return "";
}
function parseStageRole(value: unknown) {
  const valueText = text(value).replaceAll(/[_\-\s]/g, "").toLowerCase();
  if (["싱어", "싱어팀", "singer", "vocal", "보컬"].includes(valueText)) return "SINGER";
  if (["세션", "세션팀", "session", "악기"].includes(valueText)) return "SESSION";
  return "";
}
function parseBoolean(value: unknown, fallback: boolean) {
  const valueText = text(value).toLowerCase();
  if (!valueText) return fallback;
  if (["예", "네", "y", "yes", "true", "1", "활성", "재적", "학생 인도자"].includes(valueText)) return true;
  if (["아니오", "아니요", "n", "no", "false", "0", "비활성"].includes(valueText)) return false;
  return fallback;
}

function parseSingerCapable(value: unknown, roleTitle: string | null, name: unknown) {
  if (text(value)) return parseBoolean(value, true);
  const normalizedRole = (roleTitle ?? "").replaceAll(/[_\-\s]/g, "").toLowerCase();
  if (normalizedRole.includes("싱어") || normalizedRole.includes("보컬")) return true;
  if (normalizedRole.includes("세션") || normalizedRole.includes("악기")) return false;
  return text(name).replaceAll(" ", "") !== "이소정";
}

function formatValidationIssue(kind: ImportKind, path: PropertyKey | undefined, mapped: RawRow) {
  const key = typeof path === "string" ? path : "";
  const label = fieldsFor(kind).find((field) => field.key === key)?.label ?? "입력값";
  const rawValue = text(mapped[key]);
  const shownValue = rawValue ? `'${rawValue}'` : "빈칸";

  if (key === "name") return `${label}: 이름을 입력해주세요.`;
  if (key === "grade") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 1~3학년으로 입력해주세요.`;
  if (key === "gender") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 남 또는 여로 입력해주세요.`;
  if (key === "serviceDepartment") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 1부 또는 2부로 입력해주세요.`;
  if (key === "team") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 싱어 또는 세션으로 입력해주세요.`;
  if (key === "preferredService") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 1부, 2부 또는 모두로 입력해주세요.`;
  if (key === "defaultStageRole") return `${label}: ${shownValue}은(는) 인식할 수 없습니다. 싱어 또는 세션으로 입력해주세요.`;
  if (key === "email") return `${label}: 이메일 형식을 확인해주세요.`;
  return `${label}: 입력값을 확인해주세요.`;
}
