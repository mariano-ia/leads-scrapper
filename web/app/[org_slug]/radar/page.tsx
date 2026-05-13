import Link from "next/link";
import { Sparkles, ArrowRight, Linkedin, ExternalLink, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusSelect } from "@/components/status-select";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { formatNumber, formatPercent, timeAgo } from "@/lib/utils";

export default async function RadarPage({ params }: { params: { org_slug: string } }) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const { data: rows, count } = await svc
    .from("org_companies")
    .select(
      "id, first_matched_at, status, last_combined_score, last_fit_score, last_intent_score, ai_brief, companies(id, razon_social, dominio, sector, headcount_range, location_ciudad, organization_revenue_printed, organization_headcount_twelve_month_growth, intent_strength, ai_brief, linkedin_url)",
      { count: "exact" }
    )
    .eq("org_id", org.id)
    .order("last_combined_score", { ascending: false, nullsFirst: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Radar</h1>
        <p className="text-sm text-muted-foreground">
          {formatNumber(count)} empresas que matchearon alguna search activa de Yacaré, ordenadas por score combinado
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Growth 12m</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Match</TableHead>
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
                      {c.ai_brief && <Sparkles className="h-3.5 w-3.5 text-blue-600" />}
                    </div>
                    {(c.sector || c.headcount_range) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {[c.sector, c.headcount_range && `${c.headcount_range} emp`, c.location_ciudad, c.organization_revenue_printed]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={Number(r.last_combined_score) > 20 ? "success" : Number(r.last_combined_score) > 5 ? "info" : "secondary"}>
                      {Number(r.last_combined_score || 0).toFixed(1)}
                    </Badge>
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
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  Sin empresas en el radar todavía. Creá una <Link href={`/${org.slug}/searches/new`} className="text-blue-600 hover:underline">search</Link> para empezar.
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
