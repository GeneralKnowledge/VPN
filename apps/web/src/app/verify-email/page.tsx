"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/logo";

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [msg, setMsg] = useState("Verifying…");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setMsg("Missing token");
      return;
    }
    void fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      if (res.ok) {
        setMsg("Email verified. Redirecting…");
        setTimeout(() => router.push("/dashboard"), 800);
      } else {
        const data = await res.json();
        setMsg(data.error ?? "Verification failed");
      }
    });
  }, [params, router]);

  return (
    <div className="hero-mesh flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <Logo />
        <p className="mt-6 text-muted">{msg}</p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
