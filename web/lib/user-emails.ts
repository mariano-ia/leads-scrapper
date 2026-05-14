/**
 * Resolver emails de usuarios sin llamar `auth.admin.listUsers()` (HTTP slow).
 *
 * Usa la vista `public.user_emails` (security_invoker) que joinea con
 * `auth.users`. Mucho más barato que la API admin.
 *
 * Cacheo en memoria por 5 minutos para evitar queries repetidas dentro
 * de un mismo render server-side.
 */
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type CacheEntry = { value: Map<string, string>; expires: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

/**
 * Devuelve un Map<userId, email> para los userIds pedidos.
 * Si todos están cacheados frescos, devuelve sin tocar la DB.
 */
export async function resolveUserEmails(userIds: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const result = new Map<string, string>();
  const missing: string[] = [];

  for (const id of userIds) {
    const entry = cache.get(id);
    if (entry && entry.expires > now) {
      const email = entry.value.get(id);
      if (email) result.set(id, email);
    } else {
      missing.push(id);
    }
  }

  if (missing.length === 0) return result;

  const svc = createSupabaseServiceClient();
  const { data: rows } = await svc
    .from("user_emails")
    .select("user_id, email")
    .in("user_id", missing);

  const fetched = new Map<string, string>();
  for (const r of rows || []) {
    if (r.user_id && r.email) {
      fetched.set(r.user_id as string, r.email as string);
      result.set(r.user_id as string, r.email as string);
    }
  }

  // Cache per-id
  for (const id of missing) {
    const email = fetched.get(id);
    if (email) {
      cache.set(id, { value: new Map([[id, email]]), expires: now + TTL_MS });
    }
  }

  return result;
}
