/**
 * Staging seed script for ENVIATO WMS.
 *
 * Idempotent: safe to re-run. Re-runs upsert existing rows by deterministic UUID,
 * never duplicate. Uses the staging service role key to bypass RLS for inserts.
 *
 * Hard guard: refuses to run unless NEXT_PUBLIC_SUPABASE_URL points at the staging
 * branch (project ref `rubazwhpdgykeavtcoyk`). Will throw if the URL or service
 * role key claims indicate prod.
 *
 * Run:    npm run seed:staging
 * Reads:  .env.staging.local (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *         SUPABASE_SERVICE_ROLE_KEY, optional SEED_ADMIN_PASSWORD)
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// --------------------------------------------------------------------------
// 1. Load .env.staging.local (no dotenv dep — small inline parser)
// --------------------------------------------------------------------------

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing env file: ${filePath}\n` +
        `Create it with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ` +
        `and SUPABASE_SERVICE_ROLE_KEY for the staging Supabase branch.`
    );
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.staging.local"));

// --------------------------------------------------------------------------
// 2. Safety guards — refuse to seed prod
// --------------------------------------------------------------------------

const STAGING_REF = "rubazwhpdgykeavtcoyk";
const PROD_REF = "ilguqphtephoqlshgpza";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.staging.local"
  );
}
if (SUPABASE_URL.includes(PROD_REF)) {
  throw new Error("REFUSING TO SEED — URL contains the prod project ref. Aborting.");
}
if (!SUPABASE_URL.includes(STAGING_REF)) {
  throw new Error(
    `URL does not match staging project ref ${STAGING_REF}. ` +
      `Refusing to seed unknown environment: ${SUPABASE_URL}`
  );
}

function decodeJwtClaims(token: string): { ref?: string; role?: string; exp?: number } {
  const parts = token.split(".");
  if (parts.length !== 3) return {};
  return JSON.parse(Buffer.from(parts[1], "base64url").toString());
}
const claims = decodeJwtClaims(SERVICE_ROLE_KEY);
if (claims.ref && claims.ref !== STAGING_REF) {
  throw new Error(
    `Service role key project ref (${claims.ref}) does not match staging (${STAGING_REF}). Aborting.`
  );
}
if (claims.role && claims.role !== "service_role") {
  throw new Error(`Service role key is for role '${claims.role}', expected 'service_role'.`);
}

// --------------------------------------------------------------------------
// 3. Deterministic UUIDs (sha256 → UUID v5-shaped). No uuid dep.
// --------------------------------------------------------------------------

const NAMESPACE = "enviato-staging-seed:v1";

function detUuid(name: string): string {
  const digest = createHash("sha256").update(`${NAMESPACE}:${name}`).digest();
  const b = Buffer.alloc(16);
  digest.copy(b, 0, 0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// --------------------------------------------------------------------------
// 4. Seed data definitions
// --------------------------------------------------------------------------

const ORG_ID = detUuid("organization:enviato-staging");
const ROOT_AGENT_ID = detUuid("agent:root");
const COURIER_GROUP_ID = detUuid("courier_group:default-air");
const AWB_ID = detUuid("awb:staging-0001");

const ADMIN_EMAIL = "lessaenterprises@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "EnviatoStaging2026!";

const CUSTOMER_DEFS = [
  { firstName: "Ana",    lastName: "Martinez",   email: "ana.martinez@example.com" },
  { firstName: "Carlos", lastName: "Lopez",      email: "carlos.lopez@example.com" },
  { firstName: "Maria",  lastName: "Garcia",     email: "maria.garcia@example.com" },
  { firstName: "Diego",  lastName: "Rodriguez",  email: "diego.rodriguez@example.com" },
  { firstName: "Lucia",  lastName: "Hernandez",  email: "lucia.hernandez@example.com" },
] as const;

const PACKAGE_STATUSES = [
  { slug: "checked_in",       name: "Checked In",       color: "#3b82f6", sort_order: 10 },
  { slug: "awb_assigned",     name: "AWB Assigned",     color: "#6366f1", sort_order: 20 },
  { slug: "shipped",          name: "Shipped",          color: "#8b5cf6", sort_order: 30 },
  { slug: "in_transit",       name: "In Transit",       color: "#ec4899", sort_order: 40 },
  { slug: "arrived",          name: "Arrived",          color: "#14b8a6", sort_order: 50 },
  { slug: "received_at_dest", name: "Received at Dest", color: "#22c55e", sort_order: 60 },
  { slug: "invoiced",         name: "Invoiced",         color: "#f59e0b", sort_order: 70 },
  { slug: "delivered",        name: "Delivered",        color: "#10b981", sort_order: 80 },
] as const;

const WAREHOUSE_LOCATIONS = [
  { code: "MIA-A1", name: "Miami Aisle A1" },
  { code: "MIA-B2", name: "Miami Aisle B2" },
] as const;

const PACKAGE_TYPES = ["bag", "box", "envelope", "pallet", "other"] as const;
const COMMODITIES = ["Electronics", "Clothing", "Books", "Documents", "Tools"] as const;

// --------------------------------------------------------------------------
// 5. Supabase admin client (bypasses RLS)
// --------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --------------------------------------------------------------------------
// 6. Helpers
// --------------------------------------------------------------------------

type AuthMetadata = Record<string, unknown>;

async function ensureAuthUser(args: {
  email: string;
  password: string;
  metadata: AuthMetadata;
}): Promise<string> {
  // listUsers default page size is 50 — enough for our small seed set.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === args.email);
  if (existing) {
    const { error: updErr } = await supabase.auth.admin.updateUserById(existing.id, {
      user_metadata: args.metadata,
      app_metadata: args.metadata,
      email_confirm: true,
    });
    if (updErr) throw updErr;
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
    user_metadata: args.metadata,
    app_metadata: args.metadata,
  });
  if (error) throw error;
  if (!data.user) throw new Error(`createUser returned no user for ${args.email}`);
  return data.user.id;
}

function logStep(label: string): void {
  // eslint-disable-next-line no-console
  console.log(`• ${label}`);
}

// --------------------------------------------------------------------------
// 7. Main
// --------------------------------------------------------------------------

async function main() {
  // eslint-disable-next-line no-console
  console.log(`→ Seeding staging at ${SUPABASE_URL}`);
  // eslint-disable-next-line no-console
  console.log(`→ Org ID:        ${ORG_ID}`);
  // eslint-disable-next-line no-console
  console.log(`→ Root agent ID: ${ROOT_AGENT_ID}`);
  // eslint-disable-next-line no-console
  console.log("");

  // --- 1) Organization ---
  logStep("Upserting organization");
  {
    const { error } = await supabase.from("organizations").upsert(
      {
        id: ORG_ID,
        name: "Enviato Test Org",
        slug: "enviato-test-org",
        plan_tier: "pro",
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  // --- 2) Root agent (the warehouse operator) ---
  logStep("Upserting root agent");
  {
    const { error } = await supabase.from("agents").upsert(
      {
        id: ROOT_AGENT_ID,
        org_id: ORG_ID,
        name: "Enviato HQ",
        company_name: "Enviato HQ",
        email: ADMIN_EMAIL,
        country: "US",
        status: "active",
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  // --- 3) Package statuses ---
  logStep(`Upserting ${PACKAGE_STATUSES.length} package statuses`);
  for (const s of PACKAGE_STATUSES) {
    const id = detUuid(`package_status:${s.slug}`);
    const { error } = await supabase.from("package_statuses").upsert(
      {
        id,
        org_id: ORG_ID,
        name: s.name,
        slug: s.slug,
        color: s.color,
        sort_order: s.sort_order,
      },
      { onConflict: "org_id,slug" }
    );
    if (error) throw error;
  }

  // --- 4) Courier group ---
  logStep("Upserting courier group");
  {
    const { error } = await supabase.from("courier_groups").upsert(
      {
        id: COURIER_GROUP_ID,
        org_id: ORG_ID,
        name: "Default Air Courier",
        code: "DEFAULT-AIR",
        country: "US",
        pricing_model: "gross_weight",
        rate_per_lb: 5.0,
        currency: "USD",
        type: "shipping",
        is_active: true,
      },
      { onConflict: "org_id,code" }
    );
    if (error) throw error;
  }

  // --- 5) Warehouse locations ---
  logStep(`Upserting ${WAREHOUSE_LOCATIONS.length} warehouse locations`);
  for (const w of WAREHOUSE_LOCATIONS) {
    const id = detUuid(`warehouse_location:${w.code}`);
    const { error } = await supabase.from("warehouse_locations").upsert(
      {
        id,
        org_id: ORG_ID,
        name: w.name,
        code: w.code,
        is_active: true,
      },
      { onConflict: "org_id,code" }
    );
    if (error) throw error;
  }

  // --- 6) Admin user ---
  logStep(`Upserting admin user (${ADMIN_EMAIL})`);
  const adminId = await ensureAuthUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    metadata: {
      org_id: ORG_ID,
      role: "org_admin",
      role_v2: "ORG_ADMIN",
      first_name: "Lessa",
      last_name: "Enterprises",
    },
  });
  {
    const { error } = await supabase.from("users").upsert(
      {
        id: adminId,
        org_id: ORG_ID,
        email: ADMIN_EMAIL,
        first_name: "Lessa",
        last_name: "Enterprises",
        role: "org_admin",
        role_v2: "ORG_ADMIN",
        is_active: true,
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  // --- 7) Customer users ---
  logStep(`Upserting ${CUSTOMER_DEFS.length} customer users`);
  for (const c of CUSTOMER_DEFS) {
    const userId = await ensureAuthUser({
      email: c.email,
      password: ADMIN_PASSWORD,
      metadata: {
        org_id: ORG_ID,
        role: "customer",
        role_v2: "CUSTOMER",
        first_name: c.firstName,
        last_name: c.lastName,
        agent_id: ROOT_AGENT_ID,
      },
    });
    const { error: uErr } = await supabase.from("users").upsert(
      {
        id: userId,
        org_id: ORG_ID,
        email: c.email,
        first_name: c.firstName,
        last_name: c.lastName,
        role: "customer",
        role_v2: "CUSTOMER",
        agent_id: ROOT_AGENT_ID,
        is_active: true,
      },
      { onConflict: "id" }
    );
    if (uErr) throw uErr;

    const cv2Id = detUuid(`customer_v2:${c.email}`);
    const { error: cvErr } = await supabase.from("customers_v2").upsert(
      {
        id: cv2Id,
        org_id: ORG_ID,
        owner_agent_id: ROOT_AGENT_ID,
        first_name: c.firstName,
        last_name: c.lastName,
        email: c.email,
        customer_type: "END_CUSTOMER",
        is_active: true,
      },
      { onConflict: "id" }
    );
    if (cvErr) throw cvErr;
  }

  // --- 8) AWB ---
  logStep("Upserting AWB");
  {
    const { error } = await supabase.from("awbs").upsert(
      {
        id: AWB_ID,
        org_id: ORG_ID,
        courier_group_id: COURIER_GROUP_ID,
        agent_id: ROOT_AGENT_ID,
        awb_number: "AWB-STAGING-0001",
        freight_type: "air",
        airline_or_vessel: "American Airlines",
        origin: "MIA",
        destination: "GEO",
        status: "in_transit",
        departure_date: "2026-04-20",
        arrival_date: "2026-04-25",
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  // --- 9) Packages: 20 spread across all statuses ---
  logStep("Upserting 20 packages");
  const { data: customerRows, error: custErr } = await supabase
    .from("users")
    .select("id, email")
    .eq("org_id", ORG_ID)
    .eq("role_v2", "CUSTOMER");
  if (custErr) throw custErr;
  const customerIds = (customerRows ?? []).map((u) => u.id);
  if (customerIds.length === 0) {
    throw new Error("No customer users found to attach packages to.");
  }

  for (let i = 0; i < 20; i++) {
    const status = PACKAGE_STATUSES[i % PACKAGE_STATUSES.length];
    const customerId = customerIds[i % customerIds.length];
    const tracking = `STG-${(i + 1).toString().padStart(4, "0")}`;
    const id = detUuid(`package:${tracking}`);
    const onAwb = status.slug !== "checked_in";

    const { error } = await supabase.from("packages").upsert(
      {
        id,
        org_id: ORG_ID,
        customer_id: customerId,
        agent_id: ROOT_AGENT_ID,
        courier_group_id: COURIER_GROUP_ID,
        awb_id: onAwb ? AWB_ID : null,
        tracking_number: tracking,
        carrier: "FedEx",
        status: status.slug,
        weight: 5 + (i % 10),
        weight_unit: "lb",
        length: 12 + (i % 6),
        width: 10 + (i % 4),
        height: 8 + (i % 3),
        dim_unit: "in",
        package_type: PACKAGE_TYPES[i % PACKAGE_TYPES.length],
        commodity: COMMODITIES[i % COMMODITIES.length],
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("✓ Seed complete.");
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("Login at the staging Vercel preview URL with:");
  // eslint-disable-next-line no-console
  console.log(`  email:    ${ADMIN_EMAIL}`);
  // eslint-disable-next-line no-console
  console.log(`  password: ${ADMIN_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("Customer logins use the same password. Change after first login.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
