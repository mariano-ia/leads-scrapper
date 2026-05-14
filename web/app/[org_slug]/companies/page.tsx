import Link from "next/link";
import { Search, ArrowRight, Linkedin, ExternalLink, Sparkles, Database, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHeader } from "@/components/sortable-header";
import { AddToRadarButton } from "@/components/add-to-radar-button";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { formatNumber, formatPercent, formatRevenue, buildSearchParams } from "@/lib/utils";

const PAGE_SIZE = 50;

const SORT_MAP: Record<string, string> = {
  name: "razon_social",
  domain: "dominio",
  founded: "founded_year",
  revenue: "organization_revenue",
  growth_12m: "organization_headcount_twelve_month_growth",
  growth_24m: "organization_headcount_twenty_four_month_growth",
};

export default async function CompaniesPage({
  params,
  searchParams,
}: {
  params: {
    org_slug: string;
  };
  searchParams: {
    q?: string;
    page?: string;
    sort?: string;
    order?: string;
    sector?: string;
    city?: string;
    headcount?: string;
    radar?: "yes" | "no";
    enriched?: "yes" | "no";
    has_brief?: "yes";
    intent?: "any";
    growth_min?: string;
    revenue_min?: string;
  };
}) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const q = (searchParams.q || "").trim();
  const sortKey = searchParams.sort && SORT_MAP[searchParams.sort] ? searchParams.sort : "growth_12m";
  const order: "asc" | "desc" = searchParams.order === "asc" ? "asc" : "desc";
  const sortColumn = SORT_MAP[sortKey];
  const offset = (page - 1) * PAGE_SIZE;

  const sectorFilter = (searchParams.sector || "").trim();
  const cityFilter = (searchParams.city || "").trim();
  const headcountFilter = (searchParams.headcount || "").trim();
  const radarFilter = searchParams.radar === "yes" ? "yes" : searchParams.radar === "no" ? "no" : null;
  const enrichedFilter = searchParams.enriched === "yes" ? "yes" : searchParams.enriched === "no" ? "no" : null;
  const briefFilter = searchParams.has_brief === "yes";
  const intentFilter = searchParams.intent === "any";
  const growthMin = searchParams.growth_min ? Number(searchParams.growth_min) / 100 : null;
  const revenueMin = searchParams.revenue_min ? Number(searchParams.revenue_min) : null;

  // Si el filtro radar=yes/no requiere un pre-fetch de IDs en el radar
  let radarIds: string[] | null = null;
  if (radarFilter) {
    const { data: radarRows } = await svc.from("org_companies").select("company_id").eq("org_id", org.id);
    radarIds = (radarRows || []).map((r) => r.company_id as string);
  }

  let query = svc
    .from("companies")
    .select(
      "id, name:razon_social, primary_domain:dominio, linkedin_url, founded_year, organization_revenue, organization_revenue_printed, organization_headcount_twelve_month_growth, organization_headcount_twenty_four_month_growth, sector, headcount_range, location_ciudad, ai_brief, intent_strength",
      { count: "exact" }
    )
    .eq("status", "active")
    .order(sortColumn, { ascending: order === "asc", nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (q) query = query.ilike("razon_social", `%${q}%`);
  if (sectorFilter) query = query.ilike("sector", `%${sectorFilter}%`);
  if (cityFilter) query = query.ilike("location_ciudad", `%${cityFilter}%`);
  if (headcountFilter) query = query.eq("headcount_range", headcountFilter);
  if (enrichedFilter === "yes") query = query.not("sector", "is", null);
  if (enrichedFilter === "no") query = query.is("sector", null);
  if (briefFilter) query = query.not("ai_brief", "is", null);
  if (intentFilter) query = query.not("intent_strength", "is", null);
  if (growthMin != null && !isNaN(growthMin)) {
    query = query.gte("organization_headcount_twelve_month_growth", growthMin);
  }
  if (revenueMin != null && !isNaN(revenueMin)) {
    query = query.gte("organization_revenue", revenueMin);
  }
  if (radarFilter === "yes" && radarIds && radarIds.length > 0) {
    query = query.in("id", radarIds);
  } else if (radarFilter === "yes" && (!radarIds || radarIds.length === 0)) {
    // Empty radar → no results
    query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (radarFilter === "no" && radarIds && radarIds.length > 0) {
    // Validar que cada id sea un UUID estricto antes de inyectar como filtro.
    // Defensa contra SQL injection si el formato de UUID se relaja en el futuro.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeIds = radarIds.filter((id) => UUID_RE.test(id));
    if (safeIds.length > 0) {
      query = query.not("id", "in", `(${safeIds.join(",")})`);
    }
  }

  const { data: companies, count } = await query;
  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

  // Look up which of the visible companies are already on this org's radar
  // + traemos sus scores para mostrar en columnas
  const visibleIds = (companies || []).map((c: any) => c.id);
  const inRadarSet = new Set<string>();
  const scoresByCompany = new Map<string, { fit: number; intent: number; combined: number }>();
  if (visibleIds.length > 0) {
    const { data: radarRows } = await svc
      .from("org_companies")
      .select("company_id, last_fit_score, last_intent_score, last_combined_score")
      .eq("org_id", org.id)
      .in("company_id", visibleIds);
    for (const r of radarRows || []) {
      inRadarSet.add(r.company_id as string);
      scoresByCompany.set(r.company_id as string, {
        fit: Number(r.last_fit_score || 0),
        intent: Number(r.last_intent_score || 0),
        combined: Number(r.last_combined_score || 0),
      });
    }
  }

  const basePath = `/${org.slug}/companies`;
  const filterParams = {
    sector: sectorFilter || undefined,
    city: cityFilter || undefined,
    headcount: headcountFilter || undefined,
    radar: radarFilter || undefined,
    enriched: enrichedFilter || undefined,
    has_brief: briefFilter ? "yes" : undefined,
    intent: intentFilter ? "any" : undefined,
    growth_min: searchParams.growth_min || undefined,
    revenue_min: searchParams.revenue_min || undefined,
  };
  const preservedParams = { q: q || undefined, page: searchParams.page, ...filterParams };
  const pageParams = { q: q || undefined, sort: sortKey, order, ...filterParams };

  const hasActiveFilters = Object.values(filterParams).some((v) => v);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold">Companies</h1>
          <p className="text-sm text-muted-foreground">
            {formatNumber(count)} empresas en el universo · base completa que se filtra con tus searches
          </p>
        </div>
      </div>

      <Card className="p-3 bg-muted/30 border-dashed">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div>
              <Database className="inline h-3 w-3 mr-1 text-violet-600" />
              <span className="text-foreground">Enriched</span>: empresa con datos extra de Apollo (sector, headcount, ciudad, tech_stack).
              <Sparkles className="inline h-3 w-3 mx-1 text-blue-600" />
              <span className="text-foreground">AI brief</span>: tiene resumen generado por Claude.
            </div>
            <div>
              <span className="text-foreground">+ Radar</span>: marca a la empresa como tracked para la org · todos los miembros la ven en <code className="text-foreground">/radar</code>. Asignar a un usuario es marca de <em>responsabilidad</em>, no de visibilidad.
            </div>
          </div>
        </div>
      </Card>

      <form className="space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Buscar por razón social..." className="pl-8" />
          </div>
          <Input name="sector" defaultValue={sectorFilter} placeholder="Sector" className="w-40" />
          <Input name="city" defaultValue={cityFilter} placeholder="Ciudad" className="w-40" />
          <select name="headcount" defaultValue={headcountFilter} className="h-9 px-2 text-sm border rounded-md bg-background">
            <option value="">Cualquier tamaño</option>
            <option value="1,10">1-10</option>
            <option value="11,20">11-20</option>
            <option value="21,50">21-50</option>
            <option value="51,100">51-100</option>
            <option value="101,200">101-200</option>
            <option value="201,500">201-500</option>
            <option value="501,1000">501-1000</option>
          </select>
        </div>
        <div className="flex gap-2 items-center flex-wrap text-sm">
          <select name="radar" defaultValue={radarFilter || ""} className="h-9 px-2 text-sm border rounded-md bg-background">
            <option value="">Radar (todas)</option>
            <option value="yes">En el radar</option>
            <option value="no">Fuera del radar</option>
          </select>
          <select name="enriched" defaultValue={enrichedFilter || ""} className="h-9 px-2 text-sm border rounded-md bg-background">
            <option value="">Enrich (todas)</option>
            <option value="yes">Enriched</option>
            <option value="no">Sin enrich</option>
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="has_brief" value="yes" defaultChecked={briefFilter} /> Con AI brief
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="intent" value="any" defaultChecked={intentFilter} /> Con intent activo
          </label>
          <Input name="growth_min" type="number" step="1" placeholder="Growth ≥ %" defaultValue={searchParams.growth_min || ""} className="w-28" />
          <Input name="revenue_min" type="number" step="100000" placeholder="Revenue ≥ USD" defaultValue={searchParams.revenue_min || ""} className="w-36" />
          <Button type="submit" variant="outline" size="sm">Aplicar</Button>
          {(q || hasActiveFilters) && (
            <Link href={`/${org.slug}/companies`}>
              <Button type="button" variant="ghost" size="sm">Limpiar</Button>
            </Link>
          )}
        </div>
      </form>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader label="Empresa" sortKey="name" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead className="hidden md:table-cell">
                <SortableHeader label="Dominio" sortKey="domain" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                <SortableHeader label="Fundada" sortKey="founded" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                <SortableHeader label="Revenue" sortKey="revenue" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead>
                <SortableHeader label="Growth 12m" sortKey="growth_12m" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead className="hidden xl:table-cell">
                <SortableHeader label="Growth 24m" sortKey="growth_24m" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead title="Score combinado en el radar de esta org (solo si está agregada)">Score</TableHead>
              <TableHead className="hidden md:table-cell" title="Fit score: qué tan bien matchea al ICP de tu última search">Fit</TableHead>
              <TableHead className="hidden md:table-cell" title="Intent score: growth + Apollo intent + signals recientes">Intent</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies?.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link href={`${basePath}/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground" title="LinkedIn">
                        <Linkedin className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {c.sector && (
                      <span title="Enriched: tiene datos extra de Apollo (sector, headcount, ciudad)">
                        <Database className="h-3.5 w-3.5 text-violet-600" />
                      </span>
                    )}
                    {c.ai_brief && (
                      <span title="Tiene AI brief generado por Claude">
                        <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                      </span>
                    )}
                  </div>
                  {(c.sector || c.headcount_range || c.location_ciudad) && (
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      {c.sector && <span>{c.sector}</span>}
                      {c.headcount_range && <span>· {c.headcount_range} emp</span>}
                      {c.location_ciudad && <span>· {c.location_ciudad}</span>}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {c.primary_domain ? (
                    <a href={`https://${c.primary_domain}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                      {c.primary_domain}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell">{c.founded_year || "—"}</TableCell>
                <TableCell className="text-muted-foreground hidden lg:table-cell">
                  {formatRevenue(c.organization_revenue, c.organization_revenue_printed)}
                </TableCell>
                <TableCell>{growthBadge(c.organization_headcount_twelve_month_growth)}</TableCell>
                <TableCell className="hidden xl:table-cell">{growthBadge(c.organization_headcount_twenty_four_month_growth)}</TableCell>
                <TableCell>{scoreBadge(scoresByCompany.get(c.id)?.combined)}</TableCell>
                <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                  {scoresByCompany.get(c.id) ? (scoresByCompany.get(c.id)!.fit * 100).toFixed(0) : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                  {scoresByCompany.get(c.id) ? (scoresByCompany.get(c.id)!.intent * 100).toFixed(0) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <AddToRadarButton orgSlug={org.slug} companyId={c.id} inRadar={inRadarSet.has(c.id)} />
                    <Link href={`${basePath}/${c.id}`}>
                      <Button size="sm" variant="outline">
                        Ver detalle <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!companies || companies.length === 0) && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  No se encontraron empresas{q ? ` para "${q}"` : ""}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-between items-center text-sm">
          <div className="text-muted-foreground">
            Página {page} de {totalPages}
          </div>
          <div className="flex gap-2">
            <Link href={`${basePath}?${buildSearchParams({ ...pageParams, page: page - 1 })}`}>
              <Button variant="outline" size="sm" disabled={page <= 1}>Anterior</Button>
            </Link>
            <Link href={`${basePath}?${buildSearchParams({ ...pageParams, page: page + 1 })}`}>
              <Button variant="outline" size="sm" disabled={page >= totalPages}>Siguiente</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function growthBadge(value: number | null) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const variant: "success" | "info" | "secondary" | "destructive" =
    value > 0.1 ? "success" : value > 0 ? "info" : value < 0 ? "destructive" : "secondary";
  return <Badge variant={variant}>{formatPercent(value)}</Badge>;
}

function scoreBadge(value: number | undefined) {
  if (value == null) return <span className="text-muted-foreground text-xs">no radar</span>;
  const v = value;
  const variant: "success" | "info" | "secondary" | "destructive" =
    v >= 0.6 ? "success" : v >= 0.4 ? "info" : v >= 0.2 ? "secondary" : "destructive";
  return <Badge variant={variant}>{(v * 100).toFixed(0)}</Badge>;
}
