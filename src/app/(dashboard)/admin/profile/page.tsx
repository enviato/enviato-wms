"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { User, Mail, Phone, Save, LogOut, Loader2, CheckCircle2, Shield } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [userId, setUserId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        setUserId(user.id);
        setEmail(user.email || "");

        // Fetch user profile from users table
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("first_name, last_name, phone, role_v2")
          .eq("id", user.id)
          .single();

        if (userError) {
          setError("Failed to load profile");
          console.error(userError);
          return;
        }

        if (userData) {
          setFirstName(userData.first_name || "");
          setLastName(userData.last_name || "");
          setPhone(userData.phone || "");
          setRole(userData.role_v2 || "");
        }
      } catch (err) {
        setError("An error occurred while loading your profile");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [supabase, router]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const { error: updateError } = await supabase
        .from("users")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone,
        })
        .eq("id", userId);

      if (updateError) {
        setError("Failed to save changes");
        console.error(updateError);
        setSaving(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError("An error occurred while saving");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      setError("Failed to sign out");
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-lg mx-auto">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-txt-primary">My Profile</h1>
          <p className="text-txt-secondary mt-2">Manage your account information</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-border rounded-lg p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
              <div className="text-red-600 text-ui-sm">{error}</div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3 items-center">
              <CheckCircle2 size={18} className="text-green-600 shrink-0" />
              <div className="text-green-700 text-ui">Changes saved successfully</div>
            </div>
          )}

          {/* First Name */}
          <div>
            <label className="block text-ui-sm font-semibold text-txt-primary mb-2">
              <div className="flex items-center gap-2">
                <User size={16} />
                First Name
              </div>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Enter your first name"
              className="form-input w-full"
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-ui-sm font-semibold text-txt-primary mb-2">
              <div className="flex items-center gap-2">
                <User size={16} />
                Last Name
              </div>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Enter your last name"
              className="form-input w-full"
            />
          </div>

          {/* Email (Read-only) */}
          <div>
            <label className="block text-ui-sm font-semibold text-txt-primary mb-2">
              <div className="flex items-center gap-2">
                <Mail size={16} />
                Email
              </div>
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="form-input w-full bg-slate-50 text-txt-secondary cursor-not-allowed"
            />
            <p className="text-meta text-txt-tertiary mt-1">Email cannot be changed</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-ui-sm font-semibold text-txt-primary mb-2">
              <div className="flex items-center gap-2">
                <Phone size={16} />
                Phone
              </div>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter your phone number"
              className="form-input w-full"
            />
          </div>

          {/* Role Badge (Read-only) */}
          <div>
            <label className="block text-ui-sm font-semibold text-txt-primary mb-2">
              <div className="flex items-center gap-2">
                <Shield size={16} />
                Role
              </div>
            </label>
            <div className="flex items-center gap-2">
              <div className="px-3 py-2 bg-primary/10 text-primary rounded-lg text-ui capitalize">
                {role?.replace(/_/g, " ").toLowerCase() || "—"}
              </div>
            </div>
            <p className="text-meta text-txt-tertiary mt-1">Contact your administrator to change your role</p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2 cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                Save Changes
              </>
            )}
          </button>

          {/* Divider */}
          <div className="border-t border-border pt-6">
            <p className="text-ui-sm text-txt-secondary mb-3">
              Ready to leave? You can sign out here.
            </p>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors cursor-pointer font-medium"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
