export function studentLeaderValue(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s/g, "");
  return ["1", "true", "y", "yes", "예", "가능", "o"].includes(normalized) || normalized.includes("학생인도") || normalized.includes("인도자");
}
