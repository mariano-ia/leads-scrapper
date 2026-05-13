"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserOrgs, isSuperAdmin } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Faltan email o contraseña" };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // Resolver destino
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No se pudo recuperar el usuario después del login" };

  const orgs = await getUserOrgs(user.id);
  if (orgs.length === 0) {
    const sa = await isSuperAdmin(user.id);
    redirect(sa ? "/admin/orgs" : "/select-org");
  }
  if (orgs.length === 1) {
    // @ts-expect-error nested
    redirect(`/${orgs[0].orgs.slug}/dashboard`);
  }
  redirect("/select-org");
}

export async function logoutAction() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
