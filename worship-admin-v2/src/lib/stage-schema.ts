import { z } from "zod";

export const stageOverrideSchema = z.object({
  termStudentId: z.uuid(),
  kind: z.enum(["MOVE_DEPARTMENT", "FORCE_STAGE", "EXCLUDE_STAGE"]),
  department: z.enum(["FIRST", "SECOND"]),
  role: z.enum(["SINGER", "CHOIR", "RANDOM"]).nullish(),
}).superRefine((item, context) => {
  if (item.kind === "FORCE_STAGE" && !item.role) {
    context.addIssue({ code: "custom", message: "무조건 등단의 포지션을 선택해주세요." });
  }
  if (item.kind !== "FORCE_STAGE" && item.role) {
    context.addIssue({ code: "custom", message: "등단 안함·부서 이동에는 포지션을 지정하지 않습니다." });
  }
});
