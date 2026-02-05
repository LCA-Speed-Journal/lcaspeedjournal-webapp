"use client";

import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageBackground } from "@/app/components/PageBackground";

function LoginForm() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      pin,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid PIN");
      return;
    }
    window.location.href = callbackUrl;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs space-y-4 rounded-lg border-2 border-border/80 bg-surface p-6 shadow-lg shadow-black/20 ring-1 ring-white/5" style={{ boxShadow: "0 0 12px 2px rgba(255,255,255,0.04), 0 20px 40px -10px rgba(0,0,0,0.25)" }}
      >
        <h1 className="text-xl font-semibold text-foreground tracking-tight">
          Coach Login
        </h1>
        <p className="text-sm text-foreground-muted">Enter your PIN to continue.</p>
        <div>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-foreground placeholder:text-foreground-muted focus:border-accent focus:ring-1 focus:ring-accent"
            autoFocus
            disabled={loading}
          />
        </div>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent py-2 font-medium text-background hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-center">
          <Link href="/" className="text-sm text-accent hover:text-accent-hover">
            ← Home
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background text-foreground-muted">
          <PageBackground />
          <span className="relative z-10">Loading...</span>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
