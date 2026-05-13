import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Linkedin, Phone, Globe, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { formatPercent, formatDate, timeAgo } from "@/lib/utils";
import { CompanyActions } from "./action-buttons";
import { NotesPanel } from "@/components/notes-panel";
import { StatusSelect } from "@/components/status-select";

export default async function CompanyDetailPage({
  params,
}: {
  params: { org_slug: string; id: string };
}) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const [companyRes, contactsRes, signalsRes, orgCompanyRes] = await Promise.all([
    svc.from("companies").select("*").eq("id", params.id).single(),
    svc.from("company_contacts").select("*").eq("company_id", params.id),
    svc.from("signals").select("*").eq("company_id", params.id).order("occurred_at", { ascending: false }).limit(50),
    svc.from("org_companies").select("*").eq("org_id", org.id).eq("company_id", params.id).maybeSingle(),
  ]);

  // Notes scoped a esta org_company si existe
  let notesData: any[] = [];
  if (orgCompanyRes.data) {
    const { data: notes } = await svc
      .from("org_company_notes")
      .select("id, content, created_at, author_user_id")
      .eq("org_company_id", orgCompanyRes.data.id)
      .order("created_at", { ascending: false });
    if (notes && notes.length > 0) {
      // Resolve author emails
      const userIds = Array.from(new Set(notes.map((n) => n.author_user_id)));
      const { data: usersList } = await svc.auth.admin.listUsers();
      const emailById = new Map((usersList?.users || []).map((u) => [u.id, u.email]));
      notesData = notes.map((n) => ({ ...n, author_email: emailById.get(n.author_user_id) || "?" }));
    }
  }

  const company = companyRes.data;
  if (!company) notFound();

  const isEnriched = Boolean(company.sector || company.headcount_range);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <Link href={`/${org.slug}/companies`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <CompanyActions
          orgSlug={org.slug}
          companyId={company.id}
          needsEnrich={!isEnriched}
          needsBrief={!company.ai_brief}
        />
      </div>

      <div className="flex justify-between items-start gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{company.razon_social}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {company.dominio && (
              <a href={`https://${company.dominio}`} target="_blank" rel="noopener" className="flex items-center gap-1 hover:underline">
                <Globe className="h-3 w-3" /> {company.dominio}
              </a>
            )}
            {company.linkedin_url && (
              <a href={company.linkedin_url} target="_blank" rel="noopener" className="flex items-center gap-1 hover:underline">
                <Linkedin className="h-3 w-3" /> LinkedIn
              </a>
            )}
            {company.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {company.phone}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {orgCompanyRes.data && (
            <StatusSelect orgSlug={org.slug} orgCompanyId={orgCompanyRes.data.id} current={orgCompanyRes.data.status as any} />
          )}
          {company.intent_strength && <Badge variant="warning">intent: {company.intent_strength}</Badge>}
          {company.founded_year && <Badge variant="outline">fundada {company.founded_year}</Badge>}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="signals">Signals ({signalsRes.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({contactsRes.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {company.ai_brief && (
            <Card className="border-blue-200 bg-blue-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                  AI Brief
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-foreground">{company.ai_brief}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Generado {timeAgo(company.ai_brief_generated_at)} · {company.ai_brief_model || "claude-sonnet"}
                </p>
              </CardContent>
            </Card>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Crecimiento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <Stat
                    label="6 meses"
                    value={formatPercent(company.organization_headcount_six_month_growth)}
                    trend={company.organization_headcount_six_month_growth}
                  />
                  <Stat
                    label="12 meses"
                    value={formatPercent(company.organization_headcount_twelve_month_growth)}
                    trend={company.organization_headcount_twelve_month_growth}
                  />
                  <Stat
                    label="24 meses"
                    value={formatPercent(company.organization_headcount_twenty_four_month_growth)}
                    trend={company.organization_headcount_twenty_four_month_growth}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Financial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Revenue" value={company.organization_revenue_printed} />
                <Row label="Market cap" value={company.market_cap} />
                <Row label="Public" value={company.publicly_traded_symbol ? `${company.publicly_traded_exchange}:${company.publicly_traded_symbol}` : "Privada"} />
              </CardContent>
            </Card>
          </div>

          {!isEnriched && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader>
                <CardTitle className="text-base">Datos pendientes de enriquecer</CardTitle>
                <CardDescription>
                  Esta empresa todavía no fue enriquecida con Apollo. Industry, headcount, ubicación, tech stack y descripción
                  aparecen al hacer "Enrich" (consume 1 crédito).
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {isEnriched && (
            <Card>
              <CardHeader><CardTitle className="text-base">Perfil enriquecido</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Sector" value={company.sector} />
                <Row label="Sub-sector" value={company.subsector} />
                <Row label="Headcount" value={company.headcount_range} />
                <Row label="Ubicación" value={[company.location_ciudad, company.location_provincia, company.location_pais].filter(Boolean).join(", ")} />
                <Row label="Tech stack" value={Array.isArray(company.tech_stack) && company.tech_stack.length ? company.tech_stack.join(", ") : null} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="signals">
          <Card>
            <CardContent className="p-0">
              {signalsRes.data && signalsRes.data.length > 0 ? (
                <div className="divide-y">
                  {signalsRes.data.map((s) => (
                    <div key={s.id} className="p-4 flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{s.type} · {s.source}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(s.occurred_at)}</div>
                        {s.data && Object.keys(s.data).length > 0 && (
                          <pre className="mt-1 text-xs bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(s.data, null, 2)}</pre>
                        )}
                      </div>
                      <Badge variant="info">weight {s.intent_weight}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Sin signals todavía. Los scrapers (BO, Bumeran, etc) aún no están corriendo en producción.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <CardContent className="p-0">
              {contactsRes.data && contactsRes.data.length > 0 ? (
                <div className="divide-y">
                  {contactsRes.data.map((c) => (
                    <div key={c.id} className="p-4 flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{c.full_name}</div>
                        <div className="text-xs text-muted-foreground">{c.title}</div>
                        {c.email && <div className="text-xs">{c.email}</div>}
                      </div>
                      {c.is_decision_maker && <Badge variant="success">decision maker</Badge>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Sin contactos. Apollo people search se ejecuta al enriquecer (próximo paso).
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          {orgCompanyRes.data ? (
            <NotesPanel orgSlug={org.slug} companyId={company.id} initialNotes={notesData} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Esta empresa no está en el radar de tu org todavía. Para agregar notas, primero tiene
                que matchear una search activa.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Separator />
      <div className="text-xs text-muted-foreground">
        Apollo ID: {company.apollo_id} · Último sync {timeAgo(company.last_apollo_sync_at)}
      </div>
    </div>
  );
}

function Stat({ label, value, trend }: { label: string; value: string; trend: number | null | undefined }) {
  const color = trend == null ? "" : trend > 0 ? "text-green-600" : "text-red-600";
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
