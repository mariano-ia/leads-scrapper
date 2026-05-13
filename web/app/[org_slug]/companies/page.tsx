import Link from "next/link";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { formatNumber, formatPercent } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function CompaniesPage({
  params,
  searchParams,
}: {
  params: { org_slug: string };
  searchParams: { q?: string; page?: string };
}) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const q = (searchParams.q || "").trim();
  const offset = (page - 1) * PAGE_SIZE;

  let query = svc
    .from("companies")
    .select("id, name, primary_domain, founded_year, organization_revenue_printed, organization_headcount_twelve_month_growth, intent_strength, market_cap", { count: "exact" })
    .eq("status", "active")
    .order("organization_headcount_twelve_month_growth", { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  const { data: companies, count } = await query;
  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

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
          <Input name="q" defaultValue={q} placeholder="Buscar por nombre..." className="pl-8" />
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
              <TableHead>Empresa</TableHead>
              <TableHead>Dominio</TableHead>
              <TableHead>Fundada</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>Growth 12m</TableHead>
              <TableHead>Intent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies?.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/${org.slug}/companies/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.primary_domain || "—"}</TableCell>
                <TableCell>{c.founded_year || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.organization_revenue_printed || "—"}</TableCell>
                <TableCell>
                  {c.organization_headcount_twelve_month_growth != null ? (
                    <Badge
                      variant={
                        c.organization_headcount_twelve_month_growth > 0.1
                          ? "success"
                          : c.organization_headcount_twelve_month_growth > 0
                          ? "info"
                          : "secondary"
                      }
                    >
                      {formatPercent(c.organization_headcount_twelve_month_growth)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {c.intent_strength ? <Badge variant="warning">{c.intent_strength}</Badge> : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
            {(!companies || companies.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
            <Link href={`/${org.slug}/companies?${new URLSearchParams({ q, page: String(page - 1) })}`}>
              <Button variant="outline" size="sm" disabled={page <= 1}>Anterior</Button>
            </Link>
            <Link href={`/${org.slug}/companies?${new URLSearchParams({ q, page: String(page + 1) })}`}>
              <Button variant="outline" size="sm" disabled={page >= totalPages}>Siguiente</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
