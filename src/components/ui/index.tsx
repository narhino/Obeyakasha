/**
 * UI primitives. Token-only styling (PLAN §4) — never raw colors/fonts.
 * Rendered in every state on /styleguide for the future design pass.
 */
import * as React from "react";

type Variant = "primary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-text hover:bg-accent/85 border border-accent/60",
  ghost:
    "bg-transparent text-text-dim hover:text-text border border-line hover:border-text-dim",
  danger: "bg-danger text-text hover:bg-danger/85 border border-danger/60",
  gold: "bg-gold text-bg font-medium hover:bg-gold/90 border border-gold",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-base",
  lg: "px-7 py-3.5 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius)] transition-colors duration-[var(--dur-med)] disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  raised = false,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-line ${
        raised ? "bg-surface-raised" : "bg-surface"
      } p-5 ${className}`}
      {...props}
    />
  );
}

export function Display({
  className = "",
  as: Tag = "h1",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag
      className={`font-[family-name:var(--font-display)] tracking-tight text-text ${className}`}
      {...props}
    />
  );
}

export function Whisper({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`text-sm leading-relaxed text-text-dim ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-text-dim">{label}</span>
      {children}
      {hint ? <span className="text-xs text-text-dim/70">{hint}</span> : null}
    </label>
  );
}

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-text focus:border-gold focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "gold" | "danger" | "sealed";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-raised text-text-dim border-line",
    gold: "bg-gold/15 text-gold border-gold/30",
    danger: "bg-danger/15 text-danger border-danger/30",
    sealed: "bg-accent-soft text-text-dim border-accent/40",
  };
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-full)] border px-2.5 py-0.5 text-xs ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
