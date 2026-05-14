import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "../env";

/**
 * Cliente Supabase para Server Components y Server Actions.
 * Usa la sesión del user vía cookies — respeta RLS.
 */
export function createSupabaseServerClient() {
  const env = getServerEnv();
  const cookieStore = cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // En Server Components puros (no Server Actions/Route Handlers), set tira.
          // El refresh de sesión lo hace el middleware igual, así que es seguro silenciar.
        }
      },
    },
  });
}

/**
 * Cliente Supabase con service_role key — BYPASS RLS.
 * SOLO usar en server-side donde queremos data global o admin ops.
 * NUNCA exponer el resultado de queries hechas con este cliente directamente al cliente
 * sin filtrar por la org/permisos del user logueado.
 */
export function createSupabaseServiceClient() {
  const env = getServerEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
}
