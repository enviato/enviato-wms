# ENVIATO WMS — Deployment Guide

**Created:** April 12, 2026
**Stack:** Next.js 14 + Supabase + Vercel + Cloudflare DNS

---

## OVERVIEW

Your go-live stack:

| Service | Role | Cost |
|---------|------|------|
| **GitHub** | Source code repository | Free (private repos included) |
| **Vercel** | Frontend hosting + serverless functions | Free tier → $20/mo Pro when needed |
| **Supabase** | Database + Auth + Storage + Realtime | Already running (Free → $25/mo Pro) |
| **Cloudflare** | DNS management + DDoS protection + SSL | Free tier |

This is the gold standard for Next.js apps. Vercel built Next.js — zero-config deploys, automatic preview URLs on every PR, edge caching, and serverless functions all work out of the box.

---

## STEP 1 — PUSH CODE TO GITHUB

### 1.1 Create a GitHub account (if needed)
Go to https://github.com/signup — use your `lessaenterprises@gmail.com` email.

### 1.2 Install Git (if not already installed)
```bash
# macOS (should already be installed)
git --version

# If not installed, it will prompt you to install Xcode Command Line Tools
xcode-select --install
```

### 1.3 Create the repository on GitHub
1. Go to https://github.com/new
2. Repository name: `enviato-dashboard` (or `enviato-wms`)
3. Set to **Private**
4. Do NOT initialize with README, .gitignore, or license (you already have these)
5. Click "Create repository"

### 1.4 Push your local code
```bash
cd ~/Desktop/Shipment\ Photos/ENVIATO_WMS/enviato-dashboard

# Initialize git
git init

# Add all files (your .gitignore will exclude node_modules, .env.local, etc.)
git add .

# First commit
git commit -m "Initial commit — ENVIATO WMS dashboard"

# Connect to GitHub (replace YOUR_USERNAME with your actual GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/enviato-dashboard.git

# Push
git branch -M main
git push -u origin main
```

### ⚠️ SECURITY CHECK BEFORE PUSHING
Your `.gitignore` already excludes `.env*.local` — this is critical because `.env.local` contains your `SUPABASE_SERVICE_ROLE_KEY`. Double-check:
```bash
# Verify .env.local is NOT tracked
git status | grep env
# Should show nothing — if you see .env.local listed, STOP and run:
# git rm --cached .env.local
```

Also: your `.env.local.example` currently contains your real anon key. The anon key is safe to expose (it's a public key limited by RLS), but for cleanliness you may want to replace it with a placeholder before pushing:
```bash
# Optional — replace real key with placeholder
sed -i '' 's/eyJ.*$/YOUR_ANON_KEY_HERE/' .env.local.example
```

---

## STEP 2 — DEPLOY TO VERCEL

### 2.1 Create Vercel account
1. Go to https://vercel.com/signup
2. Sign up with your **GitHub account** (this connects them automatically)

### 2.2 Import the project
1. Click "Add New..." → "Project"
2. Select your `enviato-dashboard` repo from the list
3. Vercel auto-detects Next.js — framework settings are correct by default

### 2.3 Add environment variables
Before clicking "Deploy", add these environment variables in the Vercel dashboard:

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ilguqphtephoqlshgpza.supabase.co` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(your anon key from .env.local)* | Safe to expose — limited by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | *(your service role key from .env.local)* | Server-side only — Vercel keeps this secret |

### 2.4 Deploy
Click "Deploy" — Vercel will build and deploy. You'll get a URL like:
`https://enviato-dashboard-xxxxx.vercel.app`

### 2.5 Automatic deploys going forward
Every time you push to `main`, Vercel auto-deploys. Push to a branch → you get a preview URL. This is the workflow:
```bash
# Make changes locally
git add .
git commit -m "Fix: updated package detail"
git push
# → Vercel auto-deploys to production in ~60 seconds
```

---

## STEP 3 — CONNECT CLOUDFLARE DNS

### 3.1 Create Cloudflare account
1. Go to https://dash.cloudflare.com/sign-up
2. Free tier is all you need

### 3.2 Add your domain to Cloudflare
1. Click "Add a Site" in Cloudflare dashboard
2. Enter your domain (e.g., `enviato.app` or whatever you own)
3. Select the **Free** plan
4. Cloudflare will scan your existing DNS records — keep them

### 3.3 Update nameservers at your registrar
Cloudflare will give you two nameservers like:
```
ada.ns.cloudflare.com
bob.ns.cloudflare.com
```
Go to your domain registrar (GoDaddy, Namecheap, etc.) and replace the existing nameservers with Cloudflare's. This takes 1-24 hours to propagate.

### 3.4 Add DNS records pointing to Vercel
In Cloudflare DNS settings, add:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| `CNAME` | `@` (or `app`) | `cname.vercel-dns.com` | DNS only (gray cloud) |
| `CNAME` | `www` | `cname.vercel-dns.com` | DNS only (gray cloud) |

**Important:** Set Cloudflare proxy to **DNS only** (gray cloud, not orange) for Vercel domains. Vercel handles SSL and caching itself — double-proxying through Cloudflare causes issues.

### 3.5 Add custom domain in Vercel
1. Go to your project in Vercel → Settings → Domains
2. Add your domain (e.g., `app.enviato.com` or `enviato.app`)
3. Vercel will verify DNS and auto-provision SSL

---

## STEP 4 — UPDATE SUPABASE FOR PRODUCTION

### 4.1 Add your production URL to Supabase Auth
1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Add your production URL to **Site URL**: `https://yourdomain.com`
3. Add to **Redirect URLs**: `https://yourdomain.com/**`
4. This ensures login redirects work on your custom domain

### 4.2 Consider upgrading Supabase (when ready)
Your current Supabase project is on the free tier. For production:

| Feature | Free | Pro ($25/mo) |
|---------|------|--------------|
| Database size | 500 MB | 8 GB |
| Storage | 1 GB | 100 GB |
| Bandwidth | 2 GB | 250 GB |
| Daily backups | No | Yes |
| Auth users | Unlimited | Unlimited |
| Pausing | After 1 week inactive | Never |

**Recommendation:** Upgrade to Pro before go-live. The free tier pauses after 1 week of inactivity, which would take your WMS offline.

---

## STEP 5 — PRE-LAUNCH CHECKLIST

### Database
- [ ] Run all SQL from GO-LIVE-READINESS.md → "DATABASE CHANGES NEEDED" section
- [ ] Verify RLS policies are active on all tables (`SELECT * FROM pg_policies`)
- [ ] Clean up seed/test data (e.g., the "UPS" entry in agents table if it's test data)
- [ ] Consider: upgrade Supabase to Pro plan

### Security
- [ ] `.env.local` is in `.gitignore` (confirmed ✅)
- [ ] Service role key is ONLY in Vercel env vars, never in client code
- [ ] Review MT-3: admin routes rely on middleware + RLS (the one remaining P1)

### Supabase Auth
- [ ] Production URL added to Supabase Auth redirect URLs
- [ ] Email templates customized (Supabase Dashboard → Auth → Email Templates)
- [ ] Magic link / email login tested on production domain

### Vercel
- [ ] Environment variables set
- [ ] Custom domain connected and SSL working
- [ ] Build succeeds on Vercel (check build logs)

### DNS
- [ ] Nameservers pointed to Cloudflare
- [ ] CNAME records added for your domain → Vercel
- [ ] SSL certificate issued (Vercel does this automatically)
- [ ] Test: `https://yourdomain.com` loads the login page

### Functional
- [ ] Login/logout works on production URL
- [ ] Package check-in flow works end to end
- [ ] Photo upload works (Supabase Storage)
- [ ] Notifications appear in real-time
- [ ] Invoice creation and PDF generation works
- [ ] Label printing works

---

## COST SUMMARY

### Minimum viable (starting out)
| Service | Monthly Cost |
|---------|-------------|
| GitHub (Private) | $0 |
| Vercel (Hobby) | $0 |
| Supabase (Free) | $0 |
| Cloudflare (Free) | $0 |
| Domain name | ~$12/year |
| **Total** | **~$1/mo** |

### Production recommended
| Service | Monthly Cost |
|---------|-------------|
| GitHub (Free) | $0 |
| Vercel (Pro) | $20/mo |
| Supabase (Pro) | $25/mo |
| Cloudflare (Free) | $0 |
| Domain name | ~$12/year |
| **Total** | **~$46/mo** |

You can start on free tiers and upgrade as you onboard customers. The free-to-paid transition is seamless on all platforms — no migration needed.

---

## WHAT'S NEXT AFTER GO-LIVE

Once deployed, your roadmap priorities based on the current GO-LIVE-READINESS.md:

1. **MT-3 — Server-side permission enforcement** (remaining P1): Admin routes currently rely on middleware + RLS. Adding server-side role checks in API routes would harden security.
2. **SC-9 — Pagination** (P2): All list pages hardcode `.limit(500)`. Works fine for small orgs, but you'll need cursor-based pagination as data grows.
3. **A-3 — Chart library swap** (P2): Replace @mui/x-charts with Recharts for smaller bundle size.
4. **D-4 — Dashboard stat validation** (P2): Verify the dashboard stat queries match your business rules.
5. **I-3 — Invoice modal UX** (P2): Polish the create-invoice experience.

---

## QUICK REFERENCE COMMANDS

```bash
# Start dev server
cd ~/Desktop/Shipment\ Photos/ENVIATO_WMS/enviato-dashboard && npm run dev

# Push to production (after initial setup)
git add . && git commit -m "your message" && git push

# Check Vercel deployment status
# → Visit https://vercel.com/dashboard

# View Supabase logs
# → Visit https://supabase.com/dashboard/project/ilguqphtephoqlshgpza/logs
```
