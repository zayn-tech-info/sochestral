"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { apiBase } from "@/lib/product-api";
import { Brand } from "@/components/app/brand";
import {
  ProductMotionProvider,
  productMotion,
} from "@/components/app/product-motion-provider";

function safeReturnTo(): string {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  return value?.startsWith("/app") && !value.startsWith("//") ? value : "/app";
}

export default function LoginPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
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
      <main id="main-content" className="login-page">
        <a href="#login-form" className="skip-link">
          Skip to sign in
        </a>
        <section className="login-shell" aria-labelledby="sign-in-title">
          <motion.header
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={productMotion.enter}
            className="login-header"
          >
            <Brand />
            <p>Thoughtful social media work, shaped through conversation.</p>
          </motion.header>
          <motion.form
            id="login-form"
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              ...productMotion.enter,
              delay: reduceMotion ? 0 : 0.04,
            }}
            className="login-card"
          >
          <h1 id="sign-in-title">Welcome back</h1>
          <p>Sign in to continue your conversations and connected channel work.</p>

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
          />

            <AnimatePresence initial={false}>
              {error ? (
                <motion.div
                  key={error}
                  id="login-error"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={productMotion.quick}
                  className="login-error"
                  role="alert"
                >
                  <CircleAlert className="size-4" aria-hidden="true" />
                  {error}
                </motion.div>
              ) : null}
            </AnimatePresence>

          <button type="submit" disabled={busy}>
            {busy ? "Signing in" : "Enter workspace"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
          <small>
            Access is available to provisioned product users during this
            release.
          </small>
          </motion.form>
          <motion.footer
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              ...productMotion.enter,
              delay: reduceMotion ? 0 : 0.08,
            }}
            className="login-footnote"
          >
            Safe previews by default. Connected account tokens stay in
            SocialMCP.
          </motion.footer>
        </section>
      </main>
    </ProductMotionProvider>
  );
}
