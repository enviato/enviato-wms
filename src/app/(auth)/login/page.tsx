"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { Mail, ArrowRight, Loader2, KeyRound, ArrowLeft } from "lucide-react";

/**
 * Passwordless email OTP-code login.
 *
 * Two-step flow:
 *   1. User enters email
 *   2. supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
 *      asks Supabase to email a code (the email template must render
 *      `{{ .Token }}` for this to work — the link is unused in this flow)
 *   3. User enters the 6-digit code
 *   4. supabase.auth.verifyOtp({ email, token, type: "email" }) validates it
 *   5. On success, the SDK stores the session in browser cookies and we
 *      redirect to /admin
 *
 * Why OTP code instead of magic link:
 *   - Magic links use PKCE, which requires the same browser session that
 *     started the request to also click the link. Real users open emails on
 *     phones, work browsers, mail security gateways, etc., causing
 *     "otp_expired" failures whenever the click happens in a different
 *     browser context. OTP codes are immune: the user types the code into
 *     the same browser they started in, so cookies stay aligned.
 *
 * `shouldCreateUser: false` is critical — without it, anyone could request
 * a code for any email and Supabase would create a new auth account on the
 * fly. We require the user to already exist (created via invite-user).
 */
type Step = "email" | "code";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: {
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
        } else if (
          message.includes("rate") ||
          message.includes("limit") ||
          message.includes("security purposes")
        ) {
          setError("Too many attempts. Please wait a minute and try again.");
        } else {
          setError(
            otpError.message || "Failed to send code. Please try again."
          );
        }
        setLoading(false);
        return;
      }

      setStep("code");
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.toLowerCase().trim(),
        token: code.trim(),
        type: "email",
      });

      if (verifyError) {
        const message = verifyError.message?.toLowerCase() ?? "";
        if (message.includes("expired")) {
          setError(
            "That code expired. Click 'Use a different email' to request a new one."
          );
        } else if (
          message.includes("invalid") ||
          message.includes("incorrect")
        ) {
          setError("Invalid code. Check the email and try again.");
        } else {
          setError(
            verifyError.message || "Failed to verify code. Please try again."
          );
        }
        setLoading(false);
        return;
      }

      // Success — session is stored. Hard redirect so server gets the cookie.
      window.location.href = "/admin";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep("email");
    setCode("");
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
                Enter your email and we&apos;ll send you a sign-in code.
              </p>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
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
                      Send sign-in code
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {step === "code" && (
            <>
              <h2 className="text-ui font-semibold text-txt-primary mb-1">
                Enter your sign-in code
              </h2>
              <p className="text-txt-secondary text-ui-sm mb-6">
                We sent a sign-in code to{" "}
                <strong className="text-txt-primary">{email}</strong>. Check
                your inbox (and spam folder).
              </p>

              <form onSubmit={handleCodeSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="code"
                    className="block text-ui-sm text-txt-primary mb-2"
                  >
                    Sign-in code
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-tertiary" />
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6,10}"
                      maxLength={10}
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="Enter the code from your email"
                      required
                      autoFocus
                      autoComplete="one-time-code"
                      className="w-full bg-surface-secondary border border-border rounded-md pl-10 pr-4 py-2 text-txt-primary text-ui tracking-widest placeholder:text-txt-secondary focus:outline-none focus:bg-white focus:border-border transition-all duration-200"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-brand-red text-ui-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="w-full bg-brand-dark hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-md flex items-center justify-center gap-2 transition-colors duration-200 cursor-pointer text-ui shadow-sm"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Verify and sign in
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full flex items-center justify-center gap-1 text-brand-dark text-ui-sm hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Use a different email
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-txt-secondary text-meta mt-6">
          Secure passwordless authentication via email
        </p>
      </div>
    </div>
  );
}
