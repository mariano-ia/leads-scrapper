import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { resolveUserDisplays, displayNameOrFallback } from "@/lib/user-emails";
import { formatDate, initials } from "@/lib/utils";
import { InviteForm, CancelInvitationButton } from "./invite-form";

export default async function MembersPage({ params }: { params: { org_slug: string } }) {
  const user = await requireAuth();
  const { org, role } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const { data: members } = await svc
    .from("org_members")
    .select("id, role, joined_at, user_id")
    .eq("org_id", org.id);

  const userIds = (members || []).map((m) => m.user_id);
  const displayMap = await resolveUserDisplays(userIds);

  const { data: invitations } = await svc
    .from("invitations")
    .select("id, email, role, created_at, expires_at, accepted_at")
    .eq("org_id", org.id)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Miembros</h1>
        <p className="text-sm text-muted-foreground">Personas con acceso a esta organización</p>
      </div>

      {role === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Invitar miembro</CardTitle>
            <CardDescription>Le mandamos un mail con un link de aceptación (expira en 7 días)</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm orgSlug={org.slug} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Miembros activos ({members?.length || 0})</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {members?.map((m) => {
            const display = displayMap.get(m.user_id);
            const label = displayNameOrFallback(display, m.user_id);
            const email = display?.email || "";
            return (
              <div key={m.id} className="flex items-center gap-3 py-3">
                <Avatar className="h-8 w-8"><AvatarFallback>{initials(label)}</AvatarFallback></Avatar>
                <div className="flex-1">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground">
                    {email && display?.name ? `${email} · ` : ""}desde {formatDate(m.joined_at)}
                  </div>
                </div>
                <Badge variant={m.role === "admin" ? "default" : "secondary"}>{m.role}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitaciones pendientes ({invitations?.length || 0})</CardTitle>
          <CardDescription>Aceptación pendiente · expira 7 días después de creada</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations && invitations.length > 0 ? (
            <div className="divide-y">
              {invitations.map((inv) => (
                <div key={inv.id} className="py-3 flex justify-between items-center text-sm gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{inv.email}</div>
                    <div className="text-xs text-muted-foreground">Expira {formatDate(inv.expires_at)}</div>
                  </div>
                  <Badge variant="outline">{inv.role}</Badge>
                  {role === "admin" && <CancelInvitationButton orgSlug={org.slug} invitationId={inv.id} />}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Sin invitaciones pendientes.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
