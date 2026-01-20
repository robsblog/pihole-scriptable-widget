// Pi-hole Widget (Scriptable) – v6 API (X-FTL-SID), Keychain password, multi-size UI, cache fallback
// Features:
// - Password stored in Keychain (prompt on first run; reset option)
// - Small/Medium/Large widget layouts (auto by widget family)
// - Status badge: OK / Auffällig / Fehler (color-coded)
// - Live vs Cache shown in footer + last-updated timestamp
// - Interactive menu when run in app: Refresh, Change Password, Clear Cache, Language
// - Auto language (DE for German systems / DACH region), English fallback; manual override supported

// ---------------- CONFIG ----------------
// Prefer IP to avoid DNS issues on iOS
const PIHOLE_BASE = "http://YOUR_LOCAL_PIHOLE_IP"; // e.g. "http://192.168.178.10"
const STATS_ENDPOINT = "/api/stats/summary";

const REFRESH_HOURS = .5;
const TIMEOUT_LOGIN = 10;
const TIMEOUT_STATS = 10;

// Status thresholds (tune to your environment)
const STALE_WARN_MINUTES = 20;      // if API down, cache younger than this -> "Auffällig"
const STALE_ERROR_MINUTES = 120;    // if API down, cache older than this -> "Fehler"
const WARN_CLIENTS_MAX = 1;         // <= 1 client -> "Auffällig" (often DNS bypass / only router)
const WARN_MIN_QUERY_DELTA = 10;    // if queries barely increase since last cache -> "Auffällig"
const WARN_QUERY_DELTA_WINDOW_MIN = 30; // only evaluate delta if previous sample is within this window
// ----------------------------------------

// Storage keys
const KEYCHAIN_PASSWORD_KEY = "pihole_admin_password_v1";
const CACHE_KEY = "pihole_widget_cache_v6_enhanced_v1";
const KEYCHAIN_LANG_KEY = "pihole_widget_lang_v1"; // "auto" | "de" | "en"

// ---------------- i18n ----------------
const I18N = {
  de: {
    // generic
    ok: "OK",
    cancel: "Abbrechen",

    // language
    lang_auto: "Automatisch",
    lang_de: "Deutsch",
    lang_en: "Englisch",
    choose_language_title: "Sprache",
    choose_language_msg: "Welche Sprache soll das Widget nutzen?",
    language_set_to: "Sprache gesetzt: {{lang}}",

    // password prompt
    pw_title: "Pi-hole Passwort speichern",
    pw_msg: "Gib dein Pi-hole Admin-Passwort ein. Es wird lokal in der iOS-Keychain gespeichert.",
    pw_field: "Passwort",
    pw_save: "Speichern",
    pw_cancelled: "Passwort-Eingabe abgebrochen.",
    pw_empty: "Leeres Passwort eingegeben.",

    // menu
    menu_title: "Pi-hole Widget",
    menu_msg: "Aktion auswählen",
    menu_refresh: "Aktualisieren (API abrufen)",
    menu_pw_change: "Passwort ändern (Keychain)",
    menu_cache_clear: "Cache löschen",
    menu_language: "Sprache ändern",
    menu_abort: "Abbrechen",

    // errors
    err_pihole_unreachable_title: "Pi-hole nicht erreichbar",
    err_pihole_unreachable_msg:
      "Es werden die letzten bekannten Werte angezeigt.\n\nFehler: {{err}}",

    // widget labels
    title: "Pi-hole",
    live: "Live",
    cache: "Cache",
    status_age: "Stand: {{age}}",
    footer: "{{mode}} • letztes Update {{time}} • {{age}}",

    // status badge
    status_ok: "OK",
    status_warning: "Auffällig",
    status_error: "Fehler",

    // optional: status reasons (kept short)
    status_reason_cache: "Cache-Werte",
    status_reason_clients: "nur {{n}} Client",
    status_reason_queries: "kaum neue Queries",
    status_reason_offline: "API nicht erreichbar",

    // metrics
    blocking_rate: "Blockrate",
    total_queries: "Gesamtanfragen",
    queries_blocked: "Blockierte Anfragen",
    domains_on_list: "Domains auf der Blockliste",
    forwarded: "Weitergeleitet",
    cached: "Gecacht",
    clients: "Clients",
    unique_domains: "Eindeutige Domains",

    // small widget labels
    small_blocked: "Blockiert: {{n}}",
    small_total: "Gesamt: {{n}}",

    // time / age strings
    no_timestamp: "kein Zeitstempel",
    unknown: "unbekannt",
    just_now: "gerade eben",
    minutes_ago: "vor {{n}} Min",
    hours_ago: "vor {{n}} Std",
    days_ago: "vor {{n}} Tg"
  },

  en: {
    ok: "OK",
    cancel: "Cancel",

    lang_auto: "Automatic",
    lang_de: "German",
    lang_en: "English",
    choose_language_title: "Language",
    choose_language_msg: "Which language should the widget use?",
    language_set_to: "Language set to: {{lang}}",

    pw_title: "Save Pi-hole password",
    pw_msg: "Enter your Pi-hole admin password. It will be stored locally in the iOS Keychain.",
    pw_field: "Password",
    pw_save: "Save",
    pw_cancelled: "Password entry cancelled.",
    pw_empty: "Empty password entered.",

    menu_title: "Pi-hole Widget",
    menu_msg: "Choose an action",
    menu_refresh: "Refresh (fetch API)",
    menu_pw_change: "Change password (Keychain)",
    menu_cache_clear: "Clear cache",
    menu_language: "Change language",
    menu_abort: "Cancel",

    err_pihole_unreachable_title: "Pi-hole unreachable",
    err_pihole_unreachable_msg: "Showing last known values.\n\nError: {{err}}",

    title: "Pi-hole",
    live: "Live",
    cache: "Cache",
    status_age: "Updated: {{age}}",
    footer: "{{mode}} • last update {{time}} • {{age}}",

    // status badge
    status_ok: "OK",
    status_warning: "Suspicious",
    status_error: "Error",

    status_reason_cache: "cached values",
    status_reason_clients: "only {{n}} client",
    status_reason_queries: "low query activity",
    status_reason_offline: "API unreachable",

    blocking_rate: "Blocking rate",
    total_queries: "Total queries",
    queries_blocked: "Queries blocked",
    domains_on_list: "Domains on list",
    forwarded: "Forwarded",
    cached: "Cached",
    clients: "Clients",
    unique_domains: "Unique domains",

    small_blocked: "Blocked: {{n}}",
    small_total: "Total: {{n}}",

    no_timestamp: "no timestamp",
    unknown: "unknown",
    just_now: "just now",
    minutes_ago: "{{n}} min ago",
    hours_ago: "{{n}}h ago",
    days_ago: "{{n}}d ago",
  }
};

function tmpl(s, vars = {}) {
  return String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ""));
}

function getStoredLang() {
  try {
    if (Keychain.contains(KEYCHAIN_LANG_KEY)) return Keychain.get(KEYCHAIN_LANG_KEY);
  } catch (_) {}
  return null;
}

function setStoredLang(val) {
  try { Keychain.set(KEYCHAIN_LANG_KEY, val); } catch (_) {}
}

function detectLangAuto() {
  let loc = "";
  let lang = "";
  try { loc = (Device.locale?.() ?? "") + ""; } catch (_) {}
  try { lang = (Device.language?.() ?? "") + ""; } catch (_) {}

  loc = loc.replace("-", "_");
  const locLower = loc.toLowerCase();
  const langLower = lang.toLowerCase();

  if (langLower === "de" || locLower.startsWith("de_")) return "de";

  const region = (loc.split("_")[1] || "").toUpperCase();
  if (["DE", "AT", "CH", "LI"].includes(region)) return "de";

  return "en";
}

function getLang() {
  const stored = (getStoredLang() || "auto").toLowerCase();
  if (stored === "de" || stored === "en") return stored;
  return detectLangAuto();
}

let LANG = getLang();
let T = I18N[LANG] || I18N.en;

function t(key, vars) {
  const s = T[key] ?? (I18N.en[key] ?? key);
  return tmpl(s, vars);
}

function numberLocale() {
  return LANG === "de" ? "de-DE" : "en-US";
}
function dateFormatterLocale() {
  return LANG === "de" ? "de_DE" : "en_US";
}

// ---------------- Utilities ----------------
function fmtInt(n) {
  return new Intl.NumberFormat(numberLocale()).format(Number(n) || 0);
}

function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "–";
  const num = new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  return `${num} %`;
}

function minutesSince(iso) {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.round((Date.now() - ts) / 60000);
}

function ageText(iso) {
  if (!iso) return t("no_timestamp");
  const diffMin = minutesSince(iso);
  if (diffMin === null) return t("unknown");

  if (diffMin < 1) return t("just_now");
  if (diffMin < 60) return t("minutes_ago", { n: diffMin });

  const diffH = Math.round(diffMin / 60);
  if (diffH < 48) return t("hours_ago", { n: diffH });

  return t("days_ago", { n: Math.round(diffH / 24) });
}

function formatTime(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  const df = new DateFormatter();
  df.locale = dateFormatterLocale();
  df.dateFormat = "HH:mm";
  return df.string(d);
}

function loadCache() {
  try {
    if (!Keychain.contains(CACHE_KEY)) return null;
    return JSON.parse(Keychain.get(CACHE_KEY));
  } catch (_) {
    return null;
  }
}

function saveCache(obj) {
  try { Keychain.set(CACHE_KEY, JSON.stringify(obj)); } catch (_) {}
}

function clearCache() {
  try { if (Keychain.contains(CACHE_KEY)) Keychain.remove(CACHE_KEY); } catch (_) {}
}

async function request({ url, method = "GET", headers = {}, bodyObj = null, timeoutSeconds = 10 }) {
  const req = new Request(url);
  req.method = method;
  req.timeoutInterval = timeoutSeconds;
  req.headers = { Accept: "application/json", ...headers };

  if (bodyObj !== null) {
    req.headers["Content-Type"] = "application/json";
    req.body = JSON.stringify(bodyObj);
  }

  const text = await req.loadString();
  const status = req.response?.statusCode ?? 0;

  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}

  return { status, text, json };
}

// ---------------- Keychain password handling ----------------
async function getOrAskPassword() {
  if (Keychain.contains(KEYCHAIN_PASSWORD_KEY)) {
    return Keychain.get(KEYCHAIN_PASSWORD_KEY);
  }

  const a = new Alert();
  a.title = t("pw_title");
  a.message = t("pw_msg");
  a.addSecureTextField(t("pw_field"));
  a.addAction(t("pw_save"));
  a.addCancelAction(t("cancel"));

  const idx = await a.present();
  if (idx === -1) throw new Error(t("pw_cancelled"));

  const pw = a.textFieldValue(0);
  if (!pw || !pw.trim()) throw new Error(t("pw_empty"));

  Keychain.set(KEYCHAIN_PASSWORD_KEY, pw);
  return pw;
}

function resetPassword() {
  try {
    if (Keychain.contains(KEYCHAIN_PASSWORD_KEY)) Keychain.remove(KEYCHAIN_PASSWORD_KEY);
  } catch (_) {}
}

// ---------------- Language chooser ----------------
async function chooseLanguage() {
  const a = new Alert();
  a.title = t("choose_language_title");
  a.message = t("choose_language_msg");
  a.addAction(t("lang_auto")); // 0
  a.addAction(t("lang_de"));   // 1
  a.addAction(t("lang_en"));   // 2
  a.addCancelAction(t("cancel"));

  const idx = await a.present();
  if (idx === -1) return;

  const choice = idx === 1 ? "de" : idx === 2 ? "en" : "auto";
  setStoredLang(choice);

  LANG = getLang();
  T = I18N[LANG] || I18N.en;

  const b = new Alert();
  b.title = t("choose_language_title");
  b.message = t("language_set_to", { lang: choice.toUpperCase() });
  b.addAction(t("ok"));
  await b.present();
}

// ---------------- Pi-hole v6 API ----------------
async function loginGetSid(password) {
  const r = await request({
    url: `${PIHOLE_BASE}/api/auth`,
    method: "POST",
    bodyObj: { password },
    timeoutSeconds: TIMEOUT_LOGIN
  });

  if (!(r.status >= 200 && r.status < 300)) {
    throw new Error(`Login failed HTTP ${r.status}: ${(r.text || "").slice(0, 200)}`);
  }

  const sid = r.json?.session?.sid;
  if (!sid) throw new Error("No SID in login response JSON.");
  return sid;
}

async function fetchStatsWithSid(sid) {
  const url = `${PIHOLE_BASE}${STATS_ENDPOINT}`;

  const r = await request({
    url,
    headers: { "X-FTL-SID": sid },
    timeoutSeconds: TIMEOUT_STATS
  });

  if (!(r.status >= 200 && r.status < 300) || !r.json) {
    throw new Error(`Stats failed HTTP ${r.status}: ${(r.text || "").slice(0, 200)}`);
  }

  return r.json;
}

function mapToWidgetFields(statsJson) {
  const q = statsJson?.queries ?? {};
  const c = statsJson?.clients ?? {};
  const g = statsJson?.gravity ?? {};

  return {
    fetchedAt: new Date().toISOString(),

    totalQueries: Number(q.total ?? 0),
    queriesBlocked: Number(q.blocked ?? 0),
    percentageBlocked: Number(q.percent_blocked ?? 0),
    domainsOnList: Number(g.domains_being_blocked ?? 0),

    forwarded: Number(q.forwarded ?? 0),
    cached: Number(q.cached ?? 0),
    uniqueDomains: Number(q.unique_domains ?? 0),
    clientsTotal: Number(c.total ?? 0),
  };
}

// ---------------- Status evaluation ----------------
function statusColor(status) {
  if (status === "ok") return Color.green();
  if (status === "warning") return Color.orange();
  return Color.red();
}

function statusLabel(status) {
  if (status === "ok") return t("status_ok");
  if (status === "warning") return t("status_warning");
  return t("status_error");
}

// Returns { level: "ok"|"warning"|"error", reasonKey: string|null, reasonVars: object }
function evaluateStatus(summary, isLive, cachedPrev) {
  // If API is down, base status on cache age
  if (!isLive) {
    const ageMin = minutesSince(summary?.fetchedAt);
    if (ageMin === null) return { level: "error", reasonKey: "status_reason_offline", reasonVars: {} };

    if (ageMin >= STALE_ERROR_MINUTES) return { level: "error", reasonKey: "status_reason_offline", reasonVars: {} };
    if (ageMin >= STALE_WARN_MINUTES) return { level: "warning", reasonKey: "status_reason_cache", reasonVars: {} };

    // Cache is still fairly fresh, but it's still not live data
    return { level: "warning", reasonKey: "status_reason_cache", reasonVars: {} };
  }

  // Live data: sanity checks
  if ((summary?.totalQueries ?? 0) <= 0) {
    return { level: "error", reasonKey: "status_reason_queries", reasonVars: {} };
  }

  // Common bypass symptom: only one active client (often the router)
  if ((summary?.clientsTotal ?? 0) <= WARN_CLIENTS_MAX) {
    return { level: "warning", reasonKey: "status_reason_clients", reasonVars: { n: String(summary?.clientsTotal ?? 0) } };
  }

  // Optional: compare to previous cached sample to detect "no activity"
  // Only evaluate low activity if multiple clients are active
  if (
    summary?.clientsTotal >= 2 &&
    cachedPrev?.fetchedAt &&
    Number.isFinite(Number(cachedPrev?.totalQueries))
  ) {
    const prevAgeMin = minutesSince(cachedPrev.fetchedAt);
    if (prevAgeMin !== null && prevAgeMin > 0 && prevAgeMin <= WARN_QUERY_DELTA_WINDOW_MIN) {
      const delta = (summary.totalQueries ?? 0) - (cachedPrev.totalQueries ?? 0);
      if (delta >= 0 && delta < WARN_MIN_QUERY_DELTA) {
        return { level: "warning", reasonKey: "status_reason_queries", reasonVars: {} };
      }
    }
  }


  // Another soft signal: blockrate 0 can be normal, but often indicates bypass or upstream changes
  if ((summary?.percentageBlocked ?? 0) === 0) {
    return { level: "warning", reasonKey: "status_reason_queries", reasonVars: {} };
  }

  return { level: "ok", reasonKey: null, reasonVars: {} };
}

// ---------------- Widget UI ----------------
function addFooter(w, isLive, fetchedAt) {
  w.addSpacer(5);
  const mode = isLive ? t("live") : t("cache");
  const foot = w.addText(
    t("footer", { mode, time: formatTime(fetchedAt), age: ageText(fetchedAt) })
  );
  foot.font = Font.systemFont(10);
  foot.textOpacity = 0.6;
}

function addHeader(w, statusObj, isLive, fetchedAt) {
  const head = w.addStack();
  head.layoutHorizontally();

  const title = head.addText(t("title"));
  title.font = Font.boldSystemFont(16);

  head.addSpacer();

  // --- Status badge with background pill for better contrast ---
  const badgeStack = head.addStack();
  badgeStack.backgroundColor = new Color("#000000", 0.80); // dark pill with slight transparency
  badgeStack.cornerRadius = 8;
  badgeStack.setPadding(2, 8, 2, 8); // top, left, bottom, right

  const badge = badgeStack.addText(statusLabel(statusObj.level));
  badge.font = Font.semiboldSystemFont(12);
  badge.textColor = statusColor(statusObj.level);
  // ------------------------------------------------------------


  w.addSpacer(6);

  // Secondary line: age (+ optional short reason)
  const age = t("status_age", { age: ageText(fetchedAt) });
  let reason = "";
  if (statusObj.reasonKey) {
    reason = ` • ${t(statusObj.reasonKey, statusObj.reasonVars || {})}`;
  } else if (!isLive) {
    reason = ` • ${t("status_reason_cache")}`;
  }

  const sub = w.addText(`${age}${reason}`);
  sub.font = Font.systemFont(10);
  sub.textOpacity = 0.7;

  w.addSpacer(10);
}

function buildSmall(w, s) {
  const big = w.addText(fmtPct(s.percentageBlocked));
  big.font = Font.boldSystemFont(22);

  w.addSpacer(8);

  const b = w.addText(t("small_blocked", { n: fmtInt(s.queriesBlocked) }));
  b.font = Font.systemFont(12);

  const tt = w.addText(t("small_total", { n: fmtInt(s.totalQueries) }));
  tt.font = Font.systemFont(12);
}

function buildMedium(w, s) {
  const pct = w.addText(fmtPct(s.percentageBlocked));
  pct.font = Font.boldSystemFont(26);

  w.addSpacer(6);

  const row = w.addStack();
  row.layoutHorizontally();

  const colW = 150;

  const colL = row.addStack();
  colL.layoutVertically();
  colL.size = new Size(colW, 0);

  const colR = row.addStack();
  colR.layoutVertically();
  colR.size = new Size(colW, 0);

  const l1 = colL.addText(t("total_queries"));
  l1.font = Font.systemFont(12);
  l1.textOpacity = 0.8;

  const v1 = colL.addText(fmtInt(s.totalQueries));
  v1.font = Font.semiboldSystemFont(16);

  const l2 = colR.addText(t("queries_blocked"));
  l2.font = Font.systemFont(12);
  l2.textOpacity = 0.8;

  const v2 = colR.addText(fmtInt(s.queriesBlocked));
  v2.font = Font.semiboldSystemFont(16);

  w.addSpacer(6);

  const meta = w.addText(`${t("domains_on_list")}: ${fmtInt(s.domainsOnList)}`);
  meta.font = Font.systemFont(11);
  meta.textOpacity = 0.6;
}

function buildLarge(w, s) {
  const pct = w.addText(fmtPct(s.percentageBlocked));
  pct.font = Font.boldSystemFont(28);

  w.addSpacer(2);

  const hint = w.addText(t("blocking_rate"));
  hint.font = Font.systemFont(10);
  hint.textOpacity = 0.35;

  w.addSpacer(16);

  const colW = 160;

  const row1 = w.addStack();
  row1.layoutHorizontally();

  const a = row1.addStack(); a.layoutVertically(); a.size = new Size(colW, 0);
  const b = row1.addStack(); b.layoutVertically(); b.size = new Size(colW, 0);

  a.addText(t("total_queries")).font = Font.systemFont(12);
  a.addText(fmtInt(s.totalQueries)).font = Font.semiboldSystemFont(16);

  b.addText(t("queries_blocked")).font = Font.systemFont(12);
  b.addText(fmtInt(s.queriesBlocked)).font = Font.semiboldSystemFont(16);

  w.addSpacer(10);

  const row2 = w.addStack();
  row2.layoutHorizontally();

  const c = row2.addStack(); c.layoutVertically(); c.size = new Size(colW, 0);
  const d = row2.addStack(); d.layoutVertically(); d.size = new Size(colW, 0);

  c.addText(t("forwarded")).font = Font.systemFont(12);
  c.addText(fmtInt(s.forwarded)).font = Font.semiboldSystemFont(16);

  d.addText(t("cached")).font = Font.systemFont(12);
  d.addText(fmtInt(s.cached)).font = Font.semiboldSystemFont(16);

  w.addSpacer(10);

  const row3 = w.addStack();
  row3.layoutHorizontally();

  const e = row3.addStack(); e.layoutVertically(); e.size = new Size(colW, 0);
  const f = row3.addStack(); f.layoutVertically(); f.size = new Size(colW, 0);

  e.addText(t("clients")).font = Font.systemFont(12);
  e.addText(fmtInt(s.clientsTotal)).font = Font.semiboldSystemFont(16);

  f.addText(t("unique_domains")).font = Font.systemFont(12);
  f.addText(fmtInt(s.uniqueDomains)).font = Font.semiboldSystemFont(16);

  w.addSpacer(10);

  const meta = w.addText(`${t("domains_on_list")}: ${fmtInt(s.domainsOnList)}`);
  meta.font = Font.systemFont(11);
  meta.textOpacity = 0.6;
}

function buildWidget(summary, statusObj, isLive, forcedFamily = null) {
  const w = new ListWidget();

  addHeader(w, statusObj, isLive, summary.fetchedAt);

  const family = forcedFamily ?? config.widgetFamily;
  if (family === "small") buildSmall(w, summary);
  else if (family === "large") buildLarge(w, summary);
  else buildMedium(w, summary);

  addFooter(w, isLive, summary.fetchedAt);

  w.refreshAfterDate = new Date(Date.now() + REFRESH_HOURS * 3600 * 1000);

  const scriptName = encodeURIComponent(Script.name());
  w.url = `scriptable:///run?scriptName=${scriptName}&action=refresh`;

  return w;
}

// ---------------- In-app menu ----------------
async function presentMenuAndReturnAction() {
  const a = new Alert();
  a.title = t("menu_title");
  a.message = t("menu_msg");
  a.addAction(t("menu_refresh"));     // 0
  a.addAction(t("menu_pw_change"));   // 1
  a.addAction(t("menu_cache_clear")); // 2
  a.addAction(t("menu_language"));    // 3
  a.addCancelAction(t("menu_abort"));
  const idx = await a.present();
  return idx; // 0 refresh, 1 reset pw, 2 clear cache, 3 language, -1 cancel
}

// ---------------- Main ----------------
(async () => {
  const actionParam = args.queryParameters?.action ?? null;
  const isTapRefresh = actionParam === "refresh";

  // When launched by tapping the widget (action=refresh), skip menu and refresh immediately.
  // Otherwise show the admin menu when running in the app.
  if (!config.runsInWidget && !isTapRefresh) {
    const action = await presentMenuAndReturnAction();
    if (action === 1) {
      resetPassword();
      await getOrAskPassword();
    } else if (action === 2) {
      clearCache();
    } else if (action === 3) {
      await chooseLanguage();
    } else if (action === -1) {
      // show preview anyway with whatever cache exists
    }
  }

  const cached = loadCache();

  let summary = null;
  let isLive = false;

  try {
    const password = await getOrAskPassword();
    const sid = await loginGetSid(password);
    const statsJson = await fetchStatsWithSid(sid);

    summary = mapToWidgetFields(statsJson);
    saveCache(summary);
    isLive = true;
  } catch (e) {
    summary = cached;
    isLive = false;

    if (!summary) {
      summary = {
        fetchedAt: null,
        totalQueries: 0,
        queriesBlocked: 0,
        percentageBlocked: 0,
        domainsOnList: 0,
        forwarded: 0,
        cached: 0,
        uniqueDomains: 0,
        clientsTotal: 0,
      };
    }

    if (!config.runsInWidget) {
      const a = new Alert();
      a.title = t("err_pihole_unreachable_title");
      a.message = t("err_pihole_unreachable_msg", { err: String(e) });
      a.addAction(t("ok"));
      await a.present();
    }
  }

  // Evaluate status (use previous cached sample to detect low activity)
  const statusObj = evaluateStatus(summary, isLive, cached);

  let widget;
  if (config.runsInWidget) {
    widget = buildWidget(summary, statusObj, isLive);
    Script.setWidget(widget);
  } else {
    widget = buildWidget(summary, statusObj, isLive, "large");
    await widget.presentLarge();
  }

  Script.complete();
})();