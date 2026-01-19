// Pi-hole Widget (Scriptable) – v6 API (X-FTL-SID), Keychain password, multi-size UI, cache fallback
// Features:
// - Password stored in Keychain (prompt on first run; reset option)
// - Small/Medium/Large widget layouts (auto by widget family)
// - Shows Live vs Cache + last-updated timestamp
// - Interactive menu when run in app: Refresh, Change Password, Clear Cache
// - Refresh hint every 6 hours

// ---------------- CONFIG ----------------
// Prefer IP to avoid DNS issues on iOS
const PIHOLE_BASE = "YOUR_LOCAL_PIHOLE_IP"; // e.g. "http://192.168.178.10"
const STATS_ENDPOINT = "/api/stats/summary";

const REFRESH_HOURS = 6;
const TIMEOUT_LOGIN = 10;
const TIMEOUT_STATS = 10;

// Storage keys
const KEYCHAIN_PASSWORD_KEY = "pihole_admin_password_v1";
const CACHE_KEY = "pihole_widget_cache_v6_enhanced_v1";
// ----------------------------------------

// ---------------- Utilities ----------------
function fmtInt(n) {
  return new Intl.NumberFormat("de-DE").format(Number(n) || 0);
}

function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "–";
  return `${v.toFixed(1).replace(".", ",")} %`;
}

function ageText(iso) {
  if (!iso) return "kein Zeitstempel";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "unbekannt";
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 48) return `vor ${diffH} Std`;
  return `vor ${Math.round(diffH / 24)} Tg`;
}

function formatTime(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  const df = new DateFormatter();
  df.locale = "de_DE";
  df.dateFormat = "HH:mm";
  return df.string(d);
}

function addFooter(w, isLive, fetchedAt) {
  w.addSpacer(5);

  const foot = w.addText(
    `${isLive ? "Live" : "Cache"} • letztes Update ${formatTime(fetchedAt)} • ${ageText(fetchedAt)}`
  );
  foot.font = Font.systemFont(10);
  foot.textOpacity = 0.6;
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
  a.title = "Pi-hole Passwort speichern";
  a.message = "Gib dein Pi-hole Admin-Passwort ein. Es wird lokal in der iOS-Keychain gespeichert.";
  a.addSecureTextField("Passwort");
  a.addAction("Speichern");
  a.addCancelAction("Abbrechen");

  const idx = await a.present();
  if (idx === -1) throw new Error("Passwort-Eingabe abgebrochen.");

  const pw = a.textFieldValue(0);
  if (!pw || !pw.trim()) throw new Error("Leeres Passwort eingegeben.");

  Keychain.set(KEYCHAIN_PASSWORD_KEY, pw);
  return pw;
}

function resetPassword() {
  try {
    if (Keychain.contains(KEYCHAIN_PASSWORD_KEY)) Keychain.remove(KEYCHAIN_PASSWORD_KEY);
  } catch (_) {}
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

    // Core (wie bisher)
    totalQueries: Number(q.total ?? 0),
    queriesBlocked: Number(q.blocked ?? 0),
    percentageBlocked: Number(q.percent_blocked ?? 0),
    domainsOnList: Number(g.domains_being_blocked ?? 0),

    // Extra for Large
    forwarded: Number(q.forwarded ?? 0),
    cached: Number(q.cached ?? 0),
    uniqueDomains: Number(q.unique_domains ?? 0),
    clientsTotal: Number(c.total ?? 0),
  };
}

// ---------------- Widget UI ----------------
function addHeader(w, isLive, fetchedAt) {
  const head = w.addStack();
  head.layoutHorizontally();

  const title = head.addText("Pi-hole");
  title.font = Font.boldSystemFont(16);

  head.addSpacer();

  const badge = head.addText(isLive ? "Live" : "Cache");
  badge.font = Font.semiboldSystemFont(12);
  badge.textOpacity = isLive ? 1.0 : 0.7;

  w.addSpacer(6);

  const sub = w.addText(`Stand: ${ageText(fetchedAt)}`);
  sub.font = Font.systemFont(10);
  sub.textOpacity = 0.7;

  w.addSpacer(10);
}

function buildSmall(w, s) {
  // % blocked dominant
  const big = w.addText(fmtPct(s.percentageBlocked));
  big.font = Font.boldSystemFont(22);

  w.addSpacer(8);

  const b = w.addText(`Blocked: ${fmtInt(s.queriesBlocked)}`);
  b.font = Font.systemFont(12);

  const t = w.addText(`Total: ${fmtInt(s.totalQueries)}`);
  t.font = Font.systemFont(12);
}

function buildMedium(w, s) {
  // 1) Prominent: % blocked
  const pct = w.addText(fmtPct(s.percentageBlocked));
  pct.font = Font.boldSystemFont(26);

  w.addSpacer(6);

  // 2) Two-column row: Total / Blocked
  const row = w.addStack();
  row.layoutHorizontally();

  const colW = 150;

  const colL = row.addStack();
  colL.layoutVertically();
  colL.size = new Size(colW, 0);

  const colR = row.addStack();
  colR.layoutVertically();
  colR.size = new Size(colW, 0);

  // Left column
  const l1 = colL.addText("Total queries");
  l1.font = Font.systemFont(12);
  l1.textOpacity = 0.8;

  const v1 = colL.addText(fmtInt(s.totalQueries));
  v1.font = Font.semiboldSystemFont(16);

  // Right column
  const l2 = colR.addText("Queries blocked");
  l2.font = Font.systemFont(12);
  l2.textOpacity = 0.8;

  const v2 = colR.addText(fmtInt(s.queriesBlocked));
  v2.font = Font.semiboldSystemFont(16);

  w.addSpacer(6);

  // 3) Meta line: Domains on list (one-line, low emphasis)
  const meta = w.addText(`Domains on list: ${fmtInt(s.domainsOnList)}`);
  meta.font = Font.systemFont(11);
  meta.textOpacity = 0.6;
}

function buildLarge(w, s, isLive) {
  const pct = w.addText(fmtPct(s.percentageBlocked));
  pct.font = Font.boldSystemFont(28);

  // Caption direkt an die % ran (Subline)
  w.addSpacer(2);

  const hint = w.addText("Blocking rate");
  hint.font = Font.systemFont(10);
  hint.textOpacity = 0.35;

  // danach der eigentliche Absatz
  w.addSpacer(16);

  const colW = 160;


  // Row 1: Total / Blocked
  const row1 = w.addStack();
  row1.layoutHorizontally();

  const a = row1.addStack(); a.layoutVertically(); a.size = new Size(colW, 0);
  const b = row1.addStack(); b.layoutVertically(); b.size = new Size(colW, 0);

  a.addText("Total queries").font = Font.systemFont(12);
  a.addText(fmtInt(s.totalQueries)).font = Font.semiboldSystemFont(16);

  b.addText("Queries blocked").font = Font.systemFont(12);
  b.addText(fmtInt(s.queriesBlocked)).font = Font.semiboldSystemFont(16);

  w.addSpacer(10);

  // Row 2: Forwarded / Cached
  const row2 = w.addStack();
  row2.layoutHorizontally();

  const c = row2.addStack(); c.layoutVertically(); c.size = new Size(colW, 0);
  const d = row2.addStack(); d.layoutVertically(); d.size = new Size(colW, 0);

  c.addText("Forwarded").font = Font.systemFont(12);
  c.addText(fmtInt(s.forwarded)).font = Font.semiboldSystemFont(16);

  d.addText("Cached").font = Font.systemFont(12);
  d.addText(fmtInt(s.cached)).font = Font.semiboldSystemFont(16);

  w.addSpacer(10);

  // Row 3: Clients / Unique domains
  const row3 = w.addStack();
  row3.layoutHorizontally();

  const e = row3.addStack(); e.layoutVertically(); e.size = new Size(colW, 0);
  const f = row3.addStack(); f.layoutVertically(); f.size = new Size(colW, 0);

  e.addText("Clients").font = Font.systemFont(12);
  e.addText(fmtInt(s.clientsTotal)).font = Font.semiboldSystemFont(16);

  f.addText("Unique domains").font = Font.systemFont(12);
  f.addText(fmtInt(s.uniqueDomains)).font = Font.semiboldSystemFont(16);

  w.addSpacer(10);

  const meta = w.addText(`Domains on list: ${fmtInt(s.domainsOnList)}`);
  meta.font = Font.systemFont(11);
  meta.textOpacity = 0.6;

  addFooter(w, isLive, s.fetchedAt);
}

function buildWidget(summary, isLive, forcedFamily = null) {
  const w = new ListWidget();

  addHeader(w, isLive, summary.fetchedAt);

  const family = forcedFamily ?? config.widgetFamily;
  if (family === "small") buildSmall(w, summary);
  else if (family === "large") buildLarge(w, summary, isLive);
  else buildMedium(w, summary);

  w.refreshAfterDate = new Date(Date.now() + REFRESH_HOURS * 3600 * 1000);

  // optional: Tap-Behaviour
  const scriptName = encodeURIComponent(Script.name());
  w.url = `scriptable:///run?scriptName=${scriptName}&action=refresh`;

  return w;
}

// ---------------- In-app menu ----------------
async function presentMenuAndReturnAction() {
  const a = new Alert();
  a.title = "Pi-hole Widget";
  a.message = "Aktion auswählen";
  a.addAction("Refresh (API abrufen)");
  a.addAction("Passwort ändern (Keychain)");
  a.addAction("Cache löschen");
  a.addCancelAction("Abbrechen");
  const idx = await a.present();
  return idx; // 0 refresh, 1 reset pw, 2 clear cache, -1 cancel
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
    // Fallback to cache
    summary = cached;
    isLive = false;

    // If no cache exists, show zero state but still render widget
    if (!summary) {
      summary = {
        fetchedAt: null,
        totalQueries: 0,
        queriesBlocked: 0,
        percentageBlocked: 0,
        domainsOnList: 0
      };
    }

    // In app runs: show a helpful error
    if (!config.runsInWidget) {
      const a = new Alert();
      a.title = "Pi-hole nicht erreichbar";
      a.message = `Es werden die letzten bekannten Werte angezeigt.\n\nFehler: ${String(e)}`;
      a.addAction("OK");
      await a.present();
    }
  }

  let widget;

if (config.runsInWidget) {
  // IMPORTANT: Do NOT force a family here. iOS decides the widget size.
  widget = buildWidget(summary, isLive);
  Script.setWidget(widget);
} else {
  // App preview: force Large layout for validation
  widget = buildWidget(summary, isLive, "large");
  await widget.presentLarge();
}

Script.complete();
})();