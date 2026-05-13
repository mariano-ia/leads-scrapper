"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";
const MAX_AGE_DAYS = 90;

const COMMON_AMBIGUOUS_NAMES = new Set([
  "humana","humano","humanos","norte","sur","este","oeste","centro","argentina",
  "buenos aires","plus","global","central","premium","consultora","estudio","grupo",
  "consultores","industria","construcciones","servicios","tecnologia","tecnologias",
  "soluciones","ingenieria",
]);

const SPAM_SOURCES = new Set([
  "American Association of Teachers of Japanese",
]);

function cleanRS(rs: string): string {
  return rs.trim().replace(/\b(s\.?a\.?|srl|s\.?r\.?l\.?|sas|s\.?a\.?s\.?)\b\.?$/i, "").replace(/[.,\s]+$/, "") || rs;
}

function categorize(title: string, summary: string): { category: string; weight: number } {
  const t = `${title} ${summary}`.toLowerCase();
  if (/(ronda|funding|inversi[oó]n|invierte|recauda|capital seed|serie [a-c])/.test(t)) return { category: "funding_round", weight: 40 };
  if (/(contrat[aó]|design[aó]|nombra|incorpora|sumo a|nuevo cto|nuevo ceo|nueva cfo|head of)/.test(t)) return { category: "c_level_hire", weight: 30 };
  if (/(lanza|lanzamiento|nuevo producto|expansi[oó]n|expande|abre|adquiere|adquisici[oó]n)/.test(t)) return { category: "expansion_or_launch", weight: 25 };
  if (/(alianza|partnership|acuerdo|firma con|joint venture)/.test(t)) return { category: "partnership", weight: 20 };
  return { category: "press_mention", weight: 10 };
}

/**
 * Fuerza fetch de signals (Google News) para UNA empresa específica.
 * Útil cuando el usuario está mirando una empresa y quiere refrescar señales.
 * Es gratis — no consume créditos Apollo.
 */
export async function fetchSignalsForCompanyAction(orgSlug: string, companyId: string) {
  const user = await requireAuth();
  await requireOrgMembership(orgSlug, user.id);

  const svc = createSupabaseServiceClient();
  const { data: company } = await svc
    .from("companies")
    .select("id, razon_social, dominio")
    .eq("id", companyId)
    .single();
  if (!company) return { error: "Empresa no encontrada" };

  const rs = company.razon_social as string;
  const rsClean = cleanRS(rs).toLowerCase();
  if (rsClean.length < 4) return { error: "Razón social demasiado corta — Google News produciría solo ruido" };
  if (COMMON_AMBIGUOUS_NAMES.has(rsClean)) {
    return { error: `"${rs}" es un nombre demasiado común — saltearíamos por ruido` };
  }

  // Build query
  const parts = [`intitle:"${cleanRS(rs)}"`];
  if (company.dominio) parts.push(`-site:${company.dominio}`);
  for (const bl of ["linkedin.com/company", "glassdoor.com", "indeed.com", "computrabajo.com"]) {
    parts.push(`-site:${bl}`);
  }
  const query = parts.join(" ");
  const sp = new URLSearchParams({ q: query, hl: "es-419", gl: "AR", ceid: "AR:es-419" });

  try {
    const res = await fetch(`${GOOGLE_NEWS_RSS}?${sp}`, {
      headers: { "User-Agent": "Mozilla/5.0 leads-scrapper/0.1" },
      redirect: "follow",
    });
    if (!res.ok) return { error: `Google News ${res.status}` };
    const xml = await res.text();

    // Parser simple RSS — extraemos <item> blocks via regex
    const items: any[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || "";
      const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || "";
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || "";
      const sourceMatch = block.match(/<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/);
      const source = sourceMatch?.[1]?.trim() || "google_news";
      const descMatch = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
      const summary = (descMatch?.[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      if (!title || !link) continue;
      if (SPAM_SOURCES.has(source)) continue;
      // Defensa: el RS limpio debe aparecer como palabra en el título
      const rsCleanLow = cleanRS(rs).toLowerCase();
      if (!new RegExp(`\\b${rsCleanLow.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(title.toLowerCase())) continue;

      const occurred = pubDate ? new Date(pubDate) : new Date();
      if (isNaN(occurred.getTime()) || occurred < cutoff) continue;

      const { category, weight } = categorize(title, summary);
      items.push({
        title,
        link,
        summary: summary.slice(0, 500),
        source,
        occurred_at: occurred.toISOString(),
        category,
        weight,
      });
      if (items.length >= 5) break;
    }

    if (items.length === 0) {
      return { success: true, inserted: 0, skipped: 0, message: "Google News no devolvió noticias recientes que matcheen el nombre exacto" };
    }

    // Dedup contra signals existentes
    const { data: existingRows } = await svc
      .from("signals")
      .select("data->>url")
      .eq("company_id", companyId)
      .eq("type", "press_mention");
    const existingUrls = new Set((existingRows || []).map((r: any) => r.url));

    let inserted = 0;
    let skipped = 0;
    for (const it of items) {
      if (existingUrls.has(it.link)) { skipped++; continue; }
      const { error } = await svc.from("signals").insert({
        company_id: companyId,
        type: it.category,
        source: it.source,
        occurred_at: it.occurred_at,
        data: { title: it.title, url: it.link, summary: it.summary, category: it.category },
        intent_weight: it.weight,
        decay_half_life_days: 60,
      });
      if (!error) inserted++;
      else skipped++;
    }

    // Rescore this company's radar row in current org si está
    if (inserted > 0) {
      await svc.rpc("rescore_company_in_org", { p_company_id: companyId }).then(
        () => {},
        () => {} // RPC opcional — si no existe, no fallar
      );
    }

    revalidatePath(`/${orgSlug}/companies/${companyId}`);
    revalidatePath(`/${orgSlug}/radar`);
    return { success: true, inserted, skipped, total_fetched: items.length };
  } catch (e: any) {
    return { error: e?.message || "Error desconocido" };
  }
}
