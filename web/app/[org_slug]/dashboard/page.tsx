import Link from "next/link";
import { Building2, Search, Bell, Sparkles, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { formatNumber, timeAgo } from "@/lib/utils";

export default async function DashboardPage({ params }: { params: { org_slug: string } }) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const [companiesCount, orgCompaniesCount, searchesCount, lastSync, recentCompanies] = await Promise.all([
    svc.from("companies").select("*", { count: "exact", head: true }).eq("status", "active"),
    svc.from("org_companies").select("*", { count: "exact", head: true }).eq("org_id", org.id),
    svc.from("searches").select("*", { count: "exact", head: true }).eq("org_id", org.id).eq("active", true),
    svc.from("apollo_sync_runs").select("started_at, status, companies_added").order("started_at", { ascending: false }).limit(1),
    svc
      .from("companies")
      .select(
        "id, name:razon_social, primary_domain:dominio, founded_year, organization_headcount_twelve_month_growth, intent_strength, last_apollo_sync_at"
      )
      .order("last_apollo_sync_at", { ascending: false })
      .limit(8),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Estado del motor y actividad reciente</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Universo total</CardDescription>
            <CardTitle className="text-3xl">{formatNumber(companiesCount.count)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" /> empresas argentinas en DB
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>En tu radar</CardDescription>
            <CardTitle className="text-3xl">{formatNumber(orgCompaniesCount.count)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" /> matchearon alguna search
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Searches activas</CardDescription>
            <CardTitle className="text-3xl">{formatNumber(searchesCount.count)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/${org.slug}/searches`} className="text-xs text-blue-600 hover:underline">
              Gestionar →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Último sync Apollo</CardDescription>
            <CardTitle className="text-base font-medium">
              {lastSync.data?.[0] ? timeAgo(lastSync.data[0].started_at) : "Nunca"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastSync.data?.[0] && (
              <div className="text-xs text-muted-foreground">
                +{lastSync.data[0].companies_added} empresas · {lastSync.data[0].status}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Empresas recientes en el universo</CardTitle>
              <CardDescription>Últimas sincronizadas desde Apollo</CardDescription>
            </div>
            <Link href={`/${org.slug}/companies`}>
              <Button variant="outline" size="sm">Ver todas</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentCompanies.data?.map((c) => (
              <Link key={c.id} href={`/${org.slug}/companies/${c.id}`}>
                <div className="flex items-center justify-between p-3 rounded-md border hover:bg-accent transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground flex gap-2">
                      <span>{c.primary_domain || "—"}</span>
                      {c.founded_year && <span>· fundada {c.founded_year}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.organization_headcount_twelve_month_growth != null && (
                      <Badge variant={c.organization_headcount_twelve_month_growth > 0.1 ? "success" : c.organization_headcount_twelve_month_growth > 0 ? "info" : "secondary"}>
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {(c.organization_headcount_twelve_month_growth * 100).toFixed(1)}%
                      </Badge>
                    )}
                    {c.intent_strength && c.intent_strength !== "weak" && (
                      <Badge variant="warning">{c.intent_strength}</Badge>
                    )}
                  </div>
                </div>
              </Link>
            ))}
            {(!recentCompanies.data || recentCompanies.data.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aún no hay empresas. Ejecutá un Apollo sync.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
