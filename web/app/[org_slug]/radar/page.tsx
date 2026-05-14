import Link from "next/link";
import { Sparkles, ArrowRight, Linkedin, ExternalLink, TrendingUp, Database, Info, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusSelect } from "@/components/status-select";
import { OwnerSelect } from "@/components/owner-select";
import { SortableHeader } from "@/components/sortable-header";
import { RescoreButton } from "./rescore-button";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { resolveUserEmails } from "@/lib/user-emails";
import { formatNumber, formatPercent, formatRevenue, timeAgo } from "@/lib/utils";

const STATUS_FILTERS = ["all", "new", "reviewed", "qualified", "in_pipeline", "disqualified"] as const;
const STATUS_LABEL: Record<string, string> = {
  all: "Todas",
  new: "Nuevas",
  reviewed: "Revisadas",
  qualified: "Calificadas",
  in_pipeline: "En pipeline",
  disqualified: "Descartadas",
};

const RADAR_SORT_MAP: Record<string, string> = {
  score: "last_combined_score",
  fit: "last_fit_score",
  intent: "last_intent_score",
  status: "status",
  matched: "first_matched_at",
};

export default async function RadarPage({
  params,
  searchParams,
}: {
  params: { org_slug: string };
  searchParams: { status?: string; sort?: string; order?: string };
}) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const statusFilter = STATUS_FILTERS.includes(searchParams.status as any)
    ? (searchParams.status as (typeof STATUS_FILTERS)[number])
    : "all";

  const sortKey = searchParams.sort && RADAR_SORT_MAP[searchParams.sort] ? searchParams.sort : "score";
  const order: "asc" | "desc" = searchParams.order === "asc" ? "asc" : "desc";
  const sortColumn = RADAR_SORT_MAP[sortKey];

  let query = svc
    .from("org_companies")
    .select(
      "id, first_matched_at, status, last_combined_score, last_fit_score, last_intent_score, ai_brief, companies(id, razon_social, dominio, sector, headcount_range, location_ciudad, organization_revenue, organization_revenue_printed, organization_headcount_twelve_month_growth, intent_strength, ai_brief, linkedin_url)",
      { count: "exact" }
    )
    .eq("org_id", org.id)
    .order(sortColumn, { ascending: order === "asc", nullsFirst: false })
    .limit(200);
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  const { data: rows, count } = await query;

  // Signal counts por empresa visible — para mostrar contribución a intent score
  const visibleCompanyIds = (rows || []).map((r: any) => r.companies?.id).filter(Boolean);
  const signalCountByCompany = new Map<string, number>();
  if (visibleCompanyIds.length > 0) {
    const { data: sigRows } = await svc
      .from("signals")
      .select("company_id")
      .in("company_id", visibleCompanyIds);
    for (const s of sigRows || []) {
      signalCountByCompany.set(s.company_id as string, (signalCountByCompany.get(s.company_id as string) || 0) + 1);
    }
  }

  // Counts per status for the filter chips
  const { data: allForCounts } = await svc
    .from("org_companies")
    .select("status")
    .eq("org_id", org.id);
  const counts: Record<string, number> = { all: allForCounts?.length || 0 };
  for (const row of allForCounts || []) {
    const s = row.status as string;
    counts[s] = (counts[s] || 0) + 1;
  }

  // Owners: fetch current owner per org_company + members list
  const orgCompanyIds = (rows || []).map((r: any) => r.id);
  const { data: owners } = await svc
    .from("org_company_owners")
    .select("org_company_id, user_id")
    .in("org_company_id", orgCompanyIds.length > 0 ? orgCompanyIds : ["00000000-0000-0000-0000-000000000000"]);
  const ownerByOc = new Map<string, string>();
  for (const o of owners || []) ownerByOc.set(o.org_company_id, o.user_id);

  const { data: memberRows } = await svc
    .from("org_members")
    .select("user_id")
    .eq("org_id", org.id);
  const memberUserIds = (memberRows || []).map((m) => m.user_id);
  const emailMap = await resolveUserEmails(memberUserIds);
  const members = memberUserIds.map((id) => ({
    user_id: id,
    email: emailMap.get(id) || id,
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold">Radar</h1>
          <p className="text-sm text-muted-foreground">
            {formatNumber(count)} empresa{count !== 1 ? "s" : ""} en {statusFilter === "all" ? "tu radar" : STATUS_LABEL[statusFilter].toLowerCase()}
          </p>
        </div>
        <RescoreButton orgSlug={org.slug} />
      </div>

      <Card className="p-3 bg-muted/30 border-dashed">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div><span className="text-foreground">Cómo se calcula el score (0-100):</span></div>
            <div><span className="text-foreground">Fit (0-1)</span> = enriched +0.25 · headcount en rango +0.25 · founded ≥ min +0.20 · revenue conocido +0.15 · sector matchea ICP +0.15</div>
            <div><span className="text-foreground">Intent (0-1)</span> = growth&gt;10% +0.40 (o &gt;0% +0.20) · Apollo intent_strength high/medium/low +0.30/0.15/0.05 · signals recientes +0.10 c/u (tope +0.30)</div>
            <div><span className="text-foreground">Score combinado</span> = 0.5 × fit + 0.5 × intent · escalado ×100</div>
            <div className="pt-1">Tocá <span className="text-foreground font-medium">Rescore</span> para recalcular con los datos actuales (después de Apollo sync o signals nuevas).</div>
          </div>
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((s) => {
          const active = s === statusFilter;
          const href = s === "all" ? `/${org.slug}/radar` : `/${org.slug}/radar?status=${s}`;
          return (
            <Link key={s} href={href}>
              <Button
                size="sm"
                variant={active ? "default" : "outline"}
                className="rounded-full h-7 px-3 text-xs"
              >
                {STATUS_LABEL[s]} · {counts[s] || 0}
              </Button>
            </Link>
          );
        })}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>
                <SortableHeader label="Score" sortKey="score" basePath={`/${org.slug}/radar`} currentSort={sortKey} currentOrder={order} preservedParams={{ status: statusFilter === "all" ? undefined : statusFilter }} />
              </TableHead>
              <TableHead>
                <SortableHeader label="Fit" sortKey="fit" basePath={`/${org.slug}/radar`} currentSort={sortKey} currentOrder={order} preservedParams={{ status: statusFilter === "all" ? undefined : statusFilter }} />
              </TableHead>
              <TableHead>
                <SortableHeader label="Intent" sortKey="intent" basePath={`/${org.slug}/radar`} currentSort={sortKey} currentOrder={order} preservedParams={{ status: statusFilter === "all" ? undefined : statusFilter }} />
              </TableHead>
              <TableHead>Growth 12m</TableHead>
              <TableHead>
                <SortableHeader label="Status" sortKey="status" basePath={`/${org.slug}/radar`} currentSort={sortKey} currentOrder={order} preservedParams={{ status: statusFilter === "all" ? undefined : statusFilter }} />
              </TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>
                <SortableHeader label="Match" sortKey="matched" basePath={`/${org.slug}/radar`} currentSort={sortKey} currentOrder={order} preservedParams={{ status: statusFilter === "all" ? undefined : statusFilter }} />
              </TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.map((r: any) => {
              const c = r.companies;
              if (!c) return null;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link href={`/${org.slug}/companies/${c.id}`} className="font-medium hover:underline">
                        {c.razon_social}
                      </Link>
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground" title="LinkedIn">
                          <Linkedin className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {c.dominio && (
                        <a href={`https://${c.dominio}`} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground" title="Web">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {c.sector && (
                        <span title="Enriched · datos extra de Apollo">
                          <Database className="h-3.5 w-3.5 text-violet-600" />
                        </span>
                      )}
                      {c.ai_brief && (
                        <span title="Tiene AI brief">
                          <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                        </span>
                      )}
                    </div>
                    {(c.sector || c.headcount_range) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {[c.sector, c.headcount_range && `${c.headcount_range} emp`, c.location_ciudad, formatRevenue(c.organization_revenue, c.organization_revenue_printed)]
                          .filter((s) => s && s !== "—")
                          .join(" · ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={Number(r.last_combined_score) >= 0.6 ? "success" : Number(r.last_combined_score) >= 0.4 ? "info" : Number(r.last_combined_score) >= 0.2 ? "secondary" : "destructive"}
                      title={`fit ${Number(r.last_fit_score || 0).toFixed(2)} · intent ${Number(r.last_intent_score || 0).toFixed(2)}`}
                    >
                      {(Number(r.last_combined_score || 0) * 100).toFixed(0)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground" title="Qué tan bien matchea la empresa al ICP">
                    {(Number(r.last_fit_score || 0) * 100).toFixed(0)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground" title="Señales de momento: growth, Apollo intent, signals recientes">
                    {(Number(r.last_intent_score || 0) * 100).toFixed(0)}
                    {(signalCountByCompany.get(c.id) || 0) > 0 && (
                      <span className="ml-1 inline-flex items-center text-[10px] text-blue-600">
                        · {signalCountByCompany.get(c.id)}🔔
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.organization_headcount_twelve_month_growth != null ? (
                      <Badge variant={c.organization_headcount_twelve_month_growth > 0.1 ? "success" : "info"}>
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {formatPercent(c.organization_headcount_twelve_month_growth)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusSelect orgSlug={org.slug} orgCompanyId={r.id} current={r.status as any} />
                  </TableCell>
                  <TableCell>
                    <OwnerSelect
                      orgSlug={org.slug}
                      orgCompanyId={r.id}
                      currentOwnerId={ownerByOc.get(r.id) || null}
                      members={members}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{timeAgo(r.first_matched_at)}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/${org.slug}/companies/${c.id}`}>
                      <Button size="sm" variant="outline">
                        Ver detalle <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
            {(!rows || rows.length === 0) && (
              <TableRow>
                <TableCell colSpan={9} className="py-12">
                  <div className="flex flex-col items-center gap-3 text-center max-w-md mx-auto">
                    <div className="rounded-full bg-muted p-3">
                      <Sparkles className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base">Tu radar está vacío</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Cargá empresas calificadas para empezar a hacer outreach con datos.
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-center pt-1">
                      <Link href={`/${org.slug}/searches/new`}>
                        <Button size="sm"><Plus className="h-3 w-3" /> Crear search</Button>
                      </Link>
                      <Link href={`/${org.slug}/companies`}>
                        <Button size="sm" variant="outline">Buscar en universo</Button>
                      </Link>
                    </div>
                    <p className="text-[11px] text-muted-foreground pt-2">
                      Las searches filtran las 23.7K empresas del universo Apollo + corren signals automáticamente.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: any =
    status === "qualified" ? "success" :
    status === "in_pipeline" ? "info" :
    status === "disqualified" ? "secondary" :
    status === "reviewed" ? "outline" :
    "warning";
  return <Badge variant={variant}>{status}</Badge>;
}
