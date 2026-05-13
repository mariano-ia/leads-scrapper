import Link from "next/link";
import { Plus, Search as SearchIcon, Bell, BellOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";

export default async function SearchesPage({ params }: { params: { org_slug: string } }) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const { data: searches } = await svc
    .from("searches")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold">Searches</h1>
          <p className="text-sm text-muted-foreground">Búsquedas parametrizables sobre el universo</p>
        </div>
        <Link href={`/${org.slug}/searches/new`}>
          <Button>
            <Plus className="h-4 w-4" /> Nueva search
          </Button>
        </Link>
      </div>

      {searches && searches.length > 0 ? (
        <div className="grid gap-3">
          {searches.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Creada {timeAgo(s.created_at)} · min score {s.min_combined_score}
                  </div>
                  {s.llm_filter_text && (
                    <p className="text-xs text-muted-foreground mt-1 italic">"{s.llm_filter_text.slice(0, 120)}…"</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {s.alert_enabled ? (
                    <Badge variant="success"><Bell className="h-3 w-3 mr-1" />alertas on</Badge>
                  ) : (
                    <Badge variant="secondary"><BellOff className="h-3 w-3 mr-1" />alertas off</Badge>
                  )}
                  <Badge variant={s.active ? "info" : "secondary"}>{s.active ? "activa" : "pausada"}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader className="text-center py-12">
            <SearchIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <CardTitle>Sin searches todavía</CardTitle>
            <CardDescription>Creá tu primera search para empezar a generar leads</CardDescription>
            <Link href={`/${org.slug}/searches/new`} className="mt-4 inline-block">
              <Button><Plus className="h-4 w-4" /> Crear primera search</Button>
            </Link>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
