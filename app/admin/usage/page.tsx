import { Terminal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, timeAgo } from "@/lib/utils";

export default async function AdminUsagePage() {
  const svc = createSupabaseServiceClient();

  const [summary, monthly, alerts, runs] = await Promise.all([
    svc.from("apollo_credit_summary").select("*").maybeSingle(),
    svc.from("apollo_credit_usage_monthly").select("*").order("year_month", { ascending: false }).limit(12),
    svc.from("apollo_budget_alerts").select("*").order("sent_at", { ascending: false }).limit(20),
    svc.from("apollo_sync_runs").select("*").order("started_at", { ascending: false }).limit(20),
  ]);

  const s = summary.data || ({} as any);
  const pct = Number(s.pct_used || 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Apollo usage</h1>
        <p className="text-sm text-muted-foreground">Consumo de créditos + alertas + historial de sync</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mes actual · {s.year_month}</CardTitle>
          <CardDescription>Plan {s.apollo_plan_name} (${s.apollo_plan_monthly_usd}/mes)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={pct} />
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><div className="text-xs text-muted-foreground">Usados</div><div className="text-2xl font-semibold">{formatNumber(s.credits_used)}</div></div>
            <div><div className="text-xs text-muted-foreground">Disponibles</div><div className="text-2xl font-semibold">{formatNumber(s.credits_remaining)}</div></div>
            <div><div className="text-xs text-muted-foreground">Budget</div><div className="text-2xl font-semibold">{formatNumber(s.monthly_budget_credits)}</div></div>
          </div>
          <div className="text-xs text-muted-foreground">
            Thresholds: {(s.alert_thresholds_pct || []).join("% / ")}%  ·  Hard stop: {s.hard_stop_pct}%
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historial mensual</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Mes</TableHead><TableHead>Créditos usados</TableHead><TableHead>Último sync</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {monthly.data?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono">{m.year_month}</TableCell>
                  <TableCell>{formatNumber(m.credits_used)}</TableCell>
                  <TableCell className="text-muted-foreground">{m.last_sync_at ? formatDate(m.last_sync_at) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sync runs recientes</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuándo</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead>Créditos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{timeAgo(r.started_at)}</TableCell>
                  <TableCell><Badge variant="outline">{r.mode}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={r.status === "completed" ? "success" : r.status === "running" ? "info" : r.status === "aborted" ? "warning" : "destructive"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>+{r.companies_added}</TableCell>
                  <TableCell className="text-muted-foreground">{r.credits_used}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Terminal className="h-4 w-4" /> Jobs operativos</CardTitle>
          <CardDescription>Cómo correr los procesos de datos desde la consola</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="font-medium">Sync inicial del universo (0 créditos)</div>
            <pre className="bg-muted rounded p-2 text-xs mt-1 overflow-x-auto"><code>python -m leads_scrapper.jobs.apollo_sync --mode initial</code></pre>
            <p className="text-xs text-muted-foreground mt-1">Trae empresas nuevas de Apollo Search aplicando los filtros del universe master. Usar la primera vez o cuando se amplían los filtros.</p>
          </div>
          <div>
            <div className="font-medium">Refresh delta (0 créditos)</div>
            <pre className="bg-muted rounded p-2 text-xs mt-1 overflow-x-auto"><code>python -m leads_scrapper.jobs.apollo_sync --mode delta</code></pre>
            <p className="text-xs text-muted-foreground mt-1">Re-corre Apollo Search y hace UPSERT — actualiza intent_strength, growth, revenue. <strong>Correr una vez por semana</strong> para mantener señales frescas.</p>
          </div>
          <div>
            <div className="font-medium">Enrich pendientes (1 créd/empresa)</div>
            <pre className="bg-muted rounded p-2 text-xs mt-1 overflow-x-auto"><code>python -m leads_scrapper.jobs.enrich_pending --limit 50</code></pre>
            <p className="text-xs text-muted-foreground mt-1">Toma N empresas del radar sin enrich y completa sector/headcount/ciudad/tech. El budget guardrail bloquea si se cruza el hard-stop.</p>
          </div>
          <div>
            <div className="font-medium">Generar AI briefs (~$0.003/empresa)</div>
            <pre className="bg-muted rounded p-2 text-xs mt-1 overflow-x-auto"><code>python -m leads_scrapper.jobs.generate_briefs --limit 50</code></pre>
            <p className="text-xs text-muted-foreground mt-1">Genera briefs Claude para empresas enriched sin brief. Requiere crédito en Anthropic.</p>
          </div>
          <div>
            <div className="font-medium">Scrape BO Nacional (signals propios)</div>
            <pre className="bg-muted rounded p-2 text-xs mt-1 overflow-x-auto"><code>python -m leads_scrapper.jobs.scrape_bo --days 7</code></pre>
            <p className="text-xs text-muted-foreground mt-1">Levanta avisos del BO de los últimos N días, matchea contra empresas existentes y crea signals. Default 7 días — correr semanal.</p>
          </div>
          <div>
            <div className="font-medium">Mandar digest de alerts</div>
            <pre className="bg-muted rounded p-2 text-xs mt-1 overflow-x-auto"><code>python -m leads_scrapper.jobs.send_alerts</code></pre>
            <p className="text-xs text-muted-foreground mt-1">Mira matches nuevos de las últimas 24h por search activa y manda email vía Resend. Correr diario por cron.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Alertas de budget enviadas</CardTitle></CardHeader>
        <CardContent>
          {alerts.data && alerts.data.length > 0 ? (
            <div className="divide-y">
              {alerts.data.map((a) => (
                <div key={a.id} className="py-2 flex justify-between text-sm">
                  <span><Badge variant="warning">{a.threshold_pct}%</Badge> · {a.year_month}</span>
                  <span className="text-muted-foreground">{formatDate(a.sent_at)} · {a.credits_used_at_alert} créditos</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Sin alertas todavía.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
