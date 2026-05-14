/**
 * Resolver emails + display names de usuarios sin tirar `auth.admin.listUsers()`
 * en cada SSR.
 *
 * Implementación: cache en memoria (5min TTL) que llama listUsers UNA vez y lo
 * reusa entre llamadas del mismo proceso. El cache es shared via module-level
 * Map — sirve para todo el ciclo de vida del Node server.
 */
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export interface UserDisplay {
  email: string;
  name: string | null;
}

let cachedAll: { value: Map<string, UserDisplay>; expires: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

async function ensureAllUsersLoaded(): Promise<Map<string, UserDisplay>> {
  const now = Date.now();
  if (cachedAll && cachedAll.expires > now) return cachedAll.value;

  const svc = createSupabaseServiceClient();
  const result = new Map<string, UserDisplay>();
  let page = 1;
  while (page < 20) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = data?.users || [];
    for (const u of users) {
      const meta = (u.user_metadata || {}) as any;
      const displayName =
        meta.full_name || meta.name || meta.display_name || null;
      result.set(u.id, { email: u.email || "", name: displayName });
    }
    if (users.length < 200) break;
    page++;
  }
  cachedAll = { value: result, expires: now + TTL_MS };
  return result;
}

/**
 * Devuelve un Map<userId, {email, name}> para los userIds pedidos.
 * Usa cache compartido — la primera llamada en 5min carga TODOS los users.
 */
export async function resolveUserEmails(userIds: string[]): Promise<Map<string, string>> {
  const all = await ensureAllUsersLoaded();
  const out = new Map<string, string>();
  for (const id of userIds) {
    const u = all.get(id);
    if (u?.email) out.set(id, u.email);
  }
  return out;
}

/**
 * Versión que devuelve display name + email para mostrar bien en UI.
 * Fallback: si no hay name → email; si no hay email → UUID corto.
 */
export async function resolveUserDisplays(userIds: string[]): Promise<Map<string, UserDisplay>> {
  const all = await ensureAllUsersLoaded();
  const out = new Map<string, UserDisplay>();
  for (const id of userIds) {
    const u = all.get(id);
    if (u) out.set(id, u);
  }
  return out;
}

/**
 * Invalidar el cache. Llamar después de mutaciones que cambien user metadata
 * (e.g. update profile).
 */
export function invalidateUserEmailsCache() {
  cachedAll = null;
}

export function displayNameOrFallback(u: UserDisplay | undefined, fallbackId: string): string {
  if (!u) return `usuario ${fallbackId.slice(0, 8)}`;
  return u.name || u.email || `usuario ${fallbackId.slice(0, 8)}`;
}
