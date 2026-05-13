import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";

export async function CreditCounterWidget() {
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("apollo_credit_summary").select("*").limit(1).single();

  if (!data) return null;

  const used = data.credits_used as number;
  const total = data.monthly_budget_credits as number;
  const remaining = data.credits_remaining as number;
  const pct = Number(data.pct_used);

  const colorClass =
    pct >= 95 ? "text-red-600" : pct >= 85 ? "text-amber-600" : pct >= 70 ? "text-yellow-600" : "text-green-600";

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Apollo créditos</span>
          <span className={`text-xs ${colorClass}`}>{pct.toFixed(1)}%</span>
        </div>
        <Progress value={pct} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatNumber(used)} usados</span>
          <span>{formatNumber(remaining)} disp.</span>
        </div>
        <div className="text-xs text-muted-foreground border-t pt-2">
          Plan {data.apollo_plan_name} · ${data.apollo_plan_monthly_usd}/mes · {data.year_month}
        </div>
      </CardContent>
    </Card>
  );
}
