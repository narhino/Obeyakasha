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
  // One disabled token everywhere (F31): a genuinely disabled button drops to a
  // calm neutral rather than a washed-out variant ("muddy gold"). Mid-submit
  // (loading) keeps its variant colour so the spinner still reads as intent.
  const disabledLook = Boolean(disabled) && !loading;
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius)] tracking-[0.08em] uppercase transition-all duration-[var(--dur-med)] disabled:cursor-not-allowed ${
        disabledLook
          ? "border border-line bg-surface-raised text-text-dim/45"
          : variants[variant]
      } ${loading ? "opacity-90" : ""} ${sizes[size]} ${className}`}
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
  // Elevation tiers (D2): a resting card sits flat (--elev-1); `raised` lifts it
  // to --elev-2 (warm top edge-light + a soft violet-black cast). Floating chrome
  // (--elev-3, glass) is applied at the surface, not here.
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-line/80 ${
        raised ? "bg-surface-raised elev-2" : "bg-surface elev-1"
      } p-5 ${className}`}
      {...props}
    />
  );
}

/**
 * The ambient page glow (D2): one warm gold source from the top + an edge
 * vignette, painted once behind the whole app. Mount a single instance in the
 * root layout — never per page. Inert and decorative.
 */
export function PageGlow() {
  return <div aria-hidden className="page-glow" />;
}

// Fluid display sizes (D3) — huge, confident page openers; section heads a step
// down. Omit `size` to keep a bespoke scale via className (unchanged default).
const displaySizes: Record<"opener" | "section", string> = {
  opener: "text-[length:var(--display-1)]",
  section: "text-[length:var(--display-2)]",
};

export function Display({
  className = "",
  as: Tag = "h1",
  size,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3";
  size?: "opener" | "section";
}) {
  return (
    <Tag
      className={`font-[family-name:var(--font-display)] font-medium leading-[1.08] tracking-[0.01em] text-text ${
        size ? displaySizes[size] : ""
      } ${className}`}
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

/**
 * Her voice (D3) — an italic display treatment for whisper and quote moments,
 * set apart from functional UI text. This is her speaking, not the app.
 */
export function Voice({
  className = "",
  as: Tag = "p",
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: "p" | "blockquote" | "span";
}) {
  return <Tag className={`voice ${className}`} {...props} />;
}

/** Letterspaced small-caps section label. */
export function Label({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`label-caps ${className}`} {...props} />;
}

/**
 * Page-opener eyebrow (D3) — a small-caps, tracked, dim line above a huge
 * title. Content-true labels only (never decoration).
 */
export function Eyebrow({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`eyebrow ${className}`} {...props} />;
}

/**
 * The page-opener pattern (D3): a content-true eyebrow above a huge display
 * title, with an optional trailing slot for a badge or action. One primitive so
 * every header wears the same structure — swap a bare <Display> for this.
 */
export function PageHeading({
  eyebrow,
  trailing,
  as = "h1",
  className = "",
  children,
}: {
  eyebrow?: React.ReactNode;
  trailing?: React.ReactNode;
  as?: "h1" | "h2";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <Display as={as} size="opener">
          {children}
        </Display>
      </div>
      {trailing ? <div className="shrink-0 pb-1.5">{trailing}</div> : null}
    </div>
  );
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
