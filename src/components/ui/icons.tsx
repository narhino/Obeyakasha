/**
 * Icon set — minimal engraved strokes, 24×24, currentColor.
 * Replaces every emoji control (▶ ❚❚ ⏮ ⏭ 🔒 ✦ ⌄ ↓ ✓) so the UI reads as
 * crafted, not default. Stroke 1.5, round caps — elegant, not techy.
 */
import * as React from "react";

type P = React.SVGProps<SVGSVGElement> & { size?: number };

function base(size = 20) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconPlay({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPause({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="7" y="5.5" width="3.2" height="13" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="13.8" y="5.5" width="3.2" height="13" rx="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPrev({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M18 6v12l-8.5-6L18 6Z" fill="currentColor" stroke="none" />
      <path d="M7 6v12" />
    </svg>
  );
}

export function IconNext({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M6 6v12l8.5-6L6 6Z" fill="currentColor" stroke="none" />
      <path d="M17 6v12" />
    </svg>
  );
}

export function IconLock({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="5.5" y="10.5" width="13" height="9" rx="1.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <circle cx="12" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChevronDown({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M6 9.5 12 15.5 18 9.5" />
    </svg>
  );
}

export function IconSpark({ size, ...p }: P) {
  // Four-point star — the ✦ sigil, used for whispers/inbox.
  return (
    <svg {...base(size)} {...p}>
      <path
        d="M12 3.5c.6 3.6 2.3 5.9 8.5 8.5-6.2 2.6-7.9 4.9-8.5 8.5-.6-3.6-2.3-5.9-8.5-8.5 6.2-2.6 7.9-4.9 8.5-8.5Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function IconKeep({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 4.5v9.5m0 0 3.6-3.6M12 14l-3.6-3.6" />
      <path d="M5 17.5h14" />
    </svg>
  );
}

export function IconCheck({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="m5.5 12.5 4 4 9-9.5" />
    </svg>
  );
}

export function IconLibrary({ size, ...p }: P) {
  // Spines of a private archive.
  return (
    <svg {...base(size)} {...p}>
      <path d="M5.5 5v14M10 5v14" />
      <path d="m13.5 5.6 4.4-1.1 3 13.9-4.4 1.1-3-13.9Z" />
    </svg>
  );
}

export function IconDescend({ size, ...p }: P) {
  // Steps descending — the trainings / the Descent.
  return (
    <svg {...base(size)} {...p}>
      <path d="M4 6h5v4h5v4h5v4H4" />
    </svg>
  );
}

export function IconSpeak({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M4.5 6.5h15v9.5h-8.5L7 19.5v-3.5H4.5v-9.5Z" />
      <path d="M8.5 11.5h7" />
    </svg>
  );
}

export function IconCollar({ size, ...p }: P) {
  // A collar with its ring — "You".
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="10.5" r="6.5" />
      <circle cx="12" cy="18.5" r="2" />
    </svg>
  );
}

export function IconSeal({ size, ...p }: P) {
  // 888 sigil abbreviation — three stacked rings.
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="7" r="2.6" />
      <circle cx="12" cy="12" r="2.6" />
      <circle cx="12" cy="17" r="2.6" />
    </svg>
  );
}

export function IconWarn({ size, ...p }: P) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 4 21 19H3L12 4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSkipBack15({ size, ...p }: P) {
  // A rewind ring with a left-pointing arrowhead + the "15" offset.
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 6a6 6 0 1 1-5.7 4.2" />
      <path d="M12 3 8.4 6 12 9Z" fill="currentColor" stroke="none" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight={600}
        fill="currentColor"
        stroke="none"
      >
        15
      </text>
    </svg>
  );
}

export function IconSkipForward15({ size, ...p }: P) {
  // Mirror of the rewind: forward ring + right-pointing arrowhead.
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 6a6 6 0 1 0 5.7 4.2" />
      <path d="M12 3 15.6 6 12 9Z" fill="currentColor" stroke="none" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight={600}
        fill="currentColor"
        stroke="none"
      >
        15
      </text>
    </svg>
  );
}

export function IconQueue({ size, ...p }: P) {
  // A tracklist with a small play glyph — "what's next / the queue".
  return (
    <svg {...base(size)} {...p}>
      <path d="M4 7h16M4 12h16M4 17h9" />
      <path d="M16.5 15.2v3.6l3-1.8-3-1.8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
