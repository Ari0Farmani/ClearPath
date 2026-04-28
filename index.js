/**
 * ClearPath Relay — Serverless XHTTP relay for Xray/V2Ray on Vercel
 * Anti-DPI hardened, multi-target, camouflaged edition
 *
 * Env vars:
 *   TARGET_DOMAIN   — comma-separated upstream base URLs (required)
 *                     e.g. "https://node1.example.com,https://node2.example.com"
 *   ACCESS_PATH     — secret path prefix that activates the relay (optional)
 *                     e.g. "xsecret" → relay activates on /xsecret/...
 *                     if empty, ALL paths are proxied (no camouflage effect)
 *   SITE_TITLE      — fake site title shown on camouflage page (default: "My Notes")
 *   SITE_AUTHOR     — fake author name shown on camouflage page (default: "Alex")
 */

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// ─── Vercel function config ───────────────────────────────────────────────────
export const config = {
  api: { bodyParser: false },
  supportsResponseStreaming: true,
  maxDuration: 60,
};

// ─── Environment config ───────────────────────────────────────────────────────
const TARGET_HOSTS = (process.env.TARGET_DOMAIN || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

// ACCESS_PATH: the secret path segment that triggers relay mode.
// If not set, every request is relayed (backwards-compatible with v1).
const ACCESS_PATH = (process.env.ACCESS_PATH || "").replace(/^\/+|\/+$/g, "");

const SITE_TITLE  = process.env.SITE_TITLE  || "My Notes";
const SITE_AUTHOR = process.env.SITE_AUTHOR || "Alex";

// ─── Header filter lists ──────────────────────────────────────────────────────

/**
 * Headers we strip from the client request before forwarding upstream.
 * These would reveal this is a Vercel proxy or break HTTP semantics.
 */
const STRIP_REQ = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-vercel-id",
  "x-vercel-deployment-url",
  "x-vercel-forwarded-for",
]);

/**
 * Headers we strip from the upstream response before sending to client.
 * These are hop-by-hop headers that must not be forwarded end-to-end.
 */
const STRIP_RES = new Set([
  "transfer-encoding",
  "connection",
  "keep-alive",
  "proxy-connection",
]);

// ─── Round-robin load balancer ────────────────────────────────────────────────
let _rrIdx = 0;

function pickTarget() {
  if (TARGET_HOSTS.length === 0) return null;
  const t = TARGET_HOSTS[_rrIdx % TARGET_HOSTS.length];
  _rrIdx = (_rrIdx + 1) % TARGET_HOSTS.length;
  return t;
}

// ─── Camouflage static responses ─────────────────────────────────────────────

const CAMOUFLAGE_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${SITE_TITLE}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #f8f9fa; --surface: #fff; --border: #e9ecef;
    --text: #212529; --muted: #6c757d; --accent: #0d6efd;
    --radius: 8px; --font: system-ui, -apple-system, sans-serif;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--font); line-height: 1.7; }
  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: .9rem 1.5rem; display: flex; align-items: center; gap: .75rem; }
  header svg { color: var(--accent); flex-shrink: 0; }
  header span { font-weight: 600; font-size: 1.05rem; }
  main { max-width: 700px; margin: 3rem auto; padding: 0 1.5rem; }
  .hero h1 { font-size: 2rem; font-weight: 700; margin-bottom: .5rem; }
  .hero p  { color: var(--muted); font-size: 1.05rem; }
  .posts   { margin-top: 2.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
  .post    { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem 1.5rem; }
  .post time { font-size: .8rem; color: var(--muted); }
  .post h2   { font-size: 1.1rem; margin: .2rem 0 .4rem; }
  .post p    { color: var(--muted); font-size: .9rem; }
  .tag { display: inline-block; font-size: .75rem; background: #e8f0fe; color: var(--accent); border-radius: 99px; padding: .15rem .65rem; margin-left: .5rem; }
  footer { text-align: center; padding: 2.5rem 1rem; color: var(--muted); font-size: .85rem; margin-top: 3rem; border-top: 1px solid var(--border); }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<header>
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
  <span>${SITE_TITLE}</span>
</header>
<main>
  <div class="hero">
    <h1>Welcome 👋</h1>
    <p>Thoughts on software, open-source, and the web. Written by <strong>${SITE_AUTHOR}</strong>.</p>
  </div>
  <div class="posts">
    <div class="post">
      <time>March 12, 2025</time>
      <h2>Getting started with edge functions <span class="tag">serverless</span></h2>
      <p>Edge functions bring your code closer to your users. Here's what I've learned deploying on modern CDN platforms...</p>
    </div>
    <div class="post">
      <time>February 28, 2025</time>
      <h2>A minimal Node.js HTTP proxy — annotated <span class="tag">node.js</span></h2>
      <p>Sometimes you need a tiny transparent proxy. I walk through the stream-based approach and why <code>pipeline()</code> matters...</p>
    </div>
    <div class="post">
      <time>January 15, 2025</time>
      <h2>Open source tools I actually use in 2025 <span class="tag">tools</span></h2>
      <p>A curated list of CLI utilities, libraries, and services that made my workflow faster this year...</p>
    </div>
  </div>
</main>
<footer>
  © ${new Date().getFullYear()} ${SITE_AUTHOR} · <a href="/about">About</a> · Built with ☕
</footer>
</body>
</html>`;

const ROBOTS_TXT = `User-agent: *
Allow: /

Sitemap: /sitemap.xml
`;

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>/</loc><lastmod>2025-01-01</lastmod><priority>1.0</priority></url>
  <url><loc>/about</loc><lastmod>2025-01-01</lastmod><priority>0.8</priority></url>
</urlset>`;

const ABOUT_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>About — ${SITE_TITLE}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f8f9fa; color: #212529; font-family: system-ui,sans-serif; line-height: 1.7; }
  header { background: #fff; border-bottom: 1px solid #e9ecef; padding: .9rem 1.5rem; font-weight: 600; }
  main { max-width: 700px; margin: 3rem auto; padding: 0 1.5rem; }
  h1 { font-size: 1.8rem; margin-bottom: 1rem; }
  p  { color: #6c757d; margin-bottom: 1rem; }
</style>
</head>
<body>
<header>${SITE_TITLE}</header>
<main>
  <h1>About me</h1>
  <p>Hi, I'm ${SITE_AUTHOR}. I'm a software developer interested in open-source, networking, and the open web.</p>
  <p>This blog is where I share things I learn. Nothing is for sale here — just notes.</p>
  <p><a href="/">← Back to posts</a></p>
</main>
</body>
</html>`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendHTML(res, status, html, extra = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", extra.cache || "public, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(html);
}

function sendText(res, status, text, contentType = "text/plain") {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end(text);
}

/**
 * Build clean forwarding headers for the upstream request.
 * Strips Vercel internals and hop-by-hop headers.
 * Preserves the real client IP in x-forwarded-for.
 */
function buildUpstreamHeaders(reqHeaders) {
  const out = {};
  let clientIp = null;

  for (const rawKey of Object.keys(reqHeaders)) {
    const k = rawKey.toLowerCase();
    const v = reqHeaders[rawKey];

    if (STRIP_REQ.has(k)) continue;
    if (k.startsWith("x-vercel-")) continue;

    if (k === "x-real-ip") {
      clientIp = Array.isArray(v) ? v[0] : v;
      continue;
    }
    if (k === "x-forwarded-for") {
      if (!clientIp) {
        const raw = Array.isArray(v) ? v[0] : v;
        clientIp = raw.split(",")[0].trim();
      }
      continue;
    }

    out[k] = Array.isArray(v) ? v.join(", ") : v;
  }

  if (clientIp) out["x-forwarded-for"] = clientIp;
  return out;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const url   = req.url   || "/";
  const method = req.method || "GET";

  // ── Static / camouflage routes ──────────────────────────────────────────────

  if (url === "/healthz" || url === "/_health") {
    return sendText(res, 200, "ok");
  }

  if (url === "/robots.txt") {
    return sendText(res, 200, ROBOTS_TXT);
  }

  if (url === "/sitemap.xml") {
    return sendText(res, 200, SITEMAP_XML, "application/xml; charset=utf-8");
  }

  if (url === "/about" || url === "/about/") {
    return sendHTML(res, 200, ABOUT_HTML);
  }

  // ── Path-guard: relay only activates on ACCESS_PATH prefix ─────────────────
  const isRelay = ACCESS_PATH
    ? url === `/${ACCESS_PATH}` ||
      url.startsWith(`/${ACCESS_PATH}/`) ||
      url.startsWith(`/${ACCESS_PATH}?`)
    : true; // no ACCESS_PATH set → relay everything (v1 behaviour)

  if (!isRelay) {
    // Serve camouflage blog for anything that doesn't match the secret path.
    return sendHTML(res, 200, CAMOUFLAGE_HTML);
  }

  // ── Relay mode ─────────────────────────────────────────────────────────────
  if (TARGET_HOSTS.length === 0) {
    res.statusCode = 500;
    return res.end("Misconfigured: TARGET_DOMAIN env var is not set");
  }

  try {
    const target    = pickTarget();
    const targetUrl = target + url;

    const headers  = buildUpstreamHeaders(req.headers);
    const hasBody  = method !== "GET" && method !== "HEAD";

    const fetchOpts = {
      method,
      headers,
      redirect: "manual",
    };

    if (hasBody) {
      fetchOpts.body   = Readable.toWeb(req);
      fetchOpts.duplex = "half"; // required for request body streaming
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    // Forward upstream status
    res.statusCode = upstream.status;

    // Forward upstream response headers (filtered)
    for (const [k, v] of upstream.headers) {
      const kl = k.toLowerCase();
      if (STRIP_RES.has(kl)) continue;
      try { res.setHeader(k, v); } catch { /* ignore invalid header names */ }
    }

    // Stream body back to client
    if (upstream.body) {
      await pipeline(Readable.fromWeb(upstream.body), res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error("[clearpath] relay error:", err?.message ?? err);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("Bad Gateway");
    }
  }
}
