import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Login route handler.
 * Recibe form POST con email + password, autentica con Supabase, resuelve
 * el destino según las orgs del user, y responde con redirect + cookies.
 *
 * El patrón clave: coleccionar las cookies en un array durante setAll(),
 * después crear el redirect response final, y aplicar las cookies. Si
 * intentás escribirlas a un NextResponse que después reemplazás, las perdés.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return redirectToLogin(request, "Faltan email o contraseña");
  }

  // Coleccionamos cookies que Supabase quiere setear
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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.log("[login] signIn error:", error.message);
    return redirectToLogin(request, error.message);
  }
  if (!data.user) {
    return redirectToLogin(request, "No se pudo recuperar el usuario");
  }

  // Resolver destino vía service-role (no necesita session cookie)
  const adminClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const { data: memberships } = await adminClient
    .from("org_members")
    .select("role, orgs(id, slug, name)")
    .eq("user_id", data.user.id);

  let destination: string;

  if (!memberships || memberships.length === 0) {
    const { data: superAdmin } = await adminClient
      .from("super_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .limit(1);
    destination = superAdmin && superAdmin.length > 0 ? "/admin/orgs" : "/select-org";
  } else if (memberships.length === 1) {
    // @ts-expect-error nested orgs field
    destination = `/${memberships[0].orgs.slug}/dashboard`;
  } else {
    destination = "/select-org";
  }

  console.log("[login] OK", {
    user: data.user.email,
    destination,
    cookies_to_set: sessionCookies.length,
  });

  // Response final con cookies aplicadas
  const response = NextResponse.redirect(new URL(destination, request.url), { status: 303 });
  for (const c of sessionCookies) {
    response.cookies.set(c.name, c.value, c.options);
  }
  return response;
}

function redirectToLogin(request: NextRequest, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}
