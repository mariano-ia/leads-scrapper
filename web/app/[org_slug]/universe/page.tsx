import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { formatNumber, formatDate } from "@/lib/utils";

export default async function UniversePage({ params }: { params: { org_slug: string } }) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const [target, masterRes, allTargets, companiesCount] = await Promise.all([
    svc.from("org_universe_targets").select("*").eq("org_id", org.id).eq("is_active", true).maybeSingle(),
    svc.from("universe_master_versions").select("*").eq("is_active", true).maybeSingle(),
    svc.from("org_universe_targets").select("version_int, created_at, activated_at, deactivated_at").eq("org_id", org.id).order("version_int", { ascending: false }),
    svc.from("companies").select("*", { count: "exact", head: true }).eq("status", "active"),
  ]);

  const targetConfig = (target.data?.config as any) || {};
  const masterConfig = (masterRes.data?.config as any) || {};

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Universe target</h1>
        <p className="text-sm text-muted-foreground">Filtro local sobre el universo maestro de Apollo · sin costo de créditos</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Target activo · v{target.data?.version_int || 1}</CardTitle>
              <CardDescription>Activada {formatDate(target.data?.activated_at)}</CardDescription>
            </div>
            <Badge variant="success">activa</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Headcount min" value={targetConfig.headcount_min} />
          <Row label="Headcount max" value={targetConfig.headcount_max} />
          <Row label="Fundada desde" value={targetConfig.founded_year_min} />
          <Row label="Industries any" value={(targetConfig.industries_any || []).join(", ") || "(todas del maestro)"} />
          <Row label="Industries excluidas" value={(targetConfig.industries_none || []).join(", ") || "(ninguna extra)"} />
          <Row label="Provincias" value={(targetConfig.provincias_any || []).join(", ") || "(todas AR)"} />
          <Row label="Technologies any" value={(targetConfig.technologies_any || []).join(", ") || "—"} />
          <Row label="Technologies excluidas" value={(targetConfig.technologies_none || []).join(", ") || "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Universo maestro (super-admin)</CardTitle>
          <CardDescription>Define qué empresas existen en el sistema. Lo gestiona super-admin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="País" value={masterConfig.location_country} />
          <Row label="Headcount" value={`${masterConfig.headcount_min || "?"} – ${masterConfig.headcount_max || "?"}`} />
          <Row label="Fundada desde" value={masterConfig.founded_year_min} />
          <Row label="Industries" value={(masterConfig.industries || []).length + " sectores"} />
          <Row label="Exclude industries" value={(masterConfig.exclude_industries || []).join(", ") || "—"} />
          <Row label="Max companies target" value={formatNumber(masterConfig.max_companies_target)} />
          <Row label="Empresas en DB actualmente" value={formatNumber(companiesCount.count)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico de versiones</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {allTargets.data?.map((v) => (
            <div key={v.version_int} className="flex justify-between py-1 border-b last:border-0">
              <span>v{v.version_int}</span>
              <span className="text-muted-foreground">
                {formatDate(v.activated_at)} {v.deactivated_at ? `→ desactivada ${formatDate(v.deactivated_at)}` : "(activa)"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="p-4 text-sm">
          <strong>Próximo:</strong> editor visual para crear nuevas versiones del target con preview ("esto matchearía X empresas") antes de guardar. Por ahora la config se ajusta vía SQL.
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
