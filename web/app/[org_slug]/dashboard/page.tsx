import Link from "next/link";
import { Building2, Sparkles, TrendingUp, Linkedin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { formatNumber, formatPercent, timeAgo } from "@/lib/utils";

const STATUS_ORDER = ["new", "reviewed", "qualified", "in_pipeline", "disqualified"] as const;
type StatusKey = (typeof STATUS_ORDER)[number];

const STATUS_BAR_COLOR: Record<StatusKey, string> = {
  new: "bg-amber-500",
  reviewed: "bg-gray-400",
  qualified: "bg-green-500",
  in_pipeline: "bg-blue-500",
  disqualified: "bg-gray-300",
};
const STATUS_CHIP_COLOR: Record<StatusKey, string> = {
  new: "bg-amber-100 text-amber-800",
  reviewed: "bg-gray-100 text-gray-700",
  qualified: "bg-green-100 text-green-800",
  in_pipeline: "bg-blue-100 text-blue-800",
  disqualified: "bg-gray-100 text-gray-500",
};

export default async function DashboardPage({ params }: { params: { org_slug: string } }) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const [
    companiesCount,
    enrichedCount,
    briefsCount,
    orgCompaniesCount,
    searchesCount,
    lastSync,
    radarRows,
    topGrowers,
    sectorRows,
  ] = await Promise.all([
    svc.from("companies").select("*", { count: "exact", head: true }).eq("status", "active"),
    svc.from("companies").select("*", { count: "exact", head: true }).eq("status", "active").not("sector", "is", null),
    svc.from("companies").select("*", { count: "exact", head: true }).not("ai_brief", "is", null),
    svc.from("org_companies").select("*", { count: "exact", head: true }).eq("org_id", org.id),
    svc.from("searches").select("*", { count: "exact", head: true }).eq("org_id", org.id).eq("active", true),
    svc.from("apollo_sync_runs").select("started_at, status, companies_added").order("started_at", { ascending: false }).limit(1),
    svc.from("org_companies").select("status").eq("org_id", org.id),
    svc
      .from("companies")
      .select("id, name:razon_social, primary_domain:dominio, linkedin_url, sector, headcount_range, location_ciudad, organization_revenue_printed, organization_headcount_twelve_month_growth, ai_brief")
      .eq("status", "active")
      .not("organization_headcount_twelve_month_growth", "is", null)
      .order("organization_headcount_twelve_month_growth", { ascending: false })
      .limit(10),
    svc.from("companies").select("sector").eq("status", "active").not("sector", "is", null).limit(2000),
  ]);

  const statusCounts: Record<StatusKey, number> = {
    new: 0, reviewed: 0, qualified: 0, in_pipeline: 0, disqualified: 0,
  };
  for (const row of radarRows.data || []) {
    const s = row.status as StatusKey;
    if (s in statusCounts) statusCounts[s]++;
  }
  const totalRadar = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  const sectorCounts = new Map<string, number>();
  for (const row of sectorRows.data || []) {
    const s = (row.sector as string) || "Sin clasificar";
    sectorCounts.set(s, (sectorCounts.get(s) || 0) + 1);
  }
  const topSectors = Array.from(sectorCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxSectorCount = topSectors[0]?.[1] || 1;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Estado del motor y actividad reciente</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Universo" value={formatNumber(companiesCount.count)} hint="empresas activas">
          <Building2 className="h-3 w-3" />
        </StatCard>
        <StatCard label="Enriquecidas" value={formatNumber(enrichedCount.count)} hint="con sector + headcount + ciudad" />
        <StatCard
          label="Con AI brief"
          value={formatNumber(briefsCount.count)}
          hint="análisis Claude"
        >
          <Sparkles className="h-3 w-3 text-blue-600" />
        </StatCard>
        <StatCard
          label="En tu radar"
          value={formatNumber(orgCompaniesCount.count)}
          link={{ href: `/${org.slug}/radar`, label: "Ver radar →" }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline · Status del radar</CardTitle>
            <CardDescription>
              {totalRadar} empresa{totalRadar !== 1 ? "s" : ""} distribuidas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {STATUS_ORDER.map((status) => {
              const count = statusCounts[status];
              const pct = totalRadar > 0 ? (count / totalRadar) * 100 : 0;
              return (
                <Link key={status} href={`/${org.slug}/radar?status=${status}`} className="block">
                  <div className="space-y-1 p-1 rounded hover:bg-accent">
                    <div className="flex justify-between text-xs">
                      <span className={`px-2 py-0.5 rounded-full ${STATUS_CHIP_COLOR[status]}`}>{status}</span>
                      <span className="text-muted-foreground">
                        {count} · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={STATUS_BAR_COLOR[status]} style={{ width: `${pct}%`, height: "100%" }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top sectores</CardTitle>
            <CardDescription>De las {formatNumber(enrichedCount.count)} empresas enriquecidas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topSectors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Aún no hay empresas enriquecidas suficientes. Enriquecé empresas desde su detalle para empezar a ver este breakdown.
              </p>
            ) : (
              topSectors.map(([sector, count]) => (
                <div key={sector} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="capitalize">{sector}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="bg-blue-500" style={{ width: `${(count / maxSectorCount) * 100}%`, height: "100%" }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Top empresas en crecimiento</CardTitle>
              <CardDescription>
                Ranking por growth 12m. <Sparkles className="h-3 w-3 text-blue-600 inline" /> = ya tienen AI brief.
              </CardDescription>
            </div>
            <Link href={`/${org.slug}/companies?sort=growth_12m&order=desc`}>
              <Button variant="outline" size="sm">Ver todas</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {topGrowers.data?.map((c: any) => (
            <Link key={c.id} href={`/${org.slug}/companies/${c.id}`}>
              <div className="flex items-center justify-between p-3 rounded-md border hover:bg-accent transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{c.name}</span>
                    {c.ai_brief && <Sparkles className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                    {c.linkedin_url && <Linkedin className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 mt-0.5">
                    {c.sector && <span className="capitalize">{c.sector}</span>}
                    {c.headcount_range && <span>· {c.headcount_range} emp</span>}
                    {c.location_ciudad && <span>· {c.location_ciudad}</span>}
                    {c.organization_revenue_printed && <span>· {c.organization_revenue_printed}</span>}
                  </div>
                </div>
                <Badge variant={c.organization_headcount_twelve_month_growth > 0.2 ? "success" : "info"}>
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {formatPercent(c.organization_headcount_twelve_month_growth)}
                </Badge>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Último Apollo sync</CardTitle>
            {lastSync.data?.[0] && (
              <CardDescription>
                {timeAgo(lastSync.data[0].started_at)} · {lastSync.data[0].status}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {lastSync.data?.[0] && (
              <div className="text-sm">
                <strong>+{formatNumber(lastSync.data[0].companies_added)}</strong> empresas agregadas/actualizadas
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Searches activas</CardTitle>
            <CardDescription>{searchesCount.count} corriendo</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/${org.slug}/searches`}>
              <Button variant="outline" size="sm">Gestionar</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  link,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  link?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        {hint && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {children}
            <span>{hint}</span>
          </div>
        )}
        {link && (
          <Link href={link.href} className="text-xs text-blue-600 hover:underline">
            {link.label}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
