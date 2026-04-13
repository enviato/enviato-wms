"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { logger } from "@/shared/lib/logger";
import {
  ArrowLeft,
  Package,
  Camera,
  Clock,
  User,
  Plane,
  Tag,
  Trash2,
  CheckCircle2,
  X,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Hash,
  FileText,
  Layers,
  Scale,
  Ruler,
  Box,
  Truck,
  Search,
  Check,
  Upload,
  ExternalLink,
  Palette,
  Settings,
  Printer,
  Building2,
} from "lucide-react";

/* ═════════════════════════════════════════ IMPORTS ════════════════════════════════════════ */

import {
  PackageDetail,
  PhotoRecord,
  OtherPackage,
  ActivityLog,
  CustomerOption,
  TagDefinition,
  statusConfig,
  ActivityIllustrations,
  DefaultActivityIllustration,
  getActivityConfig,
  getActivityLabel,
  STANDARD_CARRIERS,
  PACKAGE_TYPES,
  COMMODITIES,
  computeVolumeWeight,
  fmtDate,
  fmtTime,
  fmtRelative,
} from "@/modules/packages/types";

import {
  PackageHeader,
  PhotoGallery,
  ActivityTimeline,
  TagsSection,
} from "@/modules/packages/components";

/* ═════════════════════════════════════════════════════════════════════════════════════════ */

export default function PackageDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const packageId = params?.id as string;
  const supabase = createClient();

  /* ── Core state ── */
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [otherPackages, setOtherPackages] = useState<OtherPackage[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  /* ── Navigation state (prev/next package) ── */
  const [siblingIds, setSiblingIds] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  /* ── Inline editing ── */
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  /* ── Customer reassignment ── */
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  /* ── Photo management ── */
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Modals ── */
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  /* ── Notes separate state ── */
  const [notesValue, setNotesValue] = useState("");

  /* ── Tags state ── */
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([]);
  const [packageTagIds, setPackageTagIds] = useState<string[]>([]);

  /* ── Select Dropdown State ── */
  const [selectDropdownField, setSelectDropdownField] = useState<string | null>(null);
  const [selectDropdownSearch, setSelectDropdownSearch] = useState("");
  const selectDropdownRef = useRef<HTMLDivElement>(null);

  /* ── Authenticated user ── */
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("");

  /* ── Load current user on mount ── */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single();
        if (profile) {
          setCurrentUserName(`${profile.first_name} ${profile.last_name}`);
        }
      }
    })();
  }, []);

  /* ── Activity log helper ── */
  const logActivity = useCallback(async (
    action: string,
    description: string,
    extra?: Record<string, unknown>
  ) => {
    if (!pkg) return;
    try {
      await supabase.from("activity_log").insert({
        org_id: pkg.org_id,
        package_id: packageId,
        user_id: currentUserId,
        action,
        metadata: { description, ...extra },
      });

      const { data: freshActivity } = await supabase
        .from("activity_log")
        .select("*, user:users(first_name, last_name)")
        .eq("package_id", packageId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (freshActivity) setActivityLog(freshActivity as ActivityLog[]);
    } catch (err) {
      logger.error("Error logging activity", err);
    }
  }, [pkg, packageId, currentUserId]);

  /* ============ DATA LOADING ============ */
  const loadPackageData = useCallback(async () => {
    if (!packageId) return;
    try {
      // Main package with relations
      const { data: pkgData, error: pkgError } = await supabase
        .from("packages")
        .select(
          `*,
          customer:users!packages_customer_id_fkey(id, first_name, last_name, email, customer_number, agent_id, agent:agents(id, name, agent_code, company_name)),
          courier_group:courier_groups(code, name),
          awb:awbs(id, awb_number, status),
          photos:package_photos(id, storage_url, storage_path, photo_type, sort_order),
          checked_in_user:users!packages_checked_in_by_fkey(first_name, last_name)`
        )
        .eq("id", packageId)
        .is("deleted_at", null)
        .single();

      if (pkgError || !pkgData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setPkg(pkgData as PackageDetail);
      setNotesValue(pkgData.notes || "");

      // Other packages for this customer
      const { data: otherPkgs } = await supabase
        .from("packages")
        .select("id, tracking_number, carrier, status, checked_in_at, weight, weight_unit")
        .eq("customer_id", pkgData.customer_id)
        .neq("id", packageId)
        .is("deleted_at", null)
        .order("checked_in_at", { ascending: false });
      if (otherPkgs) setOtherPackages(otherPkgs as OtherPackage[]);

      // Activity log
      const { data: activityData } = await supabase
        .from("activity_log")
        .select("*, user:users(first_name, last_name)")
        .eq("package_id", packageId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (activityData) setActivityLog(activityData as ActivityLog[]);

      // Siblings for navigation
      const { data: siblings } = await supabase
        .from("packages")
        .select("id")
        .eq("customer_id", pkgData.customer_id)
        .is("deleted_at", null)
        .order("checked_in_at", { ascending: false });

      if (siblings) {
        const ids = siblings.map(s => s.id);
        setSiblingIds(ids);
        setTotalCount(ids.length);
      }

      // Available tags
      const { data: tagsData } = await supabase
        .from("tag_definitions")
        .select("id, name, color")
        .eq("org_id", pkgData.org_id);
      if (tagsData) setAvailableTags(tagsData as TagDefinition[]);

      // Package tags
      const { data: pkgTags } = await supabase
        .from("package_tags")
        .select("tag_id")
        .eq("package_id", packageId);
      if (pkgTags) setPackageTagIds(pkgTags.map(pt => pt.tag_id));

      setLoading(false);
    } catch (err) {
      logger.error("Error loading package", err);
      setNotFound(true);
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => {
    loadPackageData();
  }, [loadPackageData]);

  /* ─────────────────── INLINE EDITING ─────────────────── */
  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(value);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const saveField = async (field: string, value: string) => {
    if (!pkg) return;
    setSaving(true);
    try {
      const updateData: Record<string, string | number | string[] | null> = {};

      if (field === "notes") {
        updateData.notes = value;
      } else if (field === "tracking_number") {
        updateData.tracking_number = value;
      } else if (field === "carrier") {
        updateData.carrier = value;
      } else if (field === "status") {
        updateData.status = value;
      } else if (field === "weight") {
        updateData.weight = value ? parseFloat(value) : null;
      } else if (field === "package_type") {
        updateData.package_type = value;
      } else if (field === "commodity") {
        updateData.commodity = value;
      } else if (field === "condition_tags") {
        updateData.condition_tags = value.split(",").map(t => t.trim()).filter(Boolean);
      } else if (field === "length" || field === "width" || field === "height") {
        updateData[field] = value ? parseFloat(value) : null;
      }

      const { error } = await supabase
        .from("packages")
        .update(updateData)
        .eq("id", packageId);

      if (error) throw error;

      setPkg({ ...pkg, ...updateData });
      setEditingField(null);
      setEditValue("");
      setSuccessMessage("Saved successfully");
      setTimeout(() => setSuccessMessage(""), 3000);

      await logActivity(
        "edited",
        `Updated ${field}: ${value}`,
        { field, value }
      );
    } catch (err) {
      logger.error("Error saving field", err);
    } finally {
      setSaving(false);
    }
  };

  /* ─────────────────── CUSTOMER REASSIGNMENT ─────────────────── */
  // Loads customers for the recipient dropdown. An empty query returns the
  // first page of active customers so opening the dropdown always shows
  // something — previously it rendered "No customers found" until you typed.
  const handleCustomerSearch = useCallback(async (query: string) => {
    if (!pkg) return;
    setLoadingCustomers(true);
    try {
      let builder = supabase
        .from("users")
        .select("id, first_name, last_name, email, customer_number")
        .eq("org_id", pkg.org_id)
        .is("deleted_at", null);

      const trimmed = query.trim();
      if (trimmed) {
        const term = `%${trimmed}%`;
        builder = builder.or(
          `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},customer_number.ilike.${term}`
        );
      }

      const { data: customers } = await builder
        .order("first_name", { ascending: true })
        .limit(50);

      if (customers) setCustomerOptions(customers as CustomerOption[]);
    } catch (err) {
      logger.error("Error searching customers", err);
    } finally {
      setLoadingCustomers(false);
    }
  }, [pkg]);

  // Debounced search. Runs both when the dropdown opens (to populate the
  // initial list) and as the user types.
  useEffect(() => {
    if (!pkg || !showCustomerDropdown) return;
    const timer = setTimeout(() => {
      handleCustomerSearch(customerSearch);
    }, customerSearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [customerSearch, pkg, showCustomerDropdown, handleCustomerSearch]);

  const reassignCustomer = async (customerId: string) => {
    if (!pkg) return;
    try {
      const { error } = await supabase
        .from("packages")
        .update({ customer_id: customerId })
        .eq("id", packageId);

      if (error) throw error;

      const { data: newCustomer } = await supabase
        .from("users")
        .select("id, first_name, last_name, email, customer_number")
        .eq("id", customerId)
        .single();

      if (newCustomer) {
        setPkg({ ...pkg, customer: { ...newCustomer, agent: pkg.customer?.agent ?? null }, customer_id: customerId });
        setShowCustomerDropdown(false);
        setCustomerSearch("");
        setSuccessMessage("Customer reassigned");
        setTimeout(() => setSuccessMessage(""), 3000);

        await logActivity(
          "reassigned",
          `Reassigned to customer: ${newCustomer.first_name} ${newCustomer.last_name}`
        );
      }
    } catch (err) {
      logger.error("Error reassigning customer", err);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    if (showCustomerDropdown) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [showCustomerDropdown]);

  // Close the FieldRow select dropdown on outside click or Escape key.
  useEffect(() => {
    if (!selectDropdownField) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // The dropdown and its trigger row both live inside a FieldRow with
      // data-field-row — if the click isn't inside the active row, close it.
      if (!target.closest(`[data-field-row="${selectDropdownField}"]`)) {
        setSelectDropdownField(null);
        setSelectDropdownSearch("");
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectDropdownField(null);
        setSelectDropdownSearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [selectDropdownField]);

  /* ─────────────────── PHOTO MANAGEMENT ─────────────────── */
  // Detect HEIC/HEIF (iPhone photos). Browsers can't render these in <img>
  // tags, so we reject them up-front with guidance instead of silently failing.
  const isHeicFile = (file: File): boolean =>
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === "image/heic" ||
    file.type === "image/heif";

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!pkg || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    setUploadingPhoto(true);

    const startingCount = pkg.photos?.length || 0;
    const newPhotos: PhotoRecord[] = [];
    let failures = 0;
    let heicRejected = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (isHeicFile(file)) {
          logger.warn(`Rejected HEIC file: ${file.name}`);
          heicRejected++;
          continue;
        }

        try {
          const formData = new FormData();
          formData.append("file", file);

          const uploadRes = await fetch("/api/upload-photo", {
            method: "POST",
            body: formData,
          });

          if (!uploadRes.ok) throw new Error("Upload failed");
          const { url, public_id } = await uploadRes.json();

          const { data: photo, error: photoError } = await supabase
            .from("package_photos")
            .insert({
              package_id: packageId,
              storage_url: url,
              storage_path: public_id,
              photo_type: "content",
              sort_order: startingCount + newPhotos.length,
            })
            .select()
            .single();

          if (photoError) throw photoError;

          newPhotos.push(photo as PhotoRecord);
          await logActivity("photo_added", "Added a package photo", { url });
        } catch (err) {
          logger.error(`Error uploading photo ${file.name}`, err);
          failures++;
        }
      }

      if (newPhotos.length > 0) {
        setPkg({ ...pkg, photos: [...(pkg.photos || []), ...newPhotos] });
      }

      // Build a user-facing message. HEIC rejections get a specific, actionable hint.
      if (heicRejected > 0 && newPhotos.length === 0 && failures === 0) {
        setErrorMessage(
          heicRejected === 1
            ? "HEIC photos aren't supported. On iPhone: Settings → Camera → Formats → Most Compatible, or export as JPEG first."
            : `${heicRejected} HEIC photos skipped. On iPhone: Settings → Camera → Formats → Most Compatible, or export as JPEG first.`
        );
        setTimeout(() => setErrorMessage(""), 8000);
      } else if (heicRejected > 0 && newPhotos.length > 0) {
        setErrorMessage(
          `Uploaded ${newPhotos.length} photo(s). Skipped ${heicRejected} HEIC file(s) — change iPhone camera format to "Most Compatible" or export as JPEG.`
        );
        setTimeout(() => setErrorMessage(""), 8000);
      } else if (failures === 0) {
        setSuccessMessage(
          newPhotos.length === 1 ? "Photo added" : `${newPhotos.length} photos added`
        );
        setTimeout(() => setSuccessMessage(""), 3000);
      } else if (newPhotos.length > 0) {
        setErrorMessage(`Uploaded ${newPhotos.length} of ${files.length} photos (${failures} failed)`);
        setTimeout(() => setErrorMessage(""), 4000);
      } else {
        setErrorMessage("Failed to upload photos");
        setTimeout(() => setErrorMessage(""), 4000);
      }
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!pkg) return;
    setDeletingPhotoId(photoId);
    try {
      const photoToDelete = pkg.photos?.find(p => p.id === photoId);
      if (photoToDelete?.storage_path) {
        await fetch("/api/delete-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_id: photoToDelete.storage_path }),
        });
      }

      await supabase.from("package_photos").delete().eq("id", photoId);

      const updatedPhotos = pkg.photos?.filter(p => p.id !== photoId) || [];
      setPkg({ ...pkg, photos: updatedPhotos });
      setSuccessMessage("Photo removed");
      setTimeout(() => setSuccessMessage(""), 3000);

      await logActivity("photo_deleted", "Removed a package photo");
    } catch (err) {
      logger.error("Error deleting photo", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to delete photo");
      setTimeout(() => setErrorMessage(""), 4000);
    } finally {
      setDeletingPhotoId(null);
    }
  };

  /* ─────────────────── TAGS MANAGEMENT ─────────────────── */
  const assignedTags = availableTags.filter(t => packageTagIds.includes(t.id));

  const addTagToPackage = async (tagId: string) => {
    if (!pkg) return;
    try {
      await supabase.from("package_tags").insert({
        package_id: packageId,
        tag_id: tagId,
      });

      setPackageTagIds([...packageTagIds, tagId]);
      setSuccessMessage("Tag added");
      setTimeout(() => setSuccessMessage(""), 3000);

      const tag = availableTags.find(t => t.id === tagId);
      if (tag) {
        await logActivity("tag_added", `Added tag: ${tag.name}`);
      }
    } catch (err) {
      logger.error("Error adding tag", err);
    }
  };

  const removeTagFromPackage = async (tagId: string) => {
    try {
      await supabase
        .from("package_tags")
        .delete()
        .eq("package_id", packageId)
        .eq("tag_id", tagId);

      setPackageTagIds(packageTagIds.filter(id => id !== tagId));
      setSuccessMessage("Tag removed");
      setTimeout(() => setSuccessMessage(""), 3000);

      const tag = availableTags.find(t => t.id === tagId);
      if (tag) {
        await logActivity("tag_removed", `Removed tag: ${tag.name}`);
      }
    } catch (err) {
      logger.error("Error removing tag", err);
    }
  };

  const createNewTagAndAdd = async (tagName: string, tagColor: string) => {
    if (!pkg || !tagName.trim()) return;
    try {
      const { data: newTag, error: tagError } = await supabase
        .from("tag_definitions")
        .insert({
          org_id: pkg.org_id,
          name: tagName.trim(),
          color: tagColor,
        })
        .select()
        .single();

      if (tagError) throw tagError;

      setAvailableTags([...availableTags, newTag as TagDefinition]);
      await addTagToPackage(newTag.id);
    } catch (err) {
      logger.error("Error creating tag", err);
    }
  };

  /* ─────────────────── MODALS & ACTIONS ─────────────────── */
  const handleDelete = async () => {
    if (!pkg) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("packages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", packageId);

      if (error) throw error;

      await logActivity("deleted", "Package deleted");
      router.push("/admin/packages");
    } catch (err) {
      logger.error("Error deleting package", err);
    } finally {
      setDeleting(false);
    }
  };

  const handleCheckout = async () => {
    if (!pkg) return;
    setCheckingOut(true);
    try {
      const { error } = await supabase
        .from("packages")
        .update({ status: "assigned_to_awb" })
        .eq("id", packageId);

      if (error) throw error;

      setPkg({ ...pkg, status: "assigned_to_awb" });
      setShowCheckoutModal(false);
      setSuccessMessage("Package checked out");
      setTimeout(() => setSuccessMessage(""), 3000);

      await logActivity("checked_out", "Package checked out to AWB");
    } catch (err) {
      logger.error("Error checking out package", err);
    } finally {
      setCheckingOut(false);
    }
  };

  const handlePrintLabel = () => {
    if (!pkg) return;
    window.open(`/api/print-label?id=${packageId}`, "_blank");
  };

  const handleNavigate = (id: string) => {
    router.push(`/admin/packages/${id}`);
  };

  const handleBack = () => {
    router.push("/admin/packages");
  };

  /* ─────────────────── KEY BINDINGS ─────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!editingField) return;
      if (e.key === "Enter") {
        saveField(editingField, editValue);
      } else if (e.key === "Escape") {
        cancelEdit();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editingField, editValue]);

  /* ============ LOADING / NOT FOUND ============ */
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={24} className="animate-spin text-txt-tertiary mx-auto mb-3" />
          <p className="text-txt-tertiary text-ui-sm">Loading package...</p>
        </div>
      </div>
    );
  }

  if (notFound || !pkg) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Package size={32} className="text-txt-tertiary mx-auto mb-3" />
          <p className="text-txt-primary text-ui mb-1">Package not found</p>
          <Link href="/admin/packages" className="text-primary text-ui-sm hover:underline">
            Back to Packages
          </Link>
        </div>
      </div>
    );
  }

  const sc = statusConfig[pkg.status] || statusConfig.checked_in;
  const truncatedId = pkg.id.substring(0, 8).toUpperCase();
  const sortedPhotos = [...(pkg.photos || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const currentIndex = siblingIds.indexOf(packageId);
  const prevId = currentIndex > 0 ? siblingIds[currentIndex - 1] : null;
  const nextId = currentIndex < siblingIds.length - 1 ? siblingIds[currentIndex + 1] : null;

  /* ─────────── Editable Field Row Component ─────────── */
  const FieldRow = ({
    field,
    label,
    icon: Icon,
    value,
    displayValue,
    editable = true,
    type = "text",
    selectOptions,
    mono = false,
    suffix,
  }: {
    field: string;
    label: string;
    icon: typeof Package;
    value: string;
    displayValue?: React.ReactNode;
    editable?: boolean;
    type?: "text" | "number" | "select" | "textarea";
    selectOptions?: { value: string; label: string; color?: string; dot?: string }[];
    mono?: boolean;
    suffix?: string;
  }) => {
    const isEditing = editingField === field;
    const isDropdownOpen = selectDropdownField === field;
    const showSearch = selectOptions && selectOptions.length > 5;
    const filteredOptions = selectOptions?.filter(
      (opt) => opt.label.toLowerCase().includes(selectDropdownSearch.toLowerCase())
    );

    return (
      <div
        data-field-row={field}
        className={`group relative flex items-center min-h-[42px] px-3 -mx-3 rounded-md transition-all duration-100
          ${editable && !isEditing && !isDropdownOpen ? "cursor-pointer hover:bg-primary/5 hover:shadow-[inset_0_0_0_1px_var(--primary)]" : ""}
          ${isEditing || isDropdownOpen ? "bg-white shadow-[inset_0_0_0_1.5px_var(--primary)] rounded-md" : ""}
        `}
        onClick={() => {
          if (!editable) return;
          if (type === "select" && selectOptions) {
            if (isDropdownOpen) {
              setSelectDropdownField(null);
              setSelectDropdownSearch("");
            } else {
              setSelectDropdownField(field);
              setSelectDropdownSearch("");
            }
          } else if (!isEditing) {
            startEdit(field, value);
          }
        }}
      >
        <div className="flex items-center gap-2 w-[160px] shrink-0">
          <Icon size={15} className="shrink-0 text-txt-secondary" />
          <span className="text-muted tracking-tight truncate text-txt-secondary">{label}</span>
        </div>

        <div className="flex-1 min-w-0 ml-2">
          {isEditing && type !== "select" ? (
            <div className="flex items-center gap-1.5">
              {type === "textarea" ? (
                <textarea
                  ref={editInputRef as React.RefObject<HTMLTextAreaElement>}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => saveField(field, editValue)}
                  className="flex-1 px-2 py-1.5 text-ui border border-primary rounded-md outline-none resize-none"
                  rows={3}
                />
              ) : (
                <input
                  ref={editInputRef as React.RefObject<HTMLInputElement>}
                  type={type}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => saveField(field, editValue)}
                  className="flex-1 px-2 py-1.5 text-ui border border-primary rounded-md outline-none"
                />
              )}
              {saving && <Loader2 size={14} className="animate-spin text-primary" />}
            </div>
          ) : (
            <span className={`text-ui ${mono ? "font-mono" : ""} text-txt-primary`}>
              {displayValue !== undefined ? displayValue : value || "—"}
              {suffix && <span className="text-txt-tertiary ml-1">{suffix}</span>}
            </span>
          )}
        </div>

        {/* Floating dropdown popover — absolute so it doesn't push layout.
            Aligned to the value column (label column is 160px + 8px gap) and
            width-capped so it looks like a menu, not a bar. */}
        {isDropdownOpen && selectOptions && (
          <div
            className="absolute left-[168px] top-full mt-1 z-50 w-[260px] max-w-[calc(100%-168px)] bg-white border border-border rounded-md shadow-lg p-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {showSearch && (
              <input
                type="text"
                placeholder="Search..."
                value={selectDropdownSearch}
                onChange={(e) => setSelectDropdownSearch(e.target.value)}
                className="w-full px-2 py-1.5 mb-1 text-ui-sm border border-border rounded-md outline-none"
                autoFocus
              />
            )}
            <div className="max-h-[240px] overflow-y-auto">
              {filteredOptions?.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    saveField(field, opt.value);
                    setSelectDropdownField(null);
                  }}
                  className={`w-full text-left px-2 py-1.5 text-ui hover:bg-primary/10 rounded transition-colors ${
                    opt.value === value ? "bg-primary/10 font-semibold" : ""
                  }`}
                >
                  {opt.dot && (
                    <span
                      className={`inline-block w-2 h-2 rounded-full mr-2 ${opt.dot}`}
                    />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*                              RENDER                                    */
  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="h-full flex flex-col bg-[#f5f5f6] overflow-hidden">
      {/* ── Success Toast ── */}
      {successMessage && (
        <div className="fixed bottom-6 right-6 z-[60] bg-[#252527] text-white px-4 py-3 rounded-lg flex items-center gap-2 text-ui shadow-lg" style={{ animation: "toast-in 0.2s ease" }}>
          <CheckCircle2 size={14} />
          {successMessage}
        </div>
      )}

      {/* ── Error Toast ── */}
      {errorMessage && (
        <div className="fixed bottom-6 right-6 z-[60] bg-red-600 text-white px-4 py-3 rounded-lg flex items-center gap-2 text-ui shadow-lg" style={{ animation: "toast-in 0.2s ease" }}>
          <AlertTriangle size={14} />
          {errorMessage}
        </div>
      )}

      {/* ── Photo Lightbox ── */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            onClick={() => setLightboxPhoto(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <X size={24} />
          </button>
          <img src={lightboxPhoto} alt="Package photo" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}

      {/* ── Delete Modal ── */}
      {showDeleteModal && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-ui font-semibold text-txt-primary">Delete package</h3>
                <p className="text-muted text-txt-secondary mt-1">
                  Permanently delete <span className="font-mono text-txt-primary">{pkg.tracking_number}</span>? All photos and activity logs will also be removed.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowDeleteModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="btn-primary bg-red-500 hover:bg-red-500/90 text-white flex items-center gap-2 cursor-pointer">
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Checkout Modal ── */}
      {showCheckoutModal && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-ui font-semibold text-txt-primary">Check out package</h3>
                <p className="text-muted text-txt-secondary mt-1">
                  Check out <span className="font-mono text-txt-primary">{pkg.tracking_number}</span>? This changes its status to &quot;Assigned to AWB&quot;.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowCheckoutModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
              <button onClick={handleCheckout} disabled={checkingOut} className="btn-primary flex items-center gap-2 cursor-pointer">
                {checkingOut && <Loader2 size={14} className="animate-spin" />}
                Check Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────── PACKAGE HEADER ─────────────── */}
      <PackageHeader
        trackingNumber={pkg.tracking_number}
        status={pkg.status}
        currentIndex={currentIndex}
        totalCount={totalCount}
        prevId={prevId}
        nextId={nextId}
        onCheckout={() => setShowCheckoutModal(true)}
        onPrintLabel={handlePrintLabel}
        onDelete={() => setShowDeleteModal(true)}
        onBack={handleBack}
        onNavigate={handleNavigate}
      />

      {/* ─────────────── TWO-COLUMN BODY ─────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1280px] mx-auto px-4 py-5">
          <div className="flex gap-5 flex-col lg:flex-row">

            {/* ═══════ LEFT PANEL — Detail Form ═══════ */}
            <div className="flex-1 min-w-0 space-y-4">

              {/* ── Recipient Block ── */}
              <div className="bg-white border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-ui font-semibold text-txt-primary tracking-tight flex items-center gap-1.5">
                    <User size={14} className="text-txt-tertiary" />
                    Recipient
                  </p>
                </div>

                {pkg.customer ? (
                  <div className="relative" ref={customerDropdownRef}>
                    <div
                      className="flex items-center gap-3 p-2 -mx-2 rounded-md cursor-pointer hover:bg-primary/5 hover:shadow-[inset_0_0_0_1px_var(--primary)] transition-all duration-100"
                      onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary text-ui-sm font-semibold">
                          {pkg.customer.first_name[0]}{pkg.customer.last_name[0]}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-ui text-txt-primary truncate">
                          {pkg.customer.first_name} {pkg.customer.last_name}
                          {pkg.customer.customer_number && (
                            <span className="ml-2 text-meta font-mono text-primary bg-primary/8 px-1.5 py-0.5 rounded">
                              {pkg.customer.customer_number}
                            </span>
                          )}
                        </p>
                        <p className="text-meta text-txt-tertiary truncate">{pkg.customer.email}</p>
                      </div>
                      <ChevronRight size={14} className={`text-txt-tertiary transition-transform ${showCustomerDropdown ? "rotate-90" : ""}`} />
                    </div>

                    {showCustomerDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-[1000] overflow-hidden">
                        <div className="p-2.5 border-b border-border-light">
                          <div className="flex items-center gap-2.5 px-2.5 py-2 bg-surface-secondary rounded-md">
                            <Search size={14} className="text-txt-tertiary shrink-0" />
                            <input
                              type="text"
                              value={customerSearch}
                              onChange={(e) => setCustomerSearch(e.target.value)}
                              placeholder="Search customers..."
                              className="flex-1 bg-transparent text-ui outline-none"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-[280px] overflow-y-auto py-1">
                          {loadingCustomers ? (
                            <div className="py-4 text-center">
                              <Loader2 size={14} className="animate-spin text-txt-tertiary mx-auto" />
                            </div>
                          ) : customerOptions.length === 0 ? (
                            <p className="py-4 text-center text-ui text-txt-tertiary">No customers found</p>
                          ) : (
                            customerOptions.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => reassignCustomer(c.id)}
                                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors cursor-pointer
                                  ${c.id === pkg.customer_id ? "bg-primary/5" : "hover:bg-surface-hover"}`}
                              >
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary text-meta">
                                  {c.first_name[0]}{c.last_name[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-ui text-txt-primary">{c.first_name} {c.last_name}</p>
                                  <p className="text-meta text-txt-tertiary truncate">{c.email}</p>
                                </div>
                                {c.id === pkg.customer_id && <Check size={14} className="text-primary shrink-0" />}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-txt-tertiary text-muted">No customer assigned</p>
                )}
              </div>

              {/* ── Agent Block ── */}
              {pkg.customer?.agent && (
                <div className="bg-white border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-ui font-semibold text-txt-primary tracking-tight flex items-center gap-1.5">
                      <Building2 size={14} className="text-txt-tertiary" />
                      Agent
                    </p>
                  </div>
                  <div className="flex items-center gap-3 p-2 -mx-2 rounded-md">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary text-ui-sm font-semibold">
                        {pkg.customer.agent.name[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-ui text-txt-primary truncate">
                        {pkg.customer.agent.name}
                        {pkg.customer.agent.agent_code && (
                          <span className="ml-2 text-meta font-mono text-primary bg-primary/8 px-1.5 py-0.5 rounded">
                            {pkg.customer.agent.agent_code}
                          </span>
                        )}
                      </p>
                      {pkg.customer.agent.company_name && (
                        <p className="text-meta text-txt-tertiary truncate">{pkg.customer.agent.company_name}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Images Block (using PhotoGallery component) ── */}
              <PhotoGallery
                photos={sortedPhotos}
                uploadingPhoto={uploadingPhoto}
                deletingPhotoId={deletingPhotoId}
                onUpload={() => fileInputRef.current?.click()}
                onDelete={handleDeletePhoto}
                onLightbox={setLightboxPhoto}
                fileInputRef={fileInputRef}
                onFileChange={handlePhotoUpload}
              />

              {/* ── Package Details Block ── */}
              <div className="bg-white border border-border rounded-lg p-4">
                <p className="text-ui font-semibold text-txt-primary tracking-tight mb-2 flex items-center gap-1.5">
                  <Package size={14} className="text-txt-tertiary" />
                  Package Details
                </p>

                <div className="divide-y divide-border-light">
                  <FieldRow field="package_id" label="Package ID" icon={Hash} value={truncatedId} editable={false} mono />
                  <FieldRow field="tracking_number" label="Tracking Number" icon={Tag} value={pkg.tracking_number} mono />
                  <FieldRow
                    field="carrier"
                    label="Carrier"
                    icon={Truck}
                    value={pkg.carrier || ""}
                    displayValue={
                      pkg.carrier ? (
                        <span className="courier-badge text-xs">{pkg.carrier}</span>
                      ) : undefined
                    }
                    type="select"
                    selectOptions={STANDARD_CARRIERS}
                  />
                  <FieldRow
                    field="courier_group"
                    label="Agent"
                    icon={Plane}
                    value={pkg.courier_group ? `${pkg.courier_group.code} — ${pkg.courier_group.name}` : "—"}
                    editable={false}
                  />
                  <FieldRow
                    field="status"
                    label="Status"
                    icon={CheckCircle2}
                    value={pkg.status}
                    displayValue={<span className={`status-badge text-xs ${sc.bg} ${sc.text}`}><span className={`status-dot ${sc.dot}`} />{sc.label}</span>}
                    type="select"
                    selectOptions={Object.entries(statusConfig).map(([k, v]) => ({
                      value: k,
                      label: v.label,
                      dot: v.dot,
                    }))}
                  />
                  <FieldRow
                    field="weight"
                    label="Weight"
                    icon={Scale}
                    value={pkg.weight?.toString() || ""}
                    suffix={pkg.weight_unit}
                    type="number"
                  />
                  <FieldRow
                    field="length"
                    label="Length"
                    icon={Ruler}
                    value={pkg.length?.toString() || ""}
                    suffix={pkg.dim_unit}
                    type="number"
                  />
                  <FieldRow
                    field="width"
                    label="Width"
                    icon={Layers}
                    value={pkg.width?.toString() || ""}
                    suffix={pkg.dim_unit}
                    type="number"
                  />
                  <FieldRow
                    field="height"
                    label="Height"
                    icon={Box}
                    value={pkg.height?.toString() || ""}
                    suffix={pkg.dim_unit}
                    type="number"
                  />
                  {(pkg.length || pkg.width || pkg.height) && (
                    <FieldRow
                      field="volume_weight"
                      label="Volume Weight"
                      icon={Layers}
                      value={
                        computeVolumeWeight(pkg.length, pkg.width, pkg.height, pkg.dim_unit)?.toString() || "—"
                      }
                      editable={false}
                      suffix={pkg.weight_unit}
                    />
                  )}
                  <FieldRow
                    field="package_type"
                    label="Package Type"
                    icon={Package}
                    value={pkg.package_type || ""}
                    type="select"
                    selectOptions={PACKAGE_TYPES}
                  />
                  <FieldRow
                    field="commodity"
                    label="Commodity"
                    icon={FileText}
                    value={pkg.commodity || ""}
                    type="select"
                    selectOptions={COMMODITIES}
                  />
                </div>
              </div>

              {/* ── Condition Tags Block ── */}
              <div className="bg-white border border-border rounded-lg p-4">
                <p className="text-ui font-semibold text-txt-primary tracking-tight mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-txt-tertiary" />
                  Condition Tags
                </p>
                <FieldRow
                  field="condition_tags"
                  label="Tags"
                  icon={Tag}
                  value={pkg.condition_tags?.join(", ") || ""}
                />
              </div>

              {/* ── Notes Block ── */}
              <div className="bg-white border border-border rounded-lg p-4">
                <p className="text-ui font-semibold text-txt-primary tracking-tight mb-2 flex items-center gap-1.5">
                  <FileText size={14} className="text-txt-tertiary" />
                  Notes
                </p>
                <div
                  className="group relative flex items-start px-3 -mx-3 py-2 rounded-md transition-all duration-100 cursor-pointer hover:bg-primary/5 hover:shadow-[inset_0_0_0_1px_var(--primary)]"
                  onClick={() => startEdit("notes", notesValue)}
                >
                  {editingField !== "notes" ? (
                    <p className={`text-ui flex-1 ${notesValue ? "text-txt-primary" : "text-txt-placeholder"}`}>
                      {notesValue || "No notes"}
                    </p>
                  ) : (
                    <textarea
                      ref={editInputRef as React.RefObject<HTMLTextAreaElement>}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => {
                        saveField("notes", editValue);
                        setNotesValue(editValue);
                      }}
                      className="flex-1 px-2 py-1.5 text-ui border border-primary rounded-md outline-none resize-none"
                      rows={4}
                      autoFocus
                    />
                  )}
                </div>
              </div>

              {/* ── Associated Packages ── */}
              {otherPackages.length > 0 && (
                <div className="bg-white border border-border rounded-lg p-4">
                  <p className="text-ui font-semibold text-txt-primary tracking-tight mb-3 flex items-center gap-1.5">
                    <Package size={14} className="text-txt-tertiary" />
                    Associated Packages
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-ui-sm">
                      <thead>
                        <tr className="border-b border-border-light">
                          <th className="text-left py-2 px-2 font-medium text-txt-secondary">Tracking</th>
                          <th className="text-left py-2 px-2 font-medium text-txt-secondary">Carrier</th>
                          <th className="text-left py-2 px-2 font-medium text-txt-secondary">Status</th>
                          <th className="text-left py-2 px-2 font-medium text-txt-secondary">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {otherPackages.map((p) => {
                          const psc = statusConfig[p.status] || statusConfig.checked_in;
                          return (
                            <tr key={p.id} className="border-b border-border-light hover:bg-surface-hover">
                              <td className="py-2 px-2">
                                <Link
                                  href={`/admin/packages/${p.id}`}
                                  className="text-primary hover:underline font-mono text-meta"
                                >
                                  {p.tracking_number}
                                </Link>
                              </td>
                              <td className="py-2 px-2 text-txt-secondary">{p.carrier}</td>
                              <td className="py-2 px-2">
                                <span className={`status-badge text-xs ${psc.bg} ${psc.text}`}>
                                  <span className={`status-dot ${psc.dot}`} />
                                  {psc.label}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-txt-secondary">
                                {p.weight ? `${p.weight} ${p.weight_unit}` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Tags Section (using TagsSection component) ── */}
              <TagsSection
                packageId={packageId}
                orgId={pkg.org_id}
                assignedTags={assignedTags}
                availableTags={availableTags}
                onAddTag={addTagToPackage}
                onRemoveTag={removeTagFromPackage}
                onCreateAndAdd={createNewTagAndAdd}
                saving={saving}
              />
            </div>

            {/* ═══════ RIGHT PANEL — Activity Timeline (using ActivityTimeline component) ═══════ */}
            <ActivityTimeline
              activityLog={activityLog}
              checkedInUser={pkg.checked_in_user}
              checkedInAt={pkg.checked_in_at}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
