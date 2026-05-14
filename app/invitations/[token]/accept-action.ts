"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

export async function acceptInvitationAction(token: string) {
  const user = await requireAuth();
  const svc = createSupabaseServiceClient();

  const { data: invitation } = await svc
    .from("invitations")
    .select("id, org_id, email, role, expires_at, accepted_at, orgs(slug)")
    .eq("token", token)
    .maybeSingle();
  if (!invitation) return { error: "Invitación inválida" };
  if (invitation.accepted_at) return { error: "Invitación ya fue aceptada" };
  if (new Date(invitation.expires_at as string) < new Date()) {
    return { error: "Invitación expirada" };
  }
  if ((user.email || "").toLowerCase() !== (invitation.email as string).toLowerCase()) {
    return { error: "El email logueado no coincide con la invitación" };
  }

  // Idempotente: si ya es miembro, marcamos la invitación como aceptada igual.
  const { data: existing } = await svc
    .from("org_members")
    .select("user_id")
    .eq("org_id", invitation.org_id as string)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: memErr } = await svc.from("org_members").insert({
      org_id: invitation.org_id,
      user_id: user.id,
      role: invitation.role,
      joined_at: new Date().toISOString(),
    });
    if (memErr) return { error: memErr.message };
  }

  await svc
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  return { success: true, org_slug: (invitation.orgs as any)?.slug as string };
}
