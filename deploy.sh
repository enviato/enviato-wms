#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ENVIATO WMS — One-Time Deployment Setup
# Run this from your Mac terminal. It will:
#   1. Push your code to GitHub
#   2. Deploy to Vercel (production + preview environments)
#   3. Set your environment variables
# ═══════════════════════════════════════════════════════════════

set -e  # Stop on any error

echo ""
echo "══════════════════════════════════════════════"
echo "  ENVIATO WMS — Deployment Setup"
echo "══════════════════════════════════════════════"
echo ""

# ─── STEP 0: Navigate to project ───
cd ~/Desktop/Shipment\ Photos/ENVIATO_WMS/enviato-dashboard

# ─── STEP 1: GitHub Setup ───
echo "📦 STEP 1: Pushing to GitHub..."
echo ""
echo "Before running this script, create a PRIVATE repo at:"
echo "  https://github.com/new"
echo ""
echo "Repo name: enviato-dashboard"
echo "Visibility: Private"
echo "Do NOT initialize with README/.gitignore/license"
echo ""
read -p "Enter your GitHub username: " GH_USER

# The git repo is already initialized with the first commit
git remote add origin "https://github.com/${GH_USER}/enviato-dashboard.git" 2>/dev/null || \
  git remote set-url origin "https://github.com/${GH_USER}/enviato-dashboard.git"

git push -u origin main

echo ""
echo "✅ Code pushed to GitHub!"
echo ""

# ─── STEP 2: Install Vercel CLI ───
echo "🚀 STEP 2: Setting up Vercel..."
echo ""

if ! command -v vercel &> /dev/null; then
  echo "Installing Vercel CLI..."
  npm install -g vercel
fi

# Link to Vercel (this will prompt you to log in if needed)
echo "Linking project to Vercel..."
echo "When prompted:"
echo "  - Set up and deploy? YES"
echo "  - Which scope? Select your personal account"
echo "  - Link to existing project? NO"
echo "  - Project name? enviato-dashboard"
echo "  - Directory? ./"
echo "  - Override settings? NO"
echo ""

vercel link

# ─── STEP 3: Set Environment Variables ───
echo ""
echo "🔑 STEP 3: Setting environment variables..."
echo ""

# Read from .env.local
source <(grep -v '^#' .env.local | grep -v '^$' | sed 's/^/export /')

# Set for all environments (production + preview + development)
echo "Setting NEXT_PUBLIC_SUPABASE_URL..."
echo "$NEXT_PUBLIC_SUPABASE_URL" | vercel env add NEXT_PUBLIC_SUPABASE_URL production preview development --force

echo "Setting NEXT_PUBLIC_SUPABASE_ANON_KEY..."
echo "$NEXT_PUBLIC_SUPABASE_ANON_KEY" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production preview development --force

echo "Setting SUPABASE_SERVICE_ROLE_KEY..."
echo "$SUPABASE_SERVICE_ROLE_KEY" | vercel env add SUPABASE_SERVICE_ROLE_KEY production preview development --force

echo ""
echo "✅ Environment variables set!"
echo ""

# ─── STEP 4: Deploy Production ───
echo "🌐 STEP 4: Deploying to production..."
echo ""

PROD_URL=$(vercel --prod 2>&1 | tail -1)

echo ""
echo "══════════════════════════════════════════════"
echo "  ✅ DEPLOYMENT COMPLETE!"
echo "══════════════════════════════════════════════"
echo ""
echo "  Production URL: $PROD_URL"
echo ""
echo "  Next steps:"
echo "  1. Visit https://vercel.com/dashboard to see your project"
echo "  2. Go to Settings → Domains to add your custom domain"
echo "  3. Point your domain's DNS to: cname.vercel-dns.com"
echo ""
echo "  How it works going forward:"
echo "  - Push to 'main' branch  → auto-deploys to PRODUCTION"
echo "  - Push to any other branch → creates a PREVIEW deployment"
echo "  - This gives you dev + production environments automatically"
echo ""
echo "══════════════════════════════════════════════"
