"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const navigation = [
  { href: "#hero", label: "Product" },
  { href: "#how-it-works-title", label: "How it works" },
  { href: "#integrations-title", label: "Platforms" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="marketing-header">
      <nav className="marketing-nav" aria-label="Primary navigation">
        <a className="marketing-brand" href="#hero" aria-label="Sochestral home">
          <span className="marketing-brand-mark" aria-hidden="true">
            S
          </span>
          <span>Sochestral</span>
        </a>

        <div className="marketing-nav-links" aria-label="Page sections">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </div>

        <div className="marketing-nav-actions">
          <Link className="marketing-sign-in" href="/login">
            Sign in
          </Link>
          <Link className="marketing-start" href="/login">
            Start free
          </Link>
        </div>

        <button
          type="button"
          className="marketing-menu-trigger"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="marketing-mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        {open ? (
          <div id="marketing-mobile-menu" className="marketing-mobile-menu">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="marketing-mobile-actions">
              <Link href="/login" onClick={() => setOpen(false)}>
                Sign in
              </Link>
              <Link
                className="marketing-start"
                href="/login"
                onClick={() => setOpen(false)}
              >
                Start free
              </Link>
            </div>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
