import Link from "next/link";
import { requireGoddess } from "@/lib/auth-helpers";
import { listImportablePosts, listWaitingShells } from "@/lib/patreon/import";
import { diagnoseImport } from "@/lib/patreon/diagnose";
import { Badge, Card, Display, Whisper } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AttachButton } from "./AttachButton";
import { importAllNewAction, importPostAction } from "./actions";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ diag?: string }>;
}) {
  await requireGoddess();
  const { diag } = await searchParams;

  if (diag) {
    const d = await diagnoseImport();
    return (
      <div className="max-w-2xl">
        <Display className="text-3xl">Import — diagnose</Display>
        <Whisper className="mt-1">
          The exact Patreon responses + worker state. Copy this to Claude.
        </Whisper>
        <Card className="mt-4">
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words text-xs text-text-dim">
            {JSON.stringify(d, null, 2)}
          </pre>
        </Card>
        <Link
          href="/sanctum/import"
          className="mt-3 inline-block text-xs uppercase tracking-[0.14em] text-text-dim hover:text-text"
        >
          ← back
        </Link>
      </div>
    );
  }

  // Waiting shells are a local fact (imported posts with no audio yet), so this
  // holds even if Patreon is momentarily unreachable.
  const waiting = await listWaitingShells();
  const { ready, posts, error } = await listImportablePosts();
  // "new" = never imported and not currently queued/running.
  const fresh = posts.filter(
    (p) =>
      !p.imported && (p.jobStatus === null || p.jobStatus === "failed"),
  );

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Import from Patreon</Display>
      <Whisper className="mt-1">
        Pull your posts in as drafts. Patreon can&apos;t hand over post audio, so
        each lands as a shell — title and words kept — waiting for you to attach
        the file. Attach it and the pipeline runs: transcribed, analysed, tagged.{" "}
        <Link href="/sanctum/import?diag=1" className="text-gold hover:underline">
          Diagnose
        </Link>
      </Whisper>

      {waiting.length > 0 ? (
        <Link
          href="/sanctum/import/attach"
          className="mt-4 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-gold/40 bg-gold/5 px-4 py-3 transition-colors hover:border-gold/70"
        >
          <span className="text-sm text-text">
            <span className="font-[family-name:var(--font-display)] text-gold">
              Attach audio
            </span>{" "}
            — {waiting.length} shell{waiting.length === 1 ? "" : "s"} waiting for
            their files.
          </span>
          <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-gold">
            Open →
          </span>
        </Link>
      ) : null}

      {error ? (
        <Card className="mt-6">
          <Whisper className="text-danger">Patreon said: {error}</Whisper>
          <Whisper className="mt-2 text-xs">
            Usually a scope: your Creator&apos;s Access Token needs the
            <code> campaigns</code> and <code>campaigns.posts</code> scopes.
            Re-create the token with those ticked, update{" "}
            <code>PATREON_CREATOR_ACCESS_TOKEN</code>, and redeploy.
          </Whisper>
        </Card>
      ) : !ready ? (
        <Card className="mt-6">
          <Whisper>
            Not connected yet. Add your <b>Creator&apos;s Access Token</b> from
            the Patreon developer portal to <code>PATREON_CREATOR_ACCESS_TOKEN</code>{" "}
            in your <code>.env</code>, sign in once so your campaign is
            discovered, then redeploy. Your tokens never touch the repo.
          </Whisper>
        </Card>
      ) : posts.length === 0 ? (
        <Card className="mt-6">
          <Whisper>No posts found on your campaign yet.</Whisper>
        </Card>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-3">
            {fresh.length > 0 ? (
              <form action={importAllNewAction}>
                <input
                  type="hidden"
                  name="postIds"
                  value={fresh.map((p) => p.postId).join(",")}
                />
                <SubmitButton size="sm" variant="gold">
                  Import all new ({fresh.length})
                </SubmitButton>
              </form>
            ) : null}
            <Whisper className="text-xs">
              {posts.length} posts · imports as drafts, then attach the audio.
            </Whisper>
          </div>

          <div className="mt-4 space-y-2">
            {posts.map((p) => (
              <Card key={p.postId} raised>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-[family-name:var(--font-display)] text-base">
                      {p.title}
                    </p>
                    <Whisper className="text-xs">
                      {fmtDate(p.publishedAt)}
                      {p.isPublic ? " · public" : ""}
                      {p.jobStatus === "failed" && p.jobError
                        ? ` · ${p.jobError.slice(0, 80)}`
                        : ""}
                    </Whisper>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.imported && p.needsAudio ? (
                      <>
                        <Badge tone="sealed">shell · needs audio</Badge>
                        {p.trackId ? (
                          <AttachButton trackId={p.trackId} />
                        ) : null}
                      </>
                    ) : p.imported ? (
                      <Badge tone="gold">imported</Badge>
                    ) : p.jobStatus === "queued" || p.jobStatus === "running" ? (
                      <Badge tone="neutral">importing…</Badge>
                    ) : (
                      <form action={importPostAction}>
                        <input type="hidden" name="postId" value={p.postId} />
                        <SubmitButton size="sm" variant="ghost">
                          {p.jobStatus === "failed" ? "Retry" : "Import"}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
