"use client";

import { useEffect } from "react";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Auth error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background-light">
      <div className="bg-white rounded-lg border border-border shadow-sm p-8 max-w-md w-full text-center">
        <h2 className="text-lg font-bold text-slate-800 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          We couldn&apos;t load this page. Please try again.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <a href="/login" className="btn-secondary">
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}
