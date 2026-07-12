import { requireGoddess } from "@/lib/auth-helpers";
import { listImportablePosts } from "@/lib/patreon/import";
import { Badge, Button, Card, Display, Whisper } from "@/components/ui";
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

export default async function ImportPage() {
  await requireGoddess();
  const { ready, posts, error } = await listImportablePosts();
  const newWithAudio = posts.filter((p) => p.hasAudio && !p.imported);

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Import from Patreon</Display>
      <Whisper className="mt-1">
        Pull your posts and their audio straight in. Everything lands as a draft
        and runs through the pipeline — transcribed, analysed, tagged.
      </Whisper>

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
          {newWithAudio.length > 0 ? (
            <form action={importAllNewAction} className="mt-6">
              <input
                type="hidden"
                name="postIds"
                value={newWithAudio.map((p) => p.postId).join(",")}
              />
              <Button type="submit" size="sm" variant="gold">
                Import all new ({newWithAudio.length})
              </Button>
            </form>
          ) : null}

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
                      {p.audio.length > 0 ? ` · ${p.audio.length} audio` : ""}
                      {p.isPublic ? " · public" : ""}
                    </Whisper>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!p.hasAudio ? (
                      <Badge tone="neutral">no audio</Badge>
                    ) : p.imported ? (
                      <Badge tone="gold">imported</Badge>
                    ) : (
                      <form action={importPostAction}>
                        <input type="hidden" name="postId" value={p.postId} />
                        <Button type="submit" size="sm" variant="ghost">
                          Import
                        </Button>
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
