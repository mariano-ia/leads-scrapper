import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, timeAgo } from "@/lib/utils";

export default async function AdminUniversePage() {
  const svc = createSupabaseServiceClient();

  const [active, history, companiesCount, contactsCount, lastSync] = await Promise.all([
    svc.from("universe_master_versions").select("*").eq("is_active", true).maybeSingle(),
    svc.from("universe_master_versions").select("*").order("version_int", { ascending: false }),
    svc.from("companies").select("*", { count: "exact", head: true }).eq("status", "active"),
    svc.from("company_contacts").select("*", { count: "exact", head: true }),
    svc.from("apollo_sync_runs").select("*").order("started_at", { ascending: false }).limit(1),
  ]);

  const config = (active.data?.config as any) || {};

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Master universe</h1>
        <p className="text-sm text-muted-foreground">Config global del universo · solo super-admin</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Empresas activas</CardDescription><CardTitle className="text-3xl">{formatNumber(companiesCount.count)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">en la base global</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Contactos</CardDescription><CardTitle className="text-3xl">{formatNumber(contactsCount.count)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">de Apollo + scraping</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Último sync</CardDescription><CardTitle className="text-base">{lastSync.data?.[0] ? timeAgo(lastSync.data[0].started_at) : "Nunca"}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">{lastSync.data?.[0] ? `mode: ${lastSync.data[0].mode} · ${lastSync.data[0].status}` : ""}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Config activo · v{active.data?.version_int}</CardTitle>
              <CardDescription>Activado {formatDate(active.data?.activated_at)}</CardDescription>
            </div>
            <Badge variant="success">activa</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="País" value={config.location_country} />
          <Row label="Headcount" value={`${config.headcount_min} – ${config.headcount_max}`} />
          <Row label="Fundada desde" value={config.founded_year_min} />
          <Row label="Max companies target" value={formatNumber(config.max_companies_target)} />
          <Row label="Industries incluidas" value={(config.industries || []).length + " sectores"} />
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Ver lista de sectores</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-muted-foreground">
              {(config.industries || []).map((i: string) => <li key={i}>· {i}</li>)}
            </ul>
          </details>
          <Row label="Excluidas" value={(config.exclude_industries || []).join(", ")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historial de versiones</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {history.data?.map((v) => (
            <div key={v.id} className="flex justify-between py-1 border-b last:border-0">
              <span className="font-mono text-xs">v{v.version_int}</span>
              <span className="text-muted-foreground">
                {v.is_active ? <Badge variant="success">activa</Badge> : <span>{formatDate(v.activated_at)} → {formatDate(v.deactivated_at)}</span>}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="p-4 text-sm">
          <strong>Próximo:</strong> editor de config con preview antes de aplicar ("X empresas matchearían"), + botón para disparar sync inmediato.
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
