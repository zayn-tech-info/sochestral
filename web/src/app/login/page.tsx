"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ProductMotionProvider } from "@/components/app/product-motion-provider";
import { AuthLayout, LoginForm } from "@/components/auth";
import { apiBase } from "@/lib/product-api";

function safeReturnTo(): string {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  return value?.startsWith("/app") && !value.startsWith("//")
    ? value
    : "/app/workspace";
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmitCredentials(input: {
    email: string;
    password: string;
    remember: boolean;
  }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: input.email,
          password: input.password,
        }),
      });
      // remember is UI-only until session persistence preferences ship
      void input.remember;
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(
          body.error === "INVALID_CREDENTIALS"
            ? "That email and password do not match."
            : "Sign in could not be completed.",
        );
        return;
      }
      router.replace(safeReturnTo());
    } catch {
      setError("The Sochestral API is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProductMotionProvider>
      <AuthLayout>
        <LoginForm
          onSubmitCredentials={onSubmitCredentials}
          busy={busy}
          error={error}
        />
      </AuthLayout>
    </ProductMotionProvider>
  );
}
