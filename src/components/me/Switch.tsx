"use client";

/** Token-only on/off switch (role=switch). Shared by the You Secret-mode card
 *  and the Gate's discreet-mode step so both read identically. */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-[var(--radius-full)] border transition-colors duration-[var(--dur-med)] disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "border-gold bg-gold/25" : "border-line bg-surface-raised"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-[var(--radius-full)] transition-transform duration-[var(--dur-med)] ${
          checked ? "translate-x-[1.375rem] bg-gold" : "translate-x-[0.15rem] bg-text-dim"
        }`}
      />
    </button>
  );
}
