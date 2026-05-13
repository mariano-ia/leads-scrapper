import Link from "next/link";
import { Search, ArrowRight, Linkedin, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHeader } from "@/components/sortable-header";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { formatNumber, formatPercent } from "@/lib/utils";

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
  params: { org_slug: string };
  searchParams: { q?: string; page?: string; sort?: string; order?: string };
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

  let query = svc
    .from("companies")
    .select(
      "id, name:razon_social, primary_domain:dominio, linkedin_url, founded_year, organization_revenue, organization_revenue_printed, organization_headcount_twelve_month_growth, organization_headcount_twenty_four_month_growth",
      { count: "exact" }
    )
    .eq("status", "active")
    .order(sortColumn, { ascending: order === "asc", nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (q) {
    query = query.ilike("razon_social", `%${q}%`);
  }

  const { data: companies, count } = await query;
  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

  const basePath = `/${org.slug}/companies`;
  const preservedParams = { q: q || undefined, page: searchParams.page };
  const pageParams = { q: q || undefined, sort: sortKey, order };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold">Companies</h1>
          <p className="text-sm text-muted-foreground">
            {formatNumber(count)} empresas en el universo
          </p>
        </div>
      </div>

      <form className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Buscar por razón social..." className="pl-8" />
        </div>
        <Button type="submit" variant="outline">Buscar</Button>
        {q && (
          <Link href={`/${org.slug}/companies`}>
            <Button type="button" variant="ghost">Limpiar</Button>
          </Link>
        )}
      </form>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader label="Empresa" sortKey="name" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead>
                <SortableHeader label="Dominio" sortKey="domain" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead>
                <SortableHeader label="Fundada" sortKey="founded" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead>
                <SortableHeader label="Revenue" sortKey="revenue" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead>
                <SortableHeader label="Growth 12m" sortKey="growth_12m" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
              <TableHead>
                <SortableHeader label="Growth 24m" sortKey="growth_24m" basePath={basePath} currentSort={sortKey} currentOrder={order} preservedParams={preservedParams} />
              </TableHead>
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
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.primary_domain ? (
                    <a href={`https://${c.primary_domain}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                      {c.primary_domain}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell>{c.founded_year || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.organization_revenue_printed || "—"}</TableCell>
                <TableCell>{growthBadge(c.organization_headcount_twelve_month_growth)}</TableCell>
                <TableCell>{growthBadge(c.organization_headcount_twenty_four_month_growth)}</TableCell>
                <TableCell className="text-right">
                  <Link href={`${basePath}/${c.id}`}>
                    <Button size="sm" variant="outline">
                      Ver detalle <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {(!companies || companies.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
            <Link href={`${basePath}?${new URLSearchParams({ ...pageParams, page: String(page - 1) } as any)}`}>
              <Button variant="outline" size="sm" disabled={page <= 1}>Anterior</Button>
            </Link>
            <Link href={`${basePath}?${new URLSearchParams({ ...pageParams, page: String(page + 1) } as any)}`}>
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
