"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleAlert, LockKeyhole, Mail } from "lucide-react";

import { Brand } from "@/components/app/brand";
import { productMotion } from "@/components/app/product-motion-provider";
import { GradientButton } from "@/components/auth/gradient-button";
import { InputField } from "@/components/auth/input-field";
import { SocialButtons } from "@/components/auth/social-buttons";
import { cn } from "@/lib/utils";

type LoginFormProps = {
  className?: string;
  onSubmitCredentials: (input: {
    email: string;
    password: string;
    remember: boolean;
  }) => Promise<void>;
  busy: boolean;
  error: string | null;
};

export function LoginForm({
  className,
  onSubmitCredentials,
  busy,
  error,
}: LoginFormProps) {
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await onSubmitCredentials({ email, password, remember });
  }

  return (
    <motion.div
      className={cn("auth-form-panel", className)}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        ...productMotion.enter,
        duration: reduceMotion ? 0.2 : 0.4,
      }}
    >
      <div className="auth-form-brand">
        <Brand />
      </div>

      <header className="auth-form-header">
        <p className="auth-eyebrow">Sochestral workspace</p>
        <h1 id="sign-in-title">Welcome back</h1>
        <p className="auth-subtitle">
          Manage every social channel from one intelligent workspace.
        </p>
      </header>

      <form
        id="login-form"
        className="auth-card"
        onSubmit={onSubmit}
        aria-labelledby="sign-in-title"
      >
        <InputField
          id="email"
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          invalid={Boolean(error)}
          errorId="login-error"
          icon={<Mail className="size-4" />}
          placeholder="you@company.com"
        />

        <InputField
          id="password"
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          invalid={Boolean(error)}
          errorId="login-error"
          icon={<LockKeyhole className="size-4" />}
          placeholder="••••••••"
          revealable
        />

        <div className="auth-form-meta">
          <label className="auth-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>Remember me</span>
          </label>
          <button
            type="button"
            className="auth-text-link"
            disabled
            aria-disabled="true"
            title="Coming soon"
            aria-label="Forgot password (coming soon)"
          >
            Forgot password
          </button>
        </div>

        <AnimatePresence initial={false}>
          {error ? (
            <motion.div
              key={error}
              id="login-error"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={productMotion.quick}
              className="auth-error"
              role="alert"
            >
              <span className="auth-error-icon" aria-hidden="true">
                <CircleAlert className="size-3.5" />
              </span>
              <span className="auth-error-copy">
                <strong>Sign in failed</strong>
                <span>{error}</span>
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <GradientButton type="submit" busy={busy} className="auth-submit">
          {busy ? "Signing in…" : "Sign in"}
        </GradientButton>

        <div className="auth-divider" role="separator" aria-label="Or">
          <span>or continue with</span>
        </div>

        <SocialButtons />

        <p className="auth-footer-note">
          Access is available to provisioned product users during this release.
        </p>
      </form>

      <p className="auth-create-account">
        New here?{" "}
        <button
          type="button"
          className="auth-text-link"
          disabled
          aria-disabled="true"
          title="Coming soon"
          aria-label="Create account (coming soon)"
        >
          Create account
        </button>
      </p>
    </motion.div>
  );
}
