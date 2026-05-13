import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Linkedin, Phone, Globe, Building2, Mail, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { formatPercent, formatDate, timeAgo, formatRevenue } from "@/lib/utils";
import { CompanyActions } from "./action-buttons";
import { NotesPanel } from "@/components/notes-panel";
import { StatusSelect } from "@/components/status-select";
import { AddToRadarButton } from "@/components/add-to-radar-button";
import { FetchSignalsButton } from "./signals-button";
import { OutreachButton } from "./outreach-button";

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
        <div className="flex items-center gap-2">
          <AddToRadarButton orgSlug={org.slug} companyId={company.id} inRadar={Boolean(orgCompanyRes.data)} />
          <CompanyActions
            orgSlug={org.slug}
            companyId={company.id}
            needsEnrich={!isEnriched}
            needsBrief={!company.ai_brief}
          />
        </div>
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
                <Row label="Revenue" value={formatRevenue(company.organization_revenue, company.organization_revenue_printed)} />
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
                  Esta empresa solo tiene los datos básicos de Apollo Search (razón social, dominio, LinkedIn, year fundada, revenue,
                  growth de headcount). Al hacer <span className="font-medium">Enrich</span> traemos del endpoint <code>/organizations/enrich</code> de Apollo:
                  sector + sub-sector, headcount range, ubicación (ciudad/provincia/país), tech stack detectado, intent topics activos
                  y descripción de la empresa. <span className="font-medium">Costo: 1 crédito Apollo por empresa.</span>
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
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  Eventos detectados (Google News + BO Nacional). El scraper diario las actualiza solo, o tocá <span className="text-foreground">Buscar signals</span> para refrescar al toque.
                </p>
                <FetchSignalsButton orgSlug={org.slug} companyId={company.id} />
              </div>
              {signalsRes.data && signalsRes.data.length > 0 ? (
                <div className="divide-y -mx-4">
                  {signalsRes.data.map((s) => {
                    const cat = s.data?.category || s.type;
                    const variantMap: Record<string, "success" | "info" | "warning" | "secondary"> = {
                      funding_round: "success",
                      c_level_hire: "success",
                      expansion_or_launch: "info",
                      partnership: "info",
                      press_mention: "secondary",
                      bo_act: "warning",
                    };
                    return (
                      <div key={s.id} className="p-4 flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={variantMap[cat] || "secondary"}>{cat}</Badge>
                            <span className="text-xs text-muted-foreground">{s.source} · {formatDate(s.occurred_at)}</span>
                          </div>
                          {s.data?.title && (
                            s.data?.url ? (
                              <a href={s.data.url} target="_blank" rel="noopener" className="text-sm font-medium hover:underline block">
                                {s.data.title}
                              </a>
                            ) : (
                              <div className="text-sm font-medium">{s.data.title}</div>
                            )
                          )}
                          {s.data?.summary && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{s.data.summary}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="shrink-0" title="Intent weight contribuido al scoring">
                          +{Math.round(Number(s.intent_weight))}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground space-y-2">
                  <p>Esta empresa no tiene signals todavía.</p>
                  <p className="text-xs">Si Google News tiene noticias recientes sobre <span className="font-medium">{company.razon_social}</span>, las traemos al toque.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <CardContent className="p-0">
              {contactsRes.data && contactsRes.data.length > 0 ? (
                <div className="divide-y">
                  {[...contactsRes.data]
                    .sort((a: any, b: any) => Number(b.is_decision_maker) - Number(a.is_decision_maker))
                    .map((c: any) => (
                      <div key={c.id} className="p-4 flex justify-between items-start gap-4">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-medium text-sm">{c.full_name}</div>
                            {c.is_decision_maker && <Badge variant="success">decision maker</Badge>}
                            {c.linkedin_url && (
                              <a href={c.linkedin_url} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground">
                                <Linkedin className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{c.title || "—"}</div>
                          {c.email ? (
                            <div className="flex items-center gap-2 text-xs">
                              <Mail className="h-3 w-3" />
                              <a href={`mailto:${c.email}`} className="hover:underline font-mono">{c.email}</a>
                              {c.email_status === "verified" && (
                                <Badge variant="success" className="gap-1 text-[10px]">
                                  <ShieldCheck className="h-2.5 w-2.5" /> verified
                                </Badge>
                              )}
                              {c.email_status && c.email_status !== "verified" && (
                                <Badge variant="secondary" className="gap-1 text-[10px]">
                                  <ShieldQuestion className="h-2.5 w-2.5" /> {c.email_status}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic">email no revealed</div>
                          )}
                          {c.phone && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {c.phone}
                            </div>
                          )}
                          {c.email && (
                            <div className="pt-2">
                              <OutreachButton orgSlug={org.slug} companyId={company.id} contactId={c.id} toEmail={c.email} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground space-y-2">
                  <p>Sin contactos todavía.</p>
                  <p className="text-xs">Tocá <span className="font-medium">"Buscar contactos"</span> arriba para traer hasta 5 decision makers de Apollo (CEO/CTO/Founder/Director). Cuesta 1 crédito por persona con email revealed.</p>
                </div>
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
                Esta empresa no está en el radar de tu org todavía. Tocá <span className="font-medium">+ Radar</span> arriba para
                empezar a trackearla — ahí podés agregarle notas, asignar responsable y cambiar status.
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
