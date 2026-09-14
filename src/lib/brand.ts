// Keep the production video workspace reachable when guided planning is off.
// Branding must never enable an experimental feature by itself.
export function creationPath(guidedStudioEnabled: boolean): string {
  return guidedStudioEnabled ? '/app/create' : '/app/video';
}
