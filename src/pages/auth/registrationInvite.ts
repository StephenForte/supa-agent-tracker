// Page-session memory only: survives auth remounts, never a reload or tab boundary.
let registrationInvite: string | null = null;
export function getRegistrationInvite() { return registrationInvite; }
export function rememberRegistrationInvite(invite: string | null) { registrationInvite = invite; }
// Also used by test setup to keep independent page sessions isolated.
export function clearRegistrationInvite() { registrationInvite = null; }
