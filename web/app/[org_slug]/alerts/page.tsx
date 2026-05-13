import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { formatDate, timeAgo } from "@/lib/utils";

export default async function AlertsPage({ params }: { params: { org_slug: string } }) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const { data: dispatches } = await svc
    .from("alert_dispatches")
    .select("*")
    .eq("org_id", org.id)
    .order("sent_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <p className="text-sm text-muted-foreground">Notificaciones por email enviadas para esta org</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico ({dispatches?.length || 0})</CardTitle>
          <CardDescription>Próximo: envío en vivo cuando un lead matchea + integración Resend</CardDescription>
        </CardHeader>
        <CardContent>
          {dispatches && dispatches.length > 0 ? (
            <div className="divide-y">
              {dispatches.map((d) => (
                <div key={d.id} className="py-3 flex justify-between items-center text-sm">
                  <div>
                    <div className="font-medium">{d.recipient}</div>
                    <div className="text-xs text-muted-foreground">{timeAgo(d.sent_at)} · {d.channel}</div>
                  </div>
                  <Badge variant={d.status === "sent" ? "success" : d.status === "bounced" ? "warning" : "destructive"}>
                    {d.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sin alertas enviadas todavía. Las alertas se disparan cuando una empresa matchea una search con `alert_enabled = true`.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
