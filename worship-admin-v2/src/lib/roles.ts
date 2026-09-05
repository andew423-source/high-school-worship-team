export const APP_ROLES = ["ADMIN", "GROUP_STAFF"] as const;
export const PROFILE_STATUSES = ["PENDING", "ACTIVE", "DISABLED"] as const;
export type AppRole = (typeof APP_ROLES)[number];
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];
export type ProfileAccess = { role: AppRole; status: ProfileStatus };

export function destinationForProfile(profile: ProfileAccess) {
  if (profile.status !== "ACTIVE") return "/pending";
  return profile.role === "ADMIN" ? "/admin" : "/weeks";
}

export function canManage(profile: ProfileAccess | null | undefined) {
  return profile?.role === "ADMIN" && profile.status === "ACTIVE";
}

export function canUseStaffTools(profile: ProfileAccess | null | undefined) {
  return profile?.role === "GROUP_STAFF" && profile.status === "ACTIVE";
}
