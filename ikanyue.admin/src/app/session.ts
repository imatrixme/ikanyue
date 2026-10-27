// Reads the JWT `exp` claim for UX only; the API remains the authority on validity.
export function tokenExpiresAt(token: string | undefined): number | null {
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown }
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null
  } catch {
    return null
  }
}
