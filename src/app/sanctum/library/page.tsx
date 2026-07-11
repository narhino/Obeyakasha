import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { Badge, Button, Card, Display, Input, Whisper } from "@/components/ui";
import { setTrackVisibility, updateTrackMeta, uploadTrack } from "./actions";

function fmtDuration(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default async function SanctumLibrary() {
  const all = await db.select().from(tracks).orderBy(desc(tracks.createdAt));

  return (
    <div className="max-w-3xl">
      <Display className="text-3xl">Library</Display>
      <Whisper className="mt-1">
        Upload files, set their access level, and publish. Uploads land as
        drafts.
      </Whisper>

      <Card className="mt-6">
        <Whisper className="mb-3">Upload a track</Whisper>
        <form
          action={uploadTrack}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Audio file
            <input
              type="file"
              name="file"
              accept="audio/*"
              required
              className="text-sm text-text-dim file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Title (optional)
            <Input name="title" className="w-52" />
          </label>
          <Button type="submit" variant="gold" size="sm">
            Upload
          </Button>
        </form>
      </Card>

      <div className="mt-6 space-y-3">
        {all.length === 0 ? (
          <Card>
            <Whisper>No tracks yet. Upload your first above.</Whisper>
          </Card>
        ) : (
          all.map((t) => (
            <Card key={t.id} raised>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-[family-name:var(--font-display)] text-lg">
                    {t.title}
                  </p>
                  <Whisper className="text-xs">
                    {fmtDuration(t.durationS)} · level {t.minAccessLevel} ·{" "}
                    {t.streamKey ? "audio ✓" : "no audio"}
                  </Whisper>
                </div>
                <Badge
                  tone={
                    t.visibility === "published"
                      ? "gold"
                      : t.visibility === "archived"
                        ? "danger"
                        : "sealed"
                  }
                >
                  {t.visibility}
                </Badge>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-text-dim hover:text-text">
                  Edit
                </summary>
                <form
                  action={updateTrackMeta}
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                >
                  <input type="hidden" name="trackId" value={t.id} />
                  <label className="flex flex-col gap-1 text-xs text-text-dim">
                    Title
                    <Input name="title" defaultValue={t.title} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-dim">
                    Access level
                    <Input
                      name="minAccessLevel"
                      type="number"
                      min={0}
                      max={99}
                      defaultValue={t.minAccessLevel}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-dim">
                    Duration (s)
                    <Input
                      name="durationS"
                      type="number"
                      min={0}
                      defaultValue={t.durationS ?? ""}
                    />
                  </label>
                  <label className="flex items-center gap-2 self-end text-xs text-text-dim">
                    <input
                      type="checkbox"
                      name="downloadable"
                      defaultChecked={t.downloadable}
                    />
                    Downloadable
                  </label>
                  <label className="col-span-full flex flex-col gap-1 text-xs text-text-dim">
                    Description
                    <textarea
                      name="description"
                      defaultValue={t.description ?? ""}
                      rows={2}
                      className="rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-text focus:border-gold focus:outline-none"
                    />
                  </label>
                  <div className="col-span-full">
                    <Button type="submit" size="sm">
                      Save
                    </Button>
                  </div>
                </form>

                <div className="mt-3 flex gap-2">
                  {t.visibility !== "published" ? (
                    <form action={setTrackVisibility}>
                      <input type="hidden" name="trackId" value={t.id} />
                      <input type="hidden" name="visibility" value="published" />
                      <Button
                        type="submit"
                        size="sm"
                        variant="gold"
                        disabled={!t.streamKey}
                      >
                        Publish
                      </Button>
                    </form>
                  ) : (
                    <form action={setTrackVisibility}>
                      <input type="hidden" name="trackId" value={t.id} />
                      <input type="hidden" name="visibility" value="draft" />
                      <Button type="submit" size="sm" variant="ghost">
                        Unpublish
                      </Button>
                    </form>
                  )}
                </div>
              </details>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
