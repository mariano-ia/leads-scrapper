import { Info } from "lucide-react";
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

      <Card className="p-3 bg-muted/30 border-dashed">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div><span className="text-foreground">¿Cómo funcionan?</span> Cada search puede activar alertas. Cuando una empresa nueva matchea, mandamos un mail (vía Resend, desde <code className="text-foreground">alerts@yacare.io</code>) al destinatario configurado en la search.</div>
            <div><span className="text-foreground">¿Frecuencia?</span> Digest diario con todos los matches nuevos de las últimas 24h, no uno por empresa. Si no hay nada nuevo, no se envía.</div>
            <div><span className="text-foreground">¿Por qué fallan?</span> Estados posibles: <code className="text-foreground">sent</code> (entregado), <code className="text-foreground">bounced</code> (mailbox inválido), <code className="text-foreground">failed</code> (error en Resend / API key vencida).</div>
          </div>
        </div>
      </Card>

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
