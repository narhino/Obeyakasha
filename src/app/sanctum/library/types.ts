/** One row of the reactive Sanctum library table (ROADMAP-v1.5 C1.4). */
export interface LibraryRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: "draft" | "published" | "archived";
  minAccessLevel: number;
  durationS: number | null;
  downloadable: boolean;
  freeSample: boolean;
  /** Premiere moment as an ISO string (R9.6), null when none. */
  premiereAt: string | null;
  hasAudio: boolean;
  pipeline:
    | "uploaded"
    | "transcribing"
    | "organizing"
    | "ready"
    | "failed_transcribe"
    | "failed_organize";
  transcriptStatus: "none" | "queued" | "processing" | "done" | "failed";
  /** True only when a real transcript with text exists — not merely status
   *  "done" (old stub-era rows are "done" but empty). The badge trusts this. */
  hasScript: boolean;
  tagCount: number;
}
