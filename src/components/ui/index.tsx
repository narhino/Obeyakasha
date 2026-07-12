/**
 * UI primitives. Token-only styling (PLAN §4) — never raw colors/fonts.
 * The look: engraved editorial-occult. Hairline borders, letterspaced caps,
 * antique gold accents, slow transitions. Every state on /styleguide.
 */
import * as React from "react";

type Variant = "primary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-text border border-accent hover:bg-accent/85 hover:border-gold/40",
  ghost:
    "bg-transparent text-text-dim border border-line hover:text-text hover:border-text-dim/60",
  danger:
    "bg-transparent text-danger border border-danger/50 hover:bg-danger/10 hover:border-danger",
  gold:
    "bg-gold text-bg font-medium border border-gold hover:bg-gold-deep hover:border-gold-deep",
};

const sizes: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-[0.8125rem]",
  md: "px-5 py-2.5 text-sm",
  lg: "px-8 py-3 text-base",
};

/** Small token-coloured spinner (uses currentColor). */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[0.9em] w-[0.9em] animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.1em] ${className}`}
    />
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius)] tracking-[0.08em] uppercase transition-all duration-[var(--dur-med)] disabled:cursor-not-allowed disabled:opacity-35 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Card({
  raised = false,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-line/80 ${
        raised
          ? "bg-surface-raised shadow-[0_1px_0_0_rgba(234,227,214,0.04)_inset]"
          : "bg-surface"
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
      className={`font-[family-name:var(--font-display)] font-medium leading-[1.08] tracking-[0.01em] text-text ${className}`}
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

/** Letterspaced small-caps section label. */
export function Label({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`label-caps ${className}`} {...props} />;
}

/** Thin gold rule with a center sigil: ──── ✦ ──── */
export function Ornament({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`ornament ${className}`} aria-hidden>
      <span className="font-[family-name:var(--font-display)] text-sm leading-none">
        {children ?? "✦"}
      </span>
    </div>
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
      <span className="label-caps">{label}</span>
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
      className={`rounded-[var(--radius)] border border-line bg-bg/60 px-3 py-2 text-sm text-text placeholder:text-text-dim/45 transition-colors duration-[var(--dur-med)] focus:border-gold/70 focus:outline-none ${className}`}
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
      className={`rounded-[var(--radius)] border border-line bg-bg/60 px-3 py-2 text-sm text-text transition-colors duration-[var(--dur-med)] focus:border-gold/70 focus:outline-none ${className}`}
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
    gold: "bg-gold/10 text-gold border-gold/30",
    danger: "bg-danger/10 text-danger border-danger/30",
    sealed: "bg-accent-soft text-text-dim border-accent/30",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-[var(--radius-sm)] border px-2 py-0.5 text-[0.6875rem] tracking-[0.08em] uppercase ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
