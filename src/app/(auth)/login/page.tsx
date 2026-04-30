"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { Mail, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

/**
 * Passwordless email magic-link login.
 *
 * Flow:
 *   1. User enters email
 *   2. supabase.auth.signInWithOtp() asks Supabase to send a one-time link
 *   3. Supabase emails a link like https://<this-host>/auth/callback?code=<verifier>
 *   4. User clicks the link in their inbox
 *   5. /auth/callback exchanges the code for a session (see route.ts)
 *
 * `shouldCreateUser: false` is critical — without it, anyone could request a
 * link for any email and Supabase would create a new auth account on the fly.
 * We require the user to already exist (created via the invite-user flow).
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "sent">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      });

      if (otpError) {
        const message = otpError.message?.toLowerCase() ?? "";
        if (
          message.includes("not found") ||
          message.includes("user does not exist") ||
          message.includes("signups not allowed") ||
          message.includes("invalid login")
        ) {
          setError(
            "No account found with that email. Contact your administrator if you should have access."
          );
        } else if (message.includes("rate") || message.includes("limit")) {
          setError(
            "Too many attempts. Please wait a few minutes and try again."
          );
        } else {
          setError(
            otpError.message || "Failed to send sign-in link. Please try again."
          );
        }
        setLoading(false);
        return;
      }

      setStep("sent");
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleTryAgain = () => {
    setStep("email");
    setEmail("");
    setError("");
  };

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo with SVG */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <svg
              className="w-16 h-16"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Blue triangle (top-right) */}
              <path d="M 32 8 L 56 40 L 40 40 Z" fill="#00bbf9" />
              {/* Red triangle (bottom-left) */}
              <path d="M 32 56 L 8 24 L 24 24 Z" fill="#ff495c" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-txt-primary">
            enviato
          </h1>
          <p className="text-txt-tertiary text-meta mt-1">
            Package Forwarding Platform
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-border rounded-md p-7 shadow-sm">
          {step === "email" && (
            <>
              <h2 className="text-ui font-semibold text-txt-primary mb-1">
                Sign in to your account
              </h2>
              <p className="text-txt-secondary text-ui-sm mb-6">
                Enter your email and we&apos;ll send you a secure sign-in link.
              </p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-ui-sm text-txt-primary mb-2"
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-tertiary" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      autoFocus
                      className="w-full bg-surface-secondary border border-border rounded-md pl-10 pr-4 py-2 text-txt-primary text-ui placeholder:text-txt-secondary focus:outline-none focus:bg-white focus:border-border transition-all duration-200"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-brand-red text-ui-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full bg-brand-dark hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-md flex items-center justify-center gap-2 transition-colors duration-200 cursor-pointer text-ui shadow-sm"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Send sign-in link
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {step === "sent" && (
            <div className="text-center py-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <h2 className="text-ui font-semibold text-txt-primary mb-1">
                Check your email
              </h2>
              <p className="text-txt-secondary text-ui-sm mb-4">
                We sent a sign-in link to{" "}
                <strong className="text-txt-primary">{email}</strong>. Click
                the link to access your dashboard.
              </p>
              <p className="text-txt-tertiary text-meta mb-5">
                The link expires in 1 hour. Check your spam folder if you
                don&apos;t see it.
              </p>
              <button
                onClick={handleTryAgain}
                className="text-brand-dark text-ui-sm hover:underline cursor-pointer"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-txt-secondary text-meta mt-6">
          Secure passwordless authentication via email
        </p>
      </div>
    </div>
  );
}
