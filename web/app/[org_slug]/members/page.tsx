import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { resolveUserEmails } from "@/lib/user-emails";
import { formatDate, initials } from "@/lib/utils";

export default async function MembersPage({ params }: { params: { org_slug: string } }) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  // Custom: join org_members with auth.users via RPC or direct query
  const { data: members } = await svc
    .from("org_members")
    .select("id, role, joined_at, user_id")
    .eq("org_id", org.id);

  const userIds = (members || []).map((m) => m.user_id);
  const userMap = await resolveUserEmails(userIds);

  const { data: invitations } = await svc
    .from("invitations")
    .select("id, email, role, created_at, expires_at, accepted_at")
    .eq("org_id", org.id)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Miembros</h1>
        <p className="text-sm text-muted-foreground">Personas con acceso a esta organización</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Miembros activos ({members?.length || 0})</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {members?.map((m) => {
            const email = userMap.get(m.user_id) || m.user_id;
            return (
              <div key={m.id} className="flex items-center gap-3 py-3">
                <Avatar className="h-8 w-8"><AvatarFallback>{initials(email)}</AvatarFallback></Avatar>
                <div className="flex-1">
                  <div className="text-sm font-medium">{email}</div>
                  <div className="text-xs text-muted-foreground">Desde {formatDate(m.joined_at)}</div>
                </div>
                <Badge variant={m.role === "admin" ? "default" : "secondary"}>{m.role}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitaciones pendientes</CardTitle>
          <CardDescription>Próximo: form para invitar nuevos miembros + envío con Resend</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations && invitations.length > 0 ? (
            <div className="divide-y">
              {invitations.map((inv) => (
                <div key={inv.id} className="py-3 flex justify-between items-center text-sm">
                  <div>
                    <div className="font-medium">{inv.email}</div>
                    <div className="text-xs text-muted-foreground">Expira {formatDate(inv.expires_at)}</div>
                  </div>
                  <Badge variant="outline">{inv.role}</Badge>
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
