export function currentAdminUserPath(
  displayedUserID: string,
  routeUserID: string,
  suffix = '',
): string | null {
  if (!displayedUserID || displayedUserID !== routeUserID) return null;
  return `/v1/admin/users/${encodeURIComponent(displayedUserID)}${suffix}`;
}
