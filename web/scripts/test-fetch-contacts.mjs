// Smoke test del flow de fetchContactsAction sin levantar el server.
// Replica la lógica clave (api_search → people/match → upsert) llamando a las
// APIs reales. NO toca apollo_credit_usage para no inflar el contador.

// Smoke test del flow nuevo de contactos. NO usa supabase-js (requiere ws en
// Node 20). Acepta `apollo_id` directo como arg.

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
if (!APOLLO_API_KEY) { console.error("Falta APOLLO_API_KEY"); process.exit(2); }

const APOLLO_ID = process.argv[2] || "670e8ccaf5545f02d1e7ebb4"; // Humana
const MAX = Number(process.argv[3] || 5);

const GENERIC_PREFIXES = ["info","contacto","contact","hello","hola","admin","soporte","support","ventas","sales","marketing","rrhh","hr","jobs","press","comercial","atencion","no-reply","noreply"];
const isGeneric = (e) => {
  if (!e) return false;
  const local = e.split("@")[0]?.toLowerCase() || "";
  return GENERIC_PREFIXES.some((p) => local === p || local.startsWith(`${p}.`));
};
const titleScore = (t) => {
  if (!t) return 0.3;
  t = t.toLowerCase();
  if (/(ceo|founder|fundador|owner|dueñ|president|chief executive)/.test(t)) return 1.0;
  if (/(cto|cmo|cfo|coo|cio|chief|managing director)/.test(t)) return 0.9;
  if (/(director|head of|vp |vice president|general manager|gerente general)/.test(t)) return 0.8;
  if (/(manager|gerente|lead|jefe)/.test(t)) return 0.5;
  return 0.3;
};
const detectDM = (title, seniority) => {
  if (seniority && ["c_suite","founder","owner","partner","head","vp","director"].includes(String(seniority).toLowerCase())) return true;
  if (!title) return false;
  const t = title.toLowerCase();
  return ["ceo","cto","coo","cfo","cmo","cio","chief","founder","fundador","co-founder","cofounder","owner","dueño","duena","president","presidente","vp ","vice president","director","head of","gerente general","general manager","managing director","partner","socio","socia"].some((kw) => t.includes(kw));
};

console.log(`→ Probando contactos para apollo_id=${APOLLO_ID}`);

const searchRes = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
  method: "POST",
  headers: { "X-Api-Key": APOLLO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ organization_ids: [APOLLO_ID], page: 1, per_page: 25 }),
});
if (!searchRes.ok) { console.error("search err", searchRes.status, await searchRes.text()); process.exit(4); }
const searchData = await searchRes.json();
const all = searchData.people || [];
console.log(`→ Apollo api_search devolvió ${all.length} personas (total_entries=${searchData.total_entries})`);
all.forEach((p) => console.log(`   - ${p.first_name} ${p.last_name_obfuscated || "(?)"} · ${p.title} · has_email=${p.has_email}`));

const ranked = all
  .map((p) => ({ p, score: titleScore(p.title) * (p.has_email ? 1 : 0.2) }))
  .filter((x) => x.score >= 0.5)
  .sort((a, b) => b.score - a.score)
  .slice(0, MAX);
console.log(`→ Top ${ranked.length} candidatos para reveal:`);
ranked.forEach((r) => console.log(`   * ${r.p.first_name} · ${r.p.title} · score=${r.score.toFixed(2)}`));

if (ranked.length === 0) {
  console.log("⚠️  Nadie pasó el filtro decisional. Abortando reveal.");
  process.exit(0);
}

console.log("\n→ Llamando /people/match (reveal_personal_emails=true) por cada uno…");
const results = [];
for (const r of ranked) {
  const mr = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: { "X-Api-Key": APOLLO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id: r.p.id, reveal_personal_emails: true, reveal_phone_number: false }),
  });
  if (!mr.ok) { console.log(`   ✖ ${r.p.first_name}: status ${mr.status}`); continue; }
  const md = await mr.json();
  const m = md.person || {};
  const generic = isGeneric(m.email);
  const isDM = !generic && detectDM(m.title || r.p.title, m.seniority || r.p.seniority);
  console.log(`   ${generic ? "⚠️ " : "✓"} ${m.name || r.p.first_name} · ${m.title || r.p.title}`);
  console.log(`       email: ${m.email || "(sin email)"} · status: ${m.email_status || "-"} · DM: ${isDM} · generic: ${generic}`);
  console.log(`       linkedin: ${m.linkedin_url || "-"}`);
  results.push({ apollo_person_id: r.p.id, name: m.name, email: m.email, title: m.title, generic, isDM, linkedin: m.linkedin_url });
}

console.log(`\n✓ Resumen: ${results.length} revelados, ${results.filter((r) => r.email && !r.generic).length} con email válido, ${results.filter((r) => r.generic).length} genéricos`);
