#!/usr/bin/env node
/**
 * Build Android APK web assets as a native Capacitor shell that talks to the
 * deployed backend API. Use MOBILE_API_BASE to override the backend URL.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'out')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(path.join(ROOT, '.env.local'))
loadEnvFile(path.join(ROOT, '.env'))

const DEFAULT_MOBILE_API_BASE = process.env.MOBILE_API_BASE || 'http://135.125.100.150:8000'
const CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || ''
const CLERK_ASSETS_SOURCE = path.join(ROOT, 'public', 'vendor', 'clerk-js', 'current')

function log(message) {
  console.log(`[mobile:apk] ${message}`)
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

const html = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0a0a0b" />
  <title>Devora</title>
  <script
    defer
    crossorigin="anonymous"
    data-clerk-publishable-key="${CLERK_PUBLISHABLE_KEY}"
    src="/vendor/clerk-js/current/clerk.browser.js"
    type="text/javascript"
  ></script>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0a0b;
      --panel: #111113;
      --line: rgba(255,255,255,.08);
      --muted: #8b93a1;
      --text: #f7f8fb;
      --indigo: #6366f1;
      --green: #34d399;
      --yellow: #facc15;
      --orange: #fb923c;
      --red: #f87171;
      --blue: #60a5fa;
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body, #app { min-height: 100%; margin: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
    }
    button, input { font: inherit; }
    button { border: 0; color: inherit; cursor: pointer; }
    .shell {
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      background: var(--bg);
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .topbar {
      min-height: 58px;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 16px;
      border-bottom: 1px solid var(--line);
      background: rgba(10,10,11,.97);
    }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .brand-mark {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      display: grid;
      place-items: center;
      background: var(--indigo);
      font-size: 12px;
      font-weight: 800;
    }
    .brand-title { font-size: 14px; font-weight: 750; white-space: nowrap; }
    .api-badge {
      max-width: 170px;
      min-height: 28px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 0 10px;
      border: 1px solid var(--line);
      color: #cbd5e1;
      background: rgba(255,255,255,.04);
      font-size: 10px;
      font-weight: 750;
    }
    .dot { width: 7px; height: 7px; border-radius: 999px; background: var(--yellow); box-shadow: 0 0 0 4px rgba(250,204,21,.12); flex: 0 0 auto; }
    .dot.ok { background: var(--green); box-shadow: 0 0 0 4px rgba(52,211,153,.12); }
    .dot.bad { background: var(--red); box-shadow: 0 0 0 4px rgba(248,113,113,.12); }
    .content { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-bottom: 88px; }
    .view { display: none; padding: 16px; }
    .view.active { display: block; }
    .hidden { display: none !important; }
    h1 { margin: 0; font-size: 21px; line-height: 1.15; letter-spacing: 0; }
    .subtitle { margin-top: 4px; color: var(--muted); font-size: 12px; }
    .page-head { margin-bottom: 14px; }
    .tabs { display: flex; gap: 8px; overflow-x: auto; margin: 0 -16px 14px; padding: 0 16px; scrollbar-width: none; }
    .tabs::-webkit-scrollbar { display: none; }
    .pill {
      flex: 0 0 auto;
      min-height: 34px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.05);
      color: #c9ced7;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
    }
    .pill.active { border-color: rgba(99,102,241,.55); color: #c7d2fe; background: rgba(99,102,241,.16); }
    .count { min-width: 20px; height: 20px; padding: 0 6px; display: inline-grid; place-items: center; border-radius: 999px; background: rgba(255,255,255,.08); font-size: 11px; }
    .list { display: flex; flex-direction: column; gap: 10px; }
    .card {
      width: 100%;
      text-align: left;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.045);
      padding: 14px;
      transition: transform .12s ease, background .12s ease;
    }
    .card:active { transform: scale(.985); background: rgba(255,255,255,.07); }
    .row { display: flex; align-items: center; gap: 10px; }
    .between { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .grow { flex: 1; min-width: 0; }
    .title { font-size: 14px; font-weight: 750; line-height: 1.35; overflow-wrap: anywhere; }
    .meta { margin-top: 4px; font-size: 11px; color: var(--muted); overflow-wrap: anywhere; }
    .badge { flex: 0 0 auto; border-radius: 999px; padding: 4px 8px; font-size: 10px; font-weight: 850; text-transform: uppercase; background: rgba(255,255,255,.08); color: #d1d5db; }
    .risk-critical { color: var(--red); background: rgba(248,113,113,.14); }
    .risk-high { color: var(--orange); background: rgba(251,146,60,.14); }
    .risk-medium { color: var(--yellow); background: rgba(250,204,21,.14); }
    .risk-low { color: var(--green); background: rgba(52,211,153,.14); }
    .foot { margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--muted); font-size: 11px; }
    .mini { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .empty, .loading { padding: 54px 16px; text-align: center; color: var(--muted); font-size: 13px; }
    .metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .metric { border-radius: 14px; border: 1px solid var(--line); background: rgba(255,255,255,.045); padding: 14px; min-height: 104px; }
    .metric-label { color: var(--muted); font-size: 11px; font-weight: 750; }
    .metric-value { margin-top: 10px; font-size: 27px; font-weight: 850; line-height: 1; }
    .section-title { margin: 20px 0 10px; color: var(--muted); font-size: 11px; font-weight: 850; text-transform: uppercase; letter-spacing: .08em; }
    .hero { border-radius: 16px; border: 1px solid rgba(99,102,241,.35); background: linear-gradient(135deg, rgba(99,102,241,.20), rgba(14,165,233,.08)); padding: 16px; margin-bottom: 12px; }
    .hero-risk { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .hero-risk strong { font-size: 32px; line-height: 1; }
    .severity-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
    .severity { min-width: 0; border-radius: 12px; border: 1px solid var(--line); background: rgba(255,255,255,.035); padding: 9px 4px; text-align: center; }
    .severity b { display: block; font-size: 18px; }
    .severity span { display: block; margin-top: 4px; font-size: 8px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
    .notice { border-radius: 14px; border: 1px solid rgba(245,158,11,.28); background: rgba(245,158,11,.1); padding: 13px; color: #fcd34d; font-size: 12px; line-height: 1.45; }
    .action { width: 100%; min-height: 48px; border-radius: 14px; background: var(--indigo); color: white; font-weight: 850; }
    .input {
      width: 100%;
      min-height: 48px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.05);
      color: var(--text);
      padding: 0 14px;
      outline: none;
    }
    .input:focus { border-color: rgba(99,102,241,.7); box-shadow: 0 0 0 3px rgba(99,102,241,.12); }
    .login-card {
      margin-top: 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.045);
      padding: 16px;
    }
    .back { width: 36px; height: 36px; border-radius: 12px; background: rgba(255,255,255,.06); display: grid; place-items: center; }
    .nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10;
      padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
      background: rgba(17,17,19,.98);
      border-top: 1px solid var(--line);
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
    }
    .nav button {
      min-width: 0;
      border-radius: 13px;
      min-height: 54px;
      background: transparent;
      color: #767b86;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 750;
    }
    .nav button.active { color: #a5b4fc; background: rgba(99,102,241,.12); }
    .nav .ico { font-size: 18px; line-height: 1; }
    .toast {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 86px;
      z-index: 20;
      border-radius: 14px;
      border: 1px solid rgba(99,102,241,.3);
      background: rgba(24,24,27,.98);
      padding: 12px 14px;
      color: #c7d2fe;
      font-size: 12px;
      transform: translateY(120px);
      opacity: 0;
      transition: .2s ease;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
  </style>
</head>
<body>
  <div id="app" class="shell">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">AI</div><div class="brand-title">Code Review</div></div>
      <button class="api-badge" id="api-badge" data-refresh><span class="dot" id="api-dot"></span><span id="api-text">Backend API</span></button>
    </header>

    <main class="content">
      <section id="view-login" class="view active">
        <div class="page-head">
          <h1>Connexion Clerk</h1>
          <div class="subtitle">Utilisez le meme compte que la plateforme web.</div>
        </div>
        <div class="login-card">
          <div id="clerk-status" class="subtitle">Chargement de Clerk...</div>
          <div id="clerk-sign-in" style="margin-top:12px"></div>
          <div class="notice" style="margin-top:14px">L'APK envoie le JWT Clerk au backend FastAPI sur <span id="login-api-base"></span>. Les roles Developer / Tech Lead viennent de Clerk et du RBAC plateforme.</div>
        </div>
      </section>

      <section id="view-prs" class="view">
        <div class="page-head"><h1>All PRs</h1><div class="subtitle" id="prs-subtitle">Connexion au backend...</div></div>
        <div class="tabs" id="tabs"></div>
        <div class="list" id="prs-list"><div class="loading">Chargement des analyses reelles...</div></div>
      </section>

      <section id="view-analysis" class="view">
        <div class="row" style="margin-bottom:14px">
          <button class="back" data-back>&lt;</button>
          <div class="grow"><div class="title" id="analysis-title"></div><div class="meta" id="analysis-repo"></div></div>
        </div>
        <div id="analysis-body"></div>
      </section>

      <section id="view-notifications" class="view">
        <div class="between page-head">
          <div><h1>Notifications</h1><div class="subtitle" id="notif-subtitle">Depuis le backend</div></div>
          <button class="pill" data-mark-all>Mark all</button>
        </div>
        <div class="list" id="notif-list"><div class="loading">Chargement...</div></div>
      </section>

      <section id="view-health" class="view">
        <div class="page-head"><h1>Platform Health</h1><div class="subtitle">Backend FastAPI</div></div>
        <div id="health-body"><div class="loading">Chargement...</div></div>
      </section>

      <section id="view-dashboard" class="view">
        <div class="page-head"><h1>Dashboard</h1><div class="subtitle" id="dashboard-subtitle">Stats backend</div></div>
        <div class="card" id="account-card" style="margin-bottom:12px"></div>
        <div class="metric-grid" id="dashboard-grid"></div>
        <div class="section-title">Actions rapides</div>
        <div class="list">
          <button class="card" data-nav="prs"><div class="title">Nouvelles analyses</div><div class="meta">PRs en attente de revue</div></button>
          <button class="card" data-nav="notifications"><div class="title">Notifications</div><div class="meta">Alertes et resultats d'analyse</div></button>
          <button class="card" data-nav="health" data-tech-lead><div class="title">Sante plateforme</div><div class="meta">Queue, workers et services</div></button>
          <button class="card" data-sign-out><div class="title">Deconnexion</div><div class="meta">Retirer le token mobile de cet emulateur</div></button>
        </div>
        <div class="notice" style="margin-top:16px">APK natif Capacitor. Les donnees viennent de <span id="api-base-label"></span>.</div>
      </section>
    </main>

    <nav class="nav hidden" id="nav">
      <button class="active" data-nav="prs"><span class="ico">PR</span><span>All PRs</span></button>
      <button data-nav="notifications"><span class="ico">N</span><span>Notifs</span></button>
      <button data-nav="health" data-tech-lead><span class="ico">H</span><span>Sante</span></button>
      <button data-nav="dashboard"><span class="ico">D</span><span>Dashboard</span></button>
    </nav>
    <div class="toast" id="toast"></div>
  </div>

  <script>
    const API_BASE_KEY = 'aiCodeReviewMobileApiBaseUrl';
    const DEFAULT_API_BASE = ${JSON.stringify(DEFAULT_MOBILE_API_BASE)};
    const CLERK_CONFIGURED = ${JSON.stringify(Boolean(CLERK_PUBLISHABLE_KEY))};
    let apiBase = localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE;
    let clerk = null;
    let authSyncInFlight = false;

    const tabs = [
      { key: 'new_attention', label: 'New' },
      { key: 'return', label: 'Return' },
      { key: 'approved', label: 'Approved' },
      { key: 'waiting_reviewer', label: 'Waiting' },
      { key: 'drafts', label: 'Drafts' },
      { key: 'waiting_author', label: 'Action' }
    ];

    const state = {
      activeTab: 'new_attention',
      prs: [],
      counts: {},
      notifications: [],
      health: null,
      stats: null,
      user: null,
      backendOnline: false
    };

    function esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    }

    function apiPath(path) {
      return apiBase.replace(/\/$/, '') + path;
    }

    async function getClerkToken() {
      if (!clerk || !clerk.session) return '';

      // On mobile webviews, Clerk can briefly return null right after sign-in.
      // Force refresh + short retry window before giving up.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const token = await clerk.session.getToken({ skipCache: true });
          if (token) return token;
        } catch (_) {}
        await new Promise(function (resolve) { setTimeout(resolve, 250 * (attempt + 1)); });
      }

      try {
        const fallback = await clerk.session.getToken();
        return fallback || '';
      } catch (_) {
        return '';
      }
    }

    async function apiHeaders(extra) {
      const headers = Object.assign({ Accept: 'application/json' }, extra || {});
      const token = await getClerkToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      return headers;
    }

    async function apiGet(path) {
      const response = await fetch(apiPath(path), { method: 'GET', headers: await apiHeaders() });
      if (response.status === 401) handleAuthRejected();
      if (!response.ok) throw new Error('GET ' + path + ' failed: ' + response.status);
      return response.json();
    }

    async function apiSend(path, method, body) {
      const options = { method: method || 'POST', headers: await apiHeaders() };
      if (body !== undefined) {
        options.headers = await apiHeaders({ 'Content-Type': 'application/json' });
        options.body = JSON.stringify(body);
      }
      const response = await fetch(apiPath(path), options);
      if (response.status === 401) handleAuthRejected();
      if (!response.ok) throw new Error(method + ' ' + path + ' failed: ' + response.status);
      return response.json();
    }

    function setBackendStatus(online, message) {
      state.backendOnline = online;
      const dot = document.getElementById('api-dot');
      const text = document.getElementById('api-text');
      dot.className = 'dot ' + (online ? 'ok' : 'bad');
      text.textContent = online ? 'Backend API' : 'Backend indisponible';
      if (message) showToast(message);
    }

    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 2600);
    }

    function hideNativeSplash() {
      try {
        const splash = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen;
        if (splash && splash.hide) splash.hide();
      } catch (_) {}
    }

    function isTechLead() {
      return state.user && state.user.role === 'tech_lead';
    }

    function handleAuthRejected() {
      state.user = null;
      showLogin('Session mobile expiree. Reconnectez-vous.');
    }

    function applyRoleUi() {
      document.querySelectorAll('[data-tech-lead]').forEach(function (node) {
        node.classList.toggle('hidden', !isTechLead());
      });
      if (state.user) {
        document.getElementById('dashboard-subtitle').textContent = state.user.role === 'tech_lead'
          ? 'Connecte en Tech Lead'
          : 'Connecte en Developer';
      }
    }

    function showLogin(message) {
      hideNativeSplash();
      document.getElementById('nav').classList.add('hidden');
      document.querySelectorAll('.view').forEach(function (view) { view.classList.remove('active'); });
      document.getElementById('view-login').classList.add('active');
      mountClerkSignIn();
      if (message) showToast(message);
    }

    function showAuthenticatedShell() {
      hideNativeSplash();
      document.getElementById('nav').classList.remove('hidden');
      applyRoleUi();
      setView('prs');
      loadPrs();
      loadStats();
    }

    function waitForClerkGlobal() {
      return new Promise(function (resolve, reject) {
        const started = Date.now();
        const timer = setInterval(function () {
          if (window.Clerk) {
            clearInterval(timer);
            resolve(window.Clerk);
            return;
          }
          if (Date.now() - started > 20000) {
            clearInterval(timer);
            reject(new Error('ClerkJS non charge'));
          }
        }, 100);
      });
    }

    function mountClerkSignIn() {
      const root = document.getElementById('clerk-sign-in');
      const status = document.getElementById('clerk-status');
      if (!CLERK_CONFIGURED) {
        status.textContent = 'Configuration Clerk manquante: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.';
        root.innerHTML = '';
        return;
      }
      if (!clerk || !clerk.mountSignIn) {
        status.textContent = 'Chargement de Clerk...';
        return;
      }
      status.textContent = 'Connectez-vous avec Clerk.';
      root.innerHTML = '';
      clerk.mountSignIn(root, {
        routing: 'hash',
        appearance: {
          variables: {
            colorPrimary: '#6366f1',
            colorBackground: '#18181b',
            colorInputBackground: '#27272a',
            colorInputText: '#fafafa',
            colorText: '#fafafa',
            colorTextSecondary: '#a1a1aa',
            borderRadius: '0.75rem'
          },
          elements: {
            footer: { display: 'none' },
            footerAction: { display: 'none' },
            card: { backgroundColor: '#18181b', border: '1px solid #27272a', boxShadow: 'none' },
            formButtonPrimary: { backgroundColor: '#6366f1' }
          }
        }
      });
    }

    async function syncClerkSession() {
      if (authSyncInFlight) return;
      authSyncInFlight = true;
      try {
        const token = await getClerkToken();
        if (!token) {
          state.user = null;
          showLogin('Session Clerk detectee, mais JWT non disponible. Patientez 2 secondes puis reconnectez-vous.');
          return;
        }
        const user = await apiGet('/v1/mobile/auth/me');
        state.user = user;
        showAuthenticatedShell();
      } catch (error) {
        state.user = null;
        showLogin('Session Clerk non valide pour le backend: ' + error.message);
      } finally {
        authSyncInFlight = false;
      }
    }

    async function bootstrapAuth() {
      document.getElementById('login-api-base').textContent = apiBase;
      if (!CLERK_CONFIGURED) {
        showLogin('Ajoutez NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY puis rebuild APK');
        return;
      }
      try {
        clerk = await waitForClerkGlobal();
        await clerk.load();
        clerk.addListener(function (resources) {
          if (resources && resources.session && resources.user) {
            syncClerkSession();
          }
        });
        if (clerk.isSignedIn && clerk.session) {
          await syncClerkSession();
        } else {
          showLogin();
        }
      } catch (error) {
        showLogin('Impossible de charger Clerk: ' + error.message);
      }
    }

    async function signOut() {
      try { await apiSend('/v1/mobile/auth/logout', 'POST'); } catch (_) {}
      try { if (clerk) await clerk.signOut(); } catch (_) {}
      state.user = null;
      state.prs = [];
      state.notifications = [];
      state.health = null;
      state.stats = null;
      showLogin('Deconnecte');
    }

    function riskClass(risk) {
      return 'risk-' + String(risk || 'LOW').toLowerCase();
    }

    function ago(dateValue) {
      const time = new Date(dateValue).getTime();
      if (!Number.isFinite(time)) return '';
      const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
      if (minutes < 1) return 'just now';
      if (minutes < 60) return minutes + 'm ago';
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return hours + 'h ago';
      return Math.floor(hours / 24) + 'd ago';
    }

    function normalizePr(item) {
      return {
        id: String(item.id),
        mobile_status: item.mobile_status || item.status || 'waiting_reviewer',
        title: item.title || ('Analysis #' + String(item.id).slice(0, 8)),
        repo_name: item.repo_name || item.project_name || 'Repository',
        risk_level: String(item.risk_level || 'LOW').toUpperCase(),
        findings_count: Number(item.findings_count || 0),
        created_at: item.created_at || new Date().toISOString(),
        pr_summary: item.pr_summary || '',
        merge_readiness: item.merge_readiness,
        findings_by_severity: item.findings_by_severity || {},
        test_suggestions: item.test_suggestions || []
      };
    }

    function severityCount(severity, label) {
      const upper = String(label).toUpperCase();
      const lower = upper.toLowerCase();
      if (upper === 'CRITICAL') return Number(severity.CRITICAL || severity.critical || severity.BLOCKER || severity.blocker || 0);
      if (upper === 'MEDIUM') return Number(severity.MEDIUM || severity.medium || severity.WARN || severity.warn || 0);
      return Number(severity[upper] || severity[lower] || 0);
    }

    function countsFromItems(items) {
      const counts = {};
      tabs.forEach(function (tab) { counts[tab.key] = 0; });
      items.forEach(function (item) {
        counts[item.mobile_status] = (counts[item.mobile_status] || 0) + 1;
      });
      return counts;
    }

    async function loadPrs() {
      document.getElementById('prs-list').innerHTML = '<div class="loading">Chargement des analyses reelles...</div>';
      try {
        const listData = await apiGet('/v1/mobile/analyses?status=' + encodeURIComponent(state.activeTab) + '&limit=30');
        const countData = await apiGet('/v1/mobile/analyses/counts');
        state.prs = (listData.items || listData.analyses || []).map(normalizePr);
        state.counts = countData || countsFromItems(state.prs);
        setBackendStatus(true);
      } catch (error) {
        state.prs = [];
        state.counts = {};
        setBackendStatus(false, 'Backend/API indisponible: ' + error.message);
      }
      renderPrs();
    }

    async function loadAnalysis(id) {
      const cached = state.prs.find(function (item) { return item.id === id; });
      document.getElementById('analysis-title').textContent = cached ? cached.title : 'Analyse';
      document.getElementById('analysis-repo').textContent = cached ? cached.repo_name : '';
      document.getElementById('analysis-body').innerHTML = '<div class="loading">Chargement du resume...</div>';
      setView('analysis');

      try {
        const item = normalizePr(await apiGet('/v1/mobile/analyses/' + encodeURIComponent(id) + '/summary'));
        renderAnalysis(item);
      } catch (error) {
        if (cached) {
          showToast('Resume indisponible: ' + error.message);
          renderAnalysis(cached);
          return;
        }
        document.getElementById('analysis-body').innerHTML = '<div class="notice">Impossible de charger cette analyse depuis le backend: ' + esc(error.message) + '</div>';
      }
    }

    async function loadNotifications() {
      try {
        const data = await apiGet('/v1/mobile/notifications?limit=50');
        state.notifications = data.notifications || data.items || [];
        setBackendStatus(true);
      } catch (error) {
        state.notifications = [];
        setBackendStatus(false, 'Notifications indisponibles: ' + error.message);
      }
      renderNotifications();
    }

    async function loadHealth() {
      try {
        state.health = await apiGet('/v1/mobile/health');
        setBackendStatus(true);
      } catch (error) {
        state.health = null;
        setBackendStatus(false, 'Health indisponible: ' + error.message);
      }
      renderHealth();
    }

    async function loadStats() {
      try {
        state.stats = await apiGet('/v1/mobile/statistics');
        setBackendStatus(true);
      } catch (error) {
        state.stats = { total_analyses: 0, approved_prs: 0, findings_this_week: 0, return_prs: 0 };
        setBackendStatus(false, 'Stats indisponibles: ' + error.message);
      }
      renderDashboard();
    }

    async function refreshCurrent() {
      const active = document.querySelector('.view.active');
      if (!active) return;
      if (active.id === 'view-prs') await loadPrs();
      if (active.id === 'view-notifications') await loadNotifications();
      if (active.id === 'view-health') await loadHealth();
      if (active.id === 'view-dashboard') await loadStats();
    }

    function setView(name) {
      if (name === 'health' && !isTechLead()) {
        showToast('La sante plateforme est reservee au Tech Lead');
        name = 'dashboard';
      }
      document.querySelectorAll('.view').forEach(function (view) { view.classList.remove('active'); });
      document.getElementById('view-' + name).classList.add('active');
      document.querySelectorAll('#nav button').forEach(function (button) {
        button.classList.toggle('active', button.dataset.nav === name);
      });
      document.querySelector('.content').scrollTop = 0;
      if (name === 'notifications') loadNotifications();
      if (name === 'health') loadHealth();
      if (name === 'dashboard') loadStats();
    }

    function renderTabs() {
      const root = document.getElementById('tabs');
      root.innerHTML = tabs.map(function (tab) {
        const count = state.counts[tab.key] || 0;
        const active = tab.key === state.activeTab ? ' active' : '';
        return '<button class="pill' + active + '" data-tab="' + esc(tab.key) + '">' + esc(tab.label) + '<span class="count">' + count + '</span></button>';
      }).join('');
      root.querySelectorAll('[data-tab]').forEach(function (button) {
        button.addEventListener('click', async function () {
          state.activeTab = button.dataset.tab;
          await loadPrs();
        });
      });
    }

    function renderPrs() {
      renderTabs();
      document.getElementById('prs-subtitle').textContent =
        state.prs.length + ' pull request' + (state.prs.length === 1 ? '' : 's') + ' depuis backend';
      const root = document.getElementById('prs-list');
      if (!state.prs.length) {
        root.innerHTML = '<div class="empty">Aucune PR dans cette categorie</div>';
        return;
      }
      root.innerHTML = state.prs.map(function (pr) {
        return '<button class="card" data-analysis="' + esc(pr.id) + '">' +
          '<div class="between"><div class="grow"><div class="title">' + esc(pr.title) + '</div><div class="meta">' + esc(pr.repo_name) + '</div></div><span class="badge ' + riskClass(pr.risk_level) + '">' + esc(pr.risk_level) + '</span></div>' +
          '<div class="foot"><div class="mini"><span>' + pr.findings_count + ' findings</span><span>' + esc(ago(pr.created_at)) + '</span></div><span>&gt;</span></div>' +
        '</button>';
      }).join('');
      root.querySelectorAll('[data-analysis]').forEach(function (button) {
        button.addEventListener('click', function () { loadAnalysis(button.dataset.analysis); });
      });
    }

    function renderAnalysis(pr) {
      const severity = pr.findings_by_severity || {};
      const labels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
      document.getElementById('analysis-title').textContent = pr.title;
      document.getElementById('analysis-repo').textContent = pr.repo_name;
      document.getElementById('analysis-body').innerHTML =
        '<div class="hero"><div class="hero-risk"><div><div class="metric-label">Risk Level</div><strong class="' + riskClass(pr.risk_level) + '" style="background:none;padding:0">' + esc(pr.risk_level) + '</strong></div><span class="badge ' + riskClass(pr.risk_level) + '">' + (pr.merge_readiness ? 'Ready' : 'Review') + '</span></div></div>' +
        '<div class="card"><div class="metric-label" style="margin-bottom:12px">Findings (' + pr.findings_count + ')</div><div class="severity-grid">' +
          labels.map(function (label) { return '<div class="severity"><b>' + severityCount(severity, label) + '</b><span>' + label + '</span></div>'; }).join('') +
        '</div></div>' +
        '<div class="card" style="margin-top:10px"><div class="title">' + (pr.merge_readiness ? 'Ready to merge' : 'Not ready to merge') + '</div><div class="meta">' + (pr.merge_readiness ? 'All blocking checks passed' : 'Resolve blockers before merging') + '</div></div>' +
        '<div class="card" style="margin-top:10px"><div class="metric-label">AI Summary</div><div class="meta" style="font-size:13px;line-height:1.55;color:#d1d5db;margin-top:8px">' + esc(pr.pr_summary || 'No summary available yet.') + '</div></div>' +
        '<div class="card" style="margin-top:10px"><div class="metric-label">Suggested tests</div>' + (pr.test_suggestions.length ? pr.test_suggestions.map(function (test, index) { return '<div class="meta" style="font-size:13px;color:#d1d5db;margin-top:8px">' + (index + 1) + '. ' + esc(test) + '</div>'; }).join('') : '<div class="meta">No test suggestion available.</div>') + '</div>';
    }

    function renderNotifications() {
      const unread = state.notifications.filter(function (item) { return !item.read; }).length;
      document.getElementById('notif-subtitle').textContent = unread + ' unread';
      const root = document.getElementById('notif-list');
      if (!state.notifications.length) {
        root.innerHTML = '<div class="empty">Aucune notification</div>';
        return;
      }
      root.innerHTML = state.notifications.map(function (item) {
        return '<button class="card" data-notif="' + esc(item.id) + '"><div class="between"><div class="grow"><div class="title">' + esc(item.title) + '</div><div class="meta">' + esc(item.body || item.message || '') + '</div><div class="meta">' + esc(ago(item.created_at)) + '</div></div>' +
        (item.read ? '<span class="badge">Read</span>' : '<span class="badge risk-high">New</span>') + '</div></button>';
      }).join('');
      root.querySelectorAll('[data-notif]').forEach(function (button) {
        button.addEventListener('click', async function () {
          const item = state.notifications.find(function (n) { return String(n.id) === button.dataset.notif; });
          if (!item) return;
          item.read = true;
          renderNotifications();
          try { await apiSend('/v1/mobile/notifications/' + encodeURIComponent(item.id) + '/read', 'PATCH'); } catch (_) {}
          if (item.analysis_id) loadAnalysis(item.analysis_id);
        });
      });
    }

    function renderHealth() {
      const root = document.getElementById('health-body');
      if (!state.health) {
        root.innerHTML = '<div class="notice">Backend indisponible. Verifiez que l API sur VPS est accessible, puis appuyez sur le badge backend en haut.</div>';
        return;
      }
      const h = state.health;
      const healthy = h.status === 'healthy';
      root.innerHTML =
        '<div class="hero"><div class="hero-risk"><div><div class="metric-label">Global status</div><strong style="color:' + (healthy ? 'var(--green)' : 'var(--yellow)') + '">' + esc(h.status || 'unknown') + '</strong></div><span class="badge ' + (healthy ? 'risk-low' : 'risk-medium') + '">' + (healthy ? 'Online' : 'Degraded') + '</span></div></div>' +
        '<div class="metric-grid">' +
          metric('Queue depth', h.queue_depth, String(h.pending_analyses || 0) + ' pending') +
          metric('Failure rate', Number(h.failure_rate || 0).toFixed(1) + '%', 'last hour') +
          metric('Workers', h.celery_workers_online || h.active_workers || 0, String(h.running_analyses || 0) + ' running') +
          metric('Analyses / h', h.analyses_last_hour || 0, 'avg ' + Number(h.avg_analysis_duration_s || 0).toFixed(0) + 's') +
        '</div><div class="section-title">Services</div><div class="list">' +
          service('Neo4j Graph DB', h.neo4j_connected) +
          service('Redis / Queue', h.redis_connected) +
          service('Celery Workers', Number(h.celery_workers_online || 0) > 0) +
        '</div>';
    }

    function metric(label, value, sub) {
      return '<div class="metric"><div class="metric-label">' + esc(label) + '</div><div class="metric-value">' + esc(value) + '</div><div class="meta">' + esc(sub || '') + '</div></div>';
    }

    function service(label, ok) {
      return '<div class="card"><div class="between"><div class="title">' + esc(label) + '</div><span class="badge ' + (ok ? 'risk-low' : 'risk-critical') + '">' + (ok ? 'Online' : 'Offline') + '</span></div></div>';
    }

    function renderDashboard() {
      const s = state.stats || {};
      const user = state.user || {};
      document.getElementById('account-card').innerHTML =
        '<div class="between"><div class="grow"><div class="metric-label">Compte mobile</div><div class="title">' + esc(user.display_name || user.email || 'Utilisateur') + '</div><div class="meta">' + esc(user.email || '') + '</div></div><span class="badge ' + (user.role === 'tech_lead' ? 'risk-low' : '') + '">' + esc(user.role || 'developer') + '</span></div>';
      document.getElementById('dashboard-grid').innerHTML =
        metric('Total analyses', s.total_analyses || 0, '') +
        metric('PRs approuvees', s.approved_prs || 0, '') +
        metric('Findings / semaine', s.findings_this_week || 0, '') +
        metric('PRs a corriger', s.return_prs || 0, '');
    }

    document.getElementById('api-base-label').textContent = apiBase;
    document.getElementById('nav').addEventListener('click', function (event) {
      const button = event.target.closest('[data-nav]');
      if (button) setView(button.dataset.nav);
    });
    document.body.addEventListener('click', async function (event) {
      const externalNav = event.target.closest('[data-nav]');
      if (externalNav && !externalNav.closest('#nav')) setView(externalNav.dataset.nav);
      if (event.target.closest('[data-back]')) setView('prs');
      if (event.target.closest('[data-refresh]')) await refreshCurrent();
      if (event.target.closest('[data-sign-out]')) await signOut();
      if (event.target.closest('[data-mark-all]')) {
        state.notifications.forEach(function (item) { item.read = true; });
        renderNotifications();
        try { await apiSend('/v1/mobile/notifications/mark-all-read', 'POST'); } catch (_) {}
        showToast('Notifications marquees comme lues');
      }
    });

    renderTabs();
    bootstrapAuth();
  </script>
</body>
</html>`;

function main() {
  log('Generating native APK assets with local backend API calls...')
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  write(path.join(OUT_DIR, 'index.html'), html)
  write(path.join(OUT_DIR, '404.html'), html)
  write(path.join(OUT_DIR, 'mobile', 'prs', 'index.html'), html)
  if (fs.existsSync(CLERK_ASSETS_SOURCE)) {
    fs.cpSync(CLERK_ASSETS_SOURCE, path.join(OUT_DIR, 'vendor', 'clerk-js', 'current'), { recursive: true })
  } else {
    log('Warning: Clerk assets not found. Run npm run sync:clerk-assets before building the APK.')
  }

  log('Syncing Android project without a dev server URL...')
  const env = { ...process.env }
  delete env.CAPACITOR_DEV_SERVER_URL
  delete env.CAPACITOR_START_PATH
  execSync('npx cap sync android', { cwd: ROOT, env, stdio: 'inherit' })

  log(`APK assets are ready. The app will call ${DEFAULT_MOBILE_API_BASE}/v1/mobile by default.`)
}

main()
