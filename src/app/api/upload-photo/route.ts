import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase-admin";
import { createRateLimiter } from "@/shared/lib/rate-limit";
import { checkCsrf } from "@/shared/lib/csrf";
import { logger } from "@/shared/lib/logger";

const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });

const BUCKET = "package-photos";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

/**
 * Upload a package photo to Supabase Storage.
 *
 * - Authenticates the caller (must be org_admin or warehouse_staff)
 * - Auto-creates the storage bucket if it doesn't exist
 * - Returns { url, public_id } matching the storage_url / storage_path columns
 */
export async function POST(req: NextRequest) {
  const csrf = checkCsrf(req);
  if (csrf) return csrf;
  const limited = limiter.check(req);
  if (limited) return limited;

  try {
    /* ── 1. Authenticate ── */
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options: CookieOptions;
            }[]
          ) {
            // no-op for API routes
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* ── 2. Role check ── */
    const { data: profile } = await supabase
      .from("users")
      .select("role_v2")
      .eq("id", user.id)
      .single();

    if (!profile || !["ORG_ADMIN", "WAREHOUSE_STAFF"].includes(profile.role_v2)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    /* ── 3. Parse the multipart form ── */
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Strict MIME type validation (AU-14)
    const mimeType = file.type?.toLowerCase() || "";
    const ext = (file.name.split(".").pop() || "").toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Invalid file type: ${mimeType || "unknown"}. Allowed: JPEG, PNG, WebP, HEIC.` },
        { status: 400 }
      );
    }

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Invalid file extension: .${ext}. Allowed: .jpg, .jpeg, .png, .webp, .heic, .heif` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    /* ── 4. Ensure bucket exists ── */
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.find((b) => b.name === BUCKET)) {
      await admin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_SIZE,
        allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
      });
    }

    /* ── 5. Upload ── */
    const safeExt = ext || "jpg";
    const storagePath = `${crypto.randomUUID()}.${safeExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type || "image/jpeg",
        cacheControl: "31536000", // 1 year — immutable (UUID filenames never collide)
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    /* ── 6. Get public URL ── */
    const {
      data: { publicUrl },
    } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

    return NextResponse.json({
      url: publicUrl,
      public_id: storagePath, // stored in storage_path column for deletion
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    logger.error("Photo upload error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
