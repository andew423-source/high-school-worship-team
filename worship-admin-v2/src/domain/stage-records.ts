export type RecordVersion = { id: string; plan_id: string; version_no: number; leader_type: string; leader_term_student_id: string | null };
export function latestConfirmedVersions(versions: RecordVersion[]) {
  const latest = new Map<string, RecordVersion>();
  for (const version of versions) {
    if ((latest.get(version.plan_id)?.version_no ?? -1) < version.version_no) latest.set(version.plan_id, version);
  }
  return latest;
}

export function stageRecordLabel({ confirmed, leader, roles, eligible, excluded }: {
  confirmed: boolean; leader: boolean; roles: string[]; eligible: boolean; excluded: boolean;
}) {
  if (!confirmed) return "미확정";
  if (leader) return "인도자";
  if (roles.length) return [...new Set(roles)].sort().join(" · ");
  if (eligible || excluded) return "반에서 예배하기";
  return "기록 없음";
}
