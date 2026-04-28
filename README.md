# ClearPath Relay

> Anti-DPI hardened, serverless XHTTP relay for Xray/V2Ray — deployed on Vercel's global edge network.

---

## What is this?

ClearPath Relay is a serverless HTTP relay that forwards XHTTP traffic (used by Xray/V2Ray) through Vercel's CDN to a private backend server. Because the traffic exits through a trusted CDN domain with valid TLS, it is significantly harder for deep-packet-inspection (DPI) systems to detect or block.

This is **v2** — a full rewrite with anti-fingerprinting, multi-backend load balancing, and a built-in camouflage layer.

---

## Architecture

```
Client (Xray)
     │
     │  HTTPS to *.vercel.app  (looks like normal web traffic)
     ▼
Vercel CDN Edge
     │
     │  Serverless function — api/index.js
     │
     ▼
Your private Xray/V2Ray server
(TARGET_DOMAIN)
```

---

## Features vs v1

| Feature | v1 | v2 (ClearPath) |
|---|---|---|
| Basic XHTTP relay | ✅ | ✅ |
| Header sanitization | Partial | Full — strips all Vercel internals |
| Camouflage (fake site) | ❌ | ✅ — realistic blog with multiple pages |
| Secret path guard | ❌ | ✅ — `ACCESS_PATH` env var |
| Multi-target load balancing | ❌ | ✅ — comma-separated `TARGET_DOMAIN` |
| Health check endpoint | ❌ | ✅ — `/healthz` |
| robots.txt / sitemap.xml | ❌ | ✅ — looks like real site to crawlers |
| `/about` page | ❌ | ✅ |
| Configurable site identity | ❌ | ✅ — `SITE_TITLE`, `SITE_AUTHOR` |
| ESM (import/export) | ❌ | ✅ |

---

## Deploy to Vercel

### 1. Fork / clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/clearpath-relay.git
cd clearpath-relay
```

### 2. Push to GitHub

```bash
git add .
git commit -m "initial deploy"
git push origin main
```

### 3. Import into Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. **Do not** change any build settings — Vercel auto-detects the serverless function

### 4. Set environment variables

In Vercel → Project → **Settings → Environment Variables**, add:

| Variable | Required | Example | Description |
|---|---|---|---|
| `TARGET_DOMAIN` | ✅ Yes | `https://node1.example.com,https://node2.example.com` | Your Xray backend(s). Comma-separated for load balancing |
| `ACCESS_PATH` | ✅ Recommended | `xsecret42` | Secret path prefix. Relay only activates on `/<ACCESS_PATH>/...`. Everything else shows the fake blog. |
| `SITE_TITLE` | Optional | `Dev Notes` | Camouflage blog title |
| `SITE_AUTHOR` | Optional | `Jordan` | Camouflage blog author name |

> ⚠️ **Important:** Pick a strong, random `ACCESS_PATH` — treat it like a password. Example: `x8f3k2m9`

### 5. Redeploy

After setting env vars, trigger a redeploy from the Vercel dashboard.

---

## Xray / V2Ray client config

### XHTTP example (Xray-core)

```json
{
  "outbounds": [
    {
      "protocol": "vless",
      "settings": {
        "vnext": [
          {
            "address": "YOUR-PROJECT.vercel.app",
            "port": 443,
            "users": [
              {
                "id": "YOUR-UUID",
                "encryption": "none",
                "flow": ""
              }
            ]
          }
        ]
      },
      "streamSettings": {
        "network": "xhttp",
        "security": "tls",
        "tlsSettings": {
          "serverName": "YOUR-PROJECT.vercel.app"
        },
        "xhttpSettings": {
          "path": "/YOUR_ACCESS_PATH/YOUR_UUID",
          "mode": "stream-up"
        }
      }
    }
  ]
}
```

Replace:
- `YOUR-PROJECT.vercel.app` → your actual Vercel deployment URL
- `YOUR_ACCESS_PATH` → what you set in `ACCESS_PATH` env var
- `YOUR-UUID` → your VLESS UUID

---

## Anti-DPI design

### Why this is harder to block than a raw VPN

1. **Valid TLS from a trusted CDN** — traffic uses Vercel's wildcard certificate (`*.vercel.app`). The TLS fingerprint looks identical to millions of legitimate web apps.

2. **Camouflage layer** — any request that doesn't start with `/<ACCESS_PATH>/` gets a real, rendered HTML blog. Search engine crawlers, censorship scanners, and manual reviewers see a normal-looking website. Only clients that know the secret path trigger the relay.

3. **robots.txt and sitemap.xml** — served correctly, further reinforcing the legitimate-site illusion.

4. **Hop-by-hop header stripping** — all Vercel-internal headers (`x-vercel-*`, `x-forwarded-*`, etc.) are stripped before forwarding. Your backend sees a clean request with only the real client IP.

5. **No leaking of backend IP in responses** — upstream response headers are also filtered before being sent to the client.

6. **SNI camouflage** — the TLS SNI is `vercel.app` domain, not your backend server's domain.

### What this does NOT protect against

- If your Vercel project URL itself becomes known/blocked, rotate to a new deployment.
- This does not hide the fact that you're using Vercel — it hides what the traffic *carries*.
- Custom domains on Vercel further improve stealth (your own domain looks even more legitimate).

---

## Load balancing (multi-target)

Set `TARGET_DOMAIN` to a comma-separated list:

```
TARGET_DOMAIN=https://node1.example.com,https://node2.example.com,https://node3.example.com
```

Requests are distributed in round-robin across all backends. If one backend is down, the next request automatically goes to the next node. This improves both **resilience** and **throughput**.

---

## Endpoints

| Path | Behaviour |
|---|---|
| `/` | Camouflage blog homepage |
| `/about` | Camouflage about page |
| `/robots.txt` | Standard robots.txt |
| `/sitemap.xml` | Standard sitemap |
| `/healthz` or `/_health` | Returns `ok` (plain text) — use for uptime monitoring |
| `/<ACCESS_PATH>/...` | **Relay mode** — forwards to your backend |
| anything else | Camouflage blog (404-free, seamless) |

---

## Local development

You can test locally using the Vercel CLI:

```bash
npm install -g vercel
vercel dev
```

Set env vars in `.env.local`:

```env
TARGET_DOMAIN=https://your-backend.example.com
ACCESS_PATH=testpath
SITE_TITLE=My Notes
SITE_AUTHOR=Alex
```

---

## Security notes

- Never commit `.env.local` or share your `ACCESS_PATH`.
- Use a UUID or random string for `ACCESS_PATH` — do not use obvious words like "proxy" or "relay".
- Rotate your `ACCESS_PATH` and UUID periodically.
- Enable Vercel's **password protection** on the project for an extra layer (Settings → Deployment Protection).

---

## License

MIT
