-- =========================================================
-- 008: Rename legacy Cloudinary columns to Supabase Storage
-- =========================================================
-- The system has been migrated from Cloudinary to Supabase
-- Storage. Rename the columns to reflect the actual provider.
-- =========================================================

ALTER TABLE package_photos RENAME COLUMN cloudinary_url TO storage_url;
ALTER TABLE package_photos RENAME COLUMN cloudinary_public_id TO storage_path;
