import Link from "next/link";
import { requireGoddess } from "@/lib/auth-helpers";
import { listWaitingShells } from "@/lib/patreon/import";
import { Card, Display, Whisper } from "@/components/ui";
import { AttachClient } from "./AttachClient";

/**
 * Bulk-attach screen (ROADMAP-v1.5 R8). Lists the Patreon shells still needing
 * audio, takes a drop of many files at once, fuzzy-matches filenames to shells,
 * and streams each accepted file onto its shell. Goddess-only (Sanctum layout).
 */
export const dynamic = "force-dynamic";

export default async function AttachPage() {
  await requireGoddess();
  const shells = await listWaitingShells();

  return (
    <div className="max-w-3xl">
      <Link
        href="/sanctum/import"
        className="text-xs uppercase tracking-[0.14em] text-text-dim hover:text-text"
      >
        ← Import
      </Link>
      <Display className="mt-3 text-3xl">Attach audio</Display>
      <Whisper className="mt-1">
        Drop your files — one, or the whole batch. Names are matched to the posts
        waiting for audio; confirm or fix each pairing, then attach. Every file
        streams onto its post and runs the pipeline.
      </Whisper>

      {shells.length === 0 ? (
        <Card className="mt-6">
          <Whisper>
            Nothing waiting. Every imported post already has its audio. Import
            more from{" "}
            <Link
              href="/sanctum/import"
              className="text-gold hover:underline"
            >
              Patreon
            </Link>
            .
          </Whisper>
        </Card>
      ) : (
        <AttachClient
          shells={shells.map((s) => ({
            id: s.id,
            title: s.title,
            createdAt: s.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
