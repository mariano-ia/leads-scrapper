import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(request: NextRequest) {
  const sessionCookies: Array<{ name: string; value: string; options: any }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          for (const c of cookiesToSet) {
            sessionCookies.push({ name: c.name, value: c.value, options: c.options });
          }
        },
      },
    }
  );

  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  // Aplicar cookies (signOut limpia las de sesión)
  for (const c of sessionCookies) {
    response.cookies.set(c.name, c.value, c.options);
  }
  // Best-effort: borrar manualmente cookies sb-* por si signOut no las setteó vacías
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-") && !sessionCookies.some((sc) => sc.name === c.name)) {
      response.cookies.set(c.name, "", { maxAge: 0, path: "/" });
    }
  }
  return response;
}
