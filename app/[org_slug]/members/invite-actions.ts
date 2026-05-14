"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Crea una invitation y manda email via Resend.
 * Solo admins de la org pueden invitar.
 */
export async function createInvitationAction(orgSlug: string, formData: FormData) {
  const user = await requireAuth();
  const { org, role } = await requireOrgMembership(orgSlug, user.id);
  if (role !== "admin") return { error: "Solo admins pueden invitar miembros" };

  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const inviteRole = ((formData.get("role") as string) || "member").trim();

  if (!EMAIL_RE.test(email)) return { error: "Email inválido" };
  if (!["admin", "member"].includes(inviteRole)) return { error: "Rol inválido" };

  const svc = createSupabaseServiceClient();

  // Skip si ya es miembro
  const { data: existingUsers } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existingUser = existingUsers?.users.find((u) => u.email?.toLowerCase() === email);
  if (existingUser) {
    const { data: existingMember } = await svc
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id)
      .eq("user_id", existingUser.id)
      .maybeSingle();
    if (existingMember) return { error: `${email} ya es miembro de esta org` };
  }

  // Skip si ya hay invitación pendiente
  const { data: existingInvite } = await svc
    .from("invitations")
    .select("id, expires_at, accepted_at")
    .eq("org_id", org.id)
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (existingInvite) return { error: "Ya hay una invitación pendiente para este email" };

  // Crear invitation
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insErr } = await svc.from("invitations").insert({
    org_id: org.id,
    email,
    role: inviteRole,
    token,
    invited_by: user.id,
    expires_at: expiresAt,
  });
  if (insErr) return { error: insErr.message };

  // Mandar email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "leads@yacare.io";
  const fromName = process.env.RESEND_FROM_NAME || "Leads Yacaré";
  if (resendKey) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://yacare.io";
    const acceptUrl = `${baseUrl}/invitations/${token}`;
    const inviterName =
      ((user.user_metadata as any)?.full_name as string) || user.email || "un miembro de la org";
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [email],
          subject: `Invitación a ${org.name} en Yacaré Leads`,
          text:
            `Hola,\n\n${inviterName} te invitó a unirte a "${org.name}" en Yacaré Leads como ${inviteRole}.\n\n` +
            `Para aceptar la invitación entrá a:\n${acceptUrl}\n\n` +
            `Este link expira en 7 días.\n\nSaludos`,
          reply_to: user.email || undefined,
        }),
      });
    } catch {
      // No bloqueamos el flow si Resend falla; la invitation queda creada.
    }
  }

  revalidatePath(`/${orgSlug}/members`);
  return { success: true };
}

/**
 * Cancelar invitación pendiente.
 */
export async function cancelInvitationAction(orgSlug: string, invitationId: string) {
  const user = await requireAuth();
  const { org, role } = await requireOrgMembership(orgSlug, user.id);
  if (role !== "admin") return { error: "Solo admins pueden cancelar invitaciones" };

  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("invitations")
    .delete()
    .eq("id", invitationId)
    .eq("org_id", org.id)
    .is("accepted_at", null);
  if (error) return { error: error.message };

  revalidatePath(`/${orgSlug}/members`);
  return { success: true };
}
