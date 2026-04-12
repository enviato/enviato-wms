"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { Mail, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "success">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Failed to sign in");
        setLoading(false);
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      setStep("success");
      setTimeout(() => {
        window.location.href = "/admin";
      }, 1000);
    } catch (err) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
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
              <path
                d="M 32 8 L 56 40 L 40 40 Z"
                fill="#00bbf9"
              />
              {/* Red triangle (bottom-left) */}
              <path
                d="M 32 56 L 8 24 L 24 24 Z"
                fill="#ff495c"
              />
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
                Enter your email to access the dashboard
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
                      Sign in
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {step === "success" && (
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <h2 className="text-ui font-semibold text-txt-primary mb-1">
                You&apos;re in!
              </h2>
              <p className="text-txt-secondary text-ui-sm">
                Redirecting to your dashboard...
              </p>
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
