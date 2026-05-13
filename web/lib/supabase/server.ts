import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "../env";

export function createSupabaseServerClient() {
  const env = getServerEnv();
  const cookieStore = cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set() {
        // no-op on server (set via Response in Server Actions)
      },
      remove() {
        // no-op on server
      },
    },
  });
}

export function createSupabaseServiceClient() {
  const env = getServerEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { get: () => undefined, set: () => {}, remove: () => {} },
  });
}
