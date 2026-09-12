/** All confirmed groups are available; a staff member's own groups come first. */
export function attendanceGroupSelection<T extends { id: string; sort_order: number }>(
  groups: T[],
  staffLinks: Array<{ group_id: string; staff_id: string }>,
  staffId: string | null,
  requestedGroupId: string | null,
) {
  const ownIds = new Set(staffLinks.filter((link) => staffId !== null && link.staff_id === staffId).map((link) => link.group_id));
  const ordered = [...groups].sort((a, b) => Number(ownIds.has(b.id)) - Number(ownIds.has(a.id)) || a.sort_order - b.sort_order);
  return {
    groups: ordered,
    selectedGroupId: ordered.find((group) => group.id === requestedGroupId)?.id ?? ordered[0]?.id,
  };
}
