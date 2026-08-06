"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

type InputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  id: string;
  label: string;
  icon?: ReactNode;
  errorId?: string;
  invalid?: boolean;
  className?: string;
  /** Adds a show/hide control when the field is a password input. */
  revealable?: boolean;
};

export function InputField({
  id,
  label,
  icon,
  errorId,
  invalid = false,
  className,
  revealable = false,
  type = "text",
  ...props
}: InputFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const canReveal = revealable && type === "password";
  const inputType = canReveal && revealed ? "text" : type;

  return (
    <div className={cn("auth-field", className)}>
      <label htmlFor={id} className="auth-field-label">
        {label}
      </label>
      <div className="auth-field-control">
        {icon ? (
          <span className="auth-field-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <input
          id={id}
          type={inputType}
          className={cn(
            "auth-input",
            icon && "auth-input-with-icon",
            canReveal && "auth-input-with-reveal",
          )}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid && errorId ? errorId : undefined}
          {...props}
        />
        {canReveal ? (
          <button
            type="button"
            className="auth-field-reveal"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
          >
            {revealed ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
