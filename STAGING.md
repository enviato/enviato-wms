# ENVIATO WMS — Staging Workflow

How to test changes on staging before they reach real customers.

**Created:** April 26, 2026
**Audience:** Project owner (non-developer) and any future contributor.

---

## The mental model

There is **one** GitHub repo: `github.com/enviato/enviato-wms`. There is no separate "staging repo." What separates staging from production is the **branch name** of the code, plus which Supabase database Vercel connects it to.

```
github.com/enviato/enviato-wms (one repo)
│
├── main branch ─────────────► PRODUCTION
│                              ▸ enviato-wms.vercel.app
│                              ▸ talks to PROD Supabase (ilguqphtephoqlshgpza)
│                              ▸ real customers see this
│
├── staging branch ──────────► STAGING
│                              ▸ enviato-wms-git-staging-alexander-lessas-projects.vercel.app
│                              ▸ talks to STAGING Supabase (rubazwhpdgykeavtcoyk)
│                              ▸ only Vercel team sees this (deployment protection)
│
└── any-other-branch ────────► PREVIEW
                               ▸ enviato-wms-git-{branch}-alexander-lessas-projects.vercel.app
                               ▸ talks to STAGING Supabase
                               ▸ throwaway environment for one feature
```

Same code in all three places. What's different is the environment variables Vercel injects at build time, which point at different Supabase databases.

---

## Stable URLs and credentials

### Production
- URL: https://enviato-wms.vercel.app
- Database: prod Supabase
- Branch: `main`

### Staging (bookmark this)
- URL: https://enviato-wms-git-staging-alexander-lessas-projects.vercel.app
- Database: staging Supabase
- Branch: `staging`
- Admin login: `lessaenterprises@gmail.com` / *(password set during seed; change after first login)*

### Build status / logs
- Deployments dashboard: https://vercel.com/alexander-lessas-projects/enviato-wms

---

## The standard workflow

For any non-trivial change, follow this sequence. **Never push directly to `main`.**

### 1. Create a feature branch from `main`

From your terminal in the project folder:

```bash
git checkout main
git pull
git checkout -b feature/short-description
```

`feature/short-description` is the branch name — pick something that describes what you're doing (e.g. `feature/customer-search`, `fix/awb-rounding`, `chore/update-readme`).

### 2. Make your changes and commit

```bash
# Edit files, then:
git add path/to/changed-file.ts
git commit -m "Short description of what changed"
```

### 3. Push the branch — get a Preview URL

```bash
git push -u origin feature/short-description
```

Vercel auto-detects the push and builds a Preview deployment in ~90 seconds. The URL pattern is:

```
https://enviato-wms-git-feature-short-description-alexander-lessas-projects.vercel.app
```

Open it. The Preview connects to **staging Supabase**, so you can test your change against the seeded test data without touching prod.

### 4. Test on the Preview URL

Click around. Try the change you made. Check that it:
- Does what you intended
- Doesn't break unrelated features
- Looks right (visual regressions)

If you find bugs, fix them, push again — Vercel rebuilds the same Preview URL automatically.

### 5. Merge into `staging` for broader testing

When the feature works in isolation, merge it into the `staging` branch:

```bash
git checkout staging
git pull
git merge feature/short-description
git push
```

The bookmarked staging URL now reflects your change alongside any other in-flight work. Test again, this time as part of the whole staging environment.

### 6. Once staging is solid, promote to production

When you're confident the staging environment is bug-free:

```bash
git checkout main
git pull
git merge staging
git push
```

Vercel auto-deploys `main` → production. Real customers will see the change within ~90 seconds.

### 7. Delete the feature branch (optional cleanup)

```bash
git push origin --delete feature/short-description
git branch -d feature/short-description
```

---

## Quick experiments (when you don't need a feature branch)

If you're trying something rough and small — a 5-minute experiment, not a real feature — you can skip the feature branch and push straight to `staging`:

```bash
git checkout staging
git pull
# make changes
git add .
git commit -m "experiment: try X"
git push
```

This re-deploys the staging URL only. Prod is untouched. If the experiment fails, revert it on staging:

```bash
git revert HEAD
git push
```

---

## How to seed (or re-seed) the staging database

The seed script populates staging with test data: 1 organization, an admin user, 5 fake customers, 1 courier group, 2 warehouse locations, an AWB, and 20 packages spread across 8 statuses.

### First-time setup

You need a `.env.staging.local` file in `enviato-dashboard/` containing the staging Supabase credentials. The file is git-ignored (never committed). If it doesn't exist:

```bash
# Create the file with the staging Supabase credentials
# (Get the service role key from Supabase dashboard → staging branch → Project Settings → API)
```

### Running the seed

```bash
cd "/Users/billionairesclub/Desktop/Shipment Photos/ENVIATO_WMS/enviato-dashboard"
npm run seed:staging
```

The script prints each step and refuses to run if the URL or service role key isn't pointing at staging.

### Re-running

The script is idempotent — safe to run multiple times. It uses deterministic IDs for every row, so re-runs update existing rows in place rather than creating duplicates.

### When to re-seed

- After you reset the Supabase staging branch
- When you've made changes to the seed script and want them applied
- When staging data has gotten weird from manual testing and you want to start clean

---

## Resetting the staging Supabase database

If staging data is so messed up you want to start over:

1. Go to https://supabase.com/dashboard
2. Switch to the staging branch (top-left dropdown)
3. Find the "reset branch" or "rebuild branch" option in branch settings
4. Confirm — this re-applies the migration baseline from `main`'s migrations
5. Re-run `npm run seed:staging` to repopulate

**Production is untouched** — branch reset only affects the staging branch.

---

## What NEVER to do

🚫 **Push directly to `main` without staging first.** Real customers see prod immediately. Even small changes can break in unexpected ways.

🚫 **Run the seed script against prod.** The script has hard guards that refuse, but don't try to bypass them.

🚫 **Commit `.env.staging.local` or any `.env.*.local` file.** These contain secrets. Your `.gitignore` covers them — verify with `git status` before committing.

🚫 **Use the same password for staging and prod admin accounts.** Staging is for testing; treat its credentials as throwaway.

🚫 **Test destructive behavior on prod.** If you want to know what happens when you delete every package, do it on staging where you can re-seed.

---

## Troubleshooting

### "I pushed but Vercel didn't build"
- Check https://vercel.com/alexander-lessas-projects/enviato-wms for the deployment list
- Confirm the push reached GitHub: `git log origin/staging --oneline -3`
- If the deployment is "Canceled," there's likely a build error — click into it for logs

### "Staging shows my prod customers, not the seed data"
- Something is wrong with the env var wiring. Check Vercel project settings → Environment Variables. The Preview scope must point at staging Supabase URL `rubazwhpdgykeavtcoyk`, not prod URL `ilguqphtephoqlshgpza`.

### "I can't log in to staging"
- The seed script set the password to `EnviatoStaging2026!` (or whatever was in `SEED_ADMIN_PASSWORD` env var). If you changed it after first login, use the new one.
- If you've forgotten and are locked out, re-run the seed — it will update the password back to the default.

### "git push fails with 'permission denied'"
- The `enviato` GitHub org might have temporarily revoked access. Confirm at https://github.com/orgs/enviato/people that you're still a member.
- Try `git remote -v` to confirm origin points at `https://github.com/enviato/enviato-wms.git`.

### "The Preview URL says 'Authentication Required'"
- That's Vercel's Deployment Protection. Sign in to Vercel with your normal account first, then revisit the URL — you'll go through.

---

## Reference

- Seed script source: [`scripts/seed-staging.ts`](scripts/seed-staging.ts)
- Supabase prod project ref: `ilguqphtephoqlshgpza`
- Supabase staging project ref: `rubazwhpdgykeavtcoyk`
- Vercel project ID: `prj_LdLOkPUiqPUr8B6nFb6kezAa2Wxb`
- Vercel team ID: `team_3gRoFrVhaedzjAVK232yBeZY`
