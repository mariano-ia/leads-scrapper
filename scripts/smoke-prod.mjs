#!/usr/bin/env node
// Crawl autenticado de producción. Genera magic link admin, lo "consume"
// para extraer tokens, settea cookies y golpea rutas críticas reportando
// status + tamaño + flags de error visibles en el HTML.

import ws from "ws";
globalThis.WebSocket = ws;
const { createClient } = await import("@supabase/supabase-js");
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SUPER_EMAIL = env.SUPER_ADMIN_EMAIL || "marianonoceti@gmail.com";
const BASE = process.env.BASE_URL || "https://leads-scrapper-beige.vercel.app";

console.log(`[smoke] base=${BASE} super_admin=${SUPER_EMAIL}`);

const admin = createClient(SUPA_URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { params: { eventsPerSecond: 0 } },
  global: { fetch },
});
// Force-disable realtime websocket to avoid Node 20 WS dependency
admin.realtime.disconnect();

// Generar magiclink para super admin
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: SUPER_EMAIL,
  options: { redirectTo: `${BASE}/` },
});
if (linkErr) {
  console.error("[smoke] generateLink error:", linkErr.message);
  process.exit(1);
}
console.log(`[smoke] magic link generated`);

// Para evadir la pantalla del confirm, hacemos signInWithOtp -> verifyOtp local
// usando token_hash.
const tokenHash = linkData.properties?.hashed_token;
const otpType = linkData.properties?.verification_type || "magiclink";
if (!tokenHash) {
  console.error("[smoke] no token_hash en magic link", linkData.properties);
  process.exit(1);
}

// Usar la API anon con verifyOtp para obtener access_token + refresh_token
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const anonClient = createClient(SUPA_URL, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch },
});
anonClient.realtime.disconnect();
const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
  type: otpType,
  token_hash: tokenHash,
});
if (verifyErr) {
  console.error("[smoke] verifyOtp error:", verifyErr.message);
  process.exit(1);
}
const access = verifyData.session?.access_token;
const refresh = verifyData.session?.refresh_token;
if (!access || !refresh) {
  console.error("[smoke] no session tokens", verifyData);
  process.exit(1);
}
console.log("[smoke] tokens obtenidos, simulando session cookie SSR");

// El nombre de la cookie que setea @supabase/ssr es sb-<project-ref>-auth-token
const ref = SUPA_URL.replace("https://", "").split(".")[0];
const cookieName = `sb-${ref}-auth-token`;
// @supabase/ssr persiste el objeto session JSON base64-encoded con prefijo "base64-"
const sessionObj = {
  access_token: access,
  refresh_token: refresh,
  expires_in: verifyData.session.expires_in,
  expires_at: verifyData.session.expires_at,
  token_type: "bearer",
  user: verifyData.user,
};
const sessionStr = JSON.stringify(sessionObj);
const sessionB64 = "base64-" + Buffer.from(sessionStr).toString("base64");
// La cookie puede estar chunkeada; con un solo chunk es .0
const cookieHeader = `${cookieName}=${sessionB64}`;

// Crawler
const ROUTES = [
  "/",
  "/select-org",
  "/yacare/dashboard",
  "/yacare/companies",
  "/yacare/radar",
  "/yacare/searches",
  "/yacare/searches/new",
  "/yacare/alerts",
  "/yacare/members",
  "/yacare/universe",
  "/yacare/settings",
  "/admin/orgs",
  "/admin/universe",
  "/admin/usage",
];

let failures = 0;
for (const path of ROUTES) {
  const url = `${BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      redirect: "manual",
      headers: { cookie: cookieHeader },
    });
  } catch (e) {
    console.log(`FETCH-ERR ${path}: ${e.message}`);
    failures++;
    continue;
  }
  let body = "";
  try {
    body = await res.text();
  } catch {}
  const flags = [];
  if (res.status >= 500) flags.push("5XX");
  if (/Application error|client-side exception|Internal Server Error/i.test(body)) flags.push("APP-ERR");
  if (/digest:.*"\d+"|<title>500/i.test(body)) flags.push("NEXT-500");
  // Patterns indicative of soft errors shown to users
  const softPatterns = [
    /No autorizado/i,
    /Error al cargar/i,
    /Error cargando/i,
    /Algo sali[oó] mal/i,
    /No se pudo cargar/i,
    /Failed to fetch/i,
    /relation .* does not exist/i,
    /column .* does not exist/i,
    /permission denied/i,
    /TypeError/i,
    /ReferenceError/i,
    /unhandled/i,
    /Internal error/i,
  ];
  for (const p of softPatterns) {
    if (p.test(body)) flags.push(`SOFT:${p.source.slice(0, 30)}`);
  }
  if (res.status === 307 || res.status === 303) {
    const loc = res.headers.get("location");
    flags.push(`redir→${loc}`);
  }
  const flag = flags.length ? " " + flags.join(" ") : "";
  console.log(`${res.status} ${path} (${body.length}b)${flag}`);
  if (res.status >= 500 || /Application error|Internal Server Error/i.test(body)) failures++;
}

process.exit(failures > 0 ? 2 : 0);
