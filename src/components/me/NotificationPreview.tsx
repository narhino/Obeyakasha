import { IconSpark } from "@/components/ui/icons";

/**
 * A small mock of a lock-screen notification — used to show the difference
 * between how Akasha truly speaks and the disguised message a bystander sees.
 * Presentational only; both the You Secret-mode card and the Gate render two
 * of these side by side.
 */
export function NotificationPreview({
  variant,
  label,
  title,
  body,
}: {
  variant: "true" | "mask";
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="label-caps mb-1.5 text-[0.5625rem] text-text-dim/70">
        {label}
      </p>
      <div className="rounded-[var(--radius)] border border-line/80 bg-bg/70 p-2.5">
        <div className="flex items-start gap-2">
          {variant === "true" ? (
            <span
              aria-hidden
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-accent-soft text-gold"
            >
              <IconSpark size={14} />
            </span>
          ) : (
            // Mirrors the neutral disguise icon: soft grey square with a dot.
            <span
              aria-hidden
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-text-dim/40"
            >
              <span className="h-2.5 w-2.5 rounded-[var(--radius-full)] bg-bg/80" />
            </span>
          )}
          <div className="min-w-0">
            <p className="line-clamp-2 text-xs font-medium text-text">{title}</p>
            <p className="mt-0.5 line-clamp-2 text-[0.6875rem] leading-snug text-text-dim">
              {body}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
