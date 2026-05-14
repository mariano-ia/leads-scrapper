import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceClient } from "./supabase/server";

export async function getCurrentUser() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("super_admins").select("user_id").eq("user_id", userId).limit(1);
  return Boolean(data && data.length > 0);
}

export async function getOrgBySlug(slug: string) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("orgs").select("*").eq("slug", slug).single();
  return data;
}

export async function getUserOrgs(userId: string) {
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("org_members")
    .select("role, orgs(id, slug, name)")
    .eq("user_id", userId);
  return data || [];
}

export async function requireOrgMembership(slug: string, userId: string) {
  const org = await getOrgBySlug(slug);
  if (!org) redirect("/select-org");

  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .limit(1);

  if (!data || data.length === 0) {
    const isSuper = await isSuperAdmin(userId);
    if (!isSuper) redirect("/select-org");
  }

  return { org, role: (data?.[0]?.role || "admin") as "admin" | "member" };
}
