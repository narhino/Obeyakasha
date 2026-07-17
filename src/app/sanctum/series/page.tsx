import { asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { playlistItems, playlists, tracks } from "@/lib/db/schema";
import { mediaProvider } from "@/lib/media";
import { copy } from "@/copy/copy";
import {
  Badge,
  Button,
  Card,
  Display,
  Input,
  Select,
  Whisper,
} from "@/components/ui";
import { SeriesCover } from "./SeriesCover";
import {
  addSeriesItem,
  createSeries,
  moveSeriesItem,
  removeSeriesItem,
  updateSeries,
} from "./actions";

const CADENCES = ["ongoing", "weekly", "ended"] as const;
const VISIBILITIES = ["draft", "published", "archived"] as const;
const ART_TTL_S = 6 * 60 * 60;

async function signArt(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await mediaProvider().signStreamUrl(key, ART_TTL_S);
  } catch {
    return null;
  }
}

export default async function SanctumSeries() {
  const [rows, publishedTracks] = await Promise.all([
    db
      .select()
      .from(playlists)
      .where(eq(playlists.kind, "curated"))
      .orderBy(asc(playlists.createdAt)),
    db
      .select({ id: tracks.id, title: tracks.title })
      .from(tracks)
      .where(ne(tracks.visibility, "archived"))
      .orderBy(asc(tracks.title)),
  ]);

  const items = rows.length
    ? await db
        .select({
          id: playlistItems.id,
          playlistId: playlistItems.playlistId,
          trackId: playlistItems.trackId,
          sort: playlistItems.sort,
          title: tracks.title,
        })
        .from(playlistItems)
        .innerJoin(tracks, eq(tracks.id, playlistItems.trackId))
        .where(
          inArray(
            playlistItems.playlistId,
            rows.map((p) => p.id),
          ),
        )
    : [];

  const artByPlaylist = new Map<string, string | null>(
    await Promise.all(
      rows.map(
        async (p) => [p.id, await signArt(p.artworkKey)] as [string, string | null],
      ),
    ),
  );

  return (
    <div className="max-w-3xl">
      <Display className="text-3xl">Series</Display>
      <Whisper className="mt-1">
        Curated collections — cover, description, cadence. They play as a queue,
        newest choices always first.
      </Whisper>

      <Card className="mt-6">
        <Whisper className="mb-3">New series</Whisper>
        <form action={createSeries} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Title
              <Input name="title" required className="w-60" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Cadence
              <Select name="cadence" defaultValue="ongoing">
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Visibility
              <Select name="visibility" defaultValue="draft">
                {VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Description
            <textarea
              name="description"
              rows={2}
              className="rounded-[var(--radius)] border border-line bg-bg/60 px-3 py-2 text-sm text-text placeholder:text-text-dim/45 focus:border-gold/70 focus:outline-none"
            />
          </label>
          <Button type="submit" variant="gold" size="sm">
            Create
          </Button>
        </form>
      </Card>

      <div className="mt-6 space-y-4">
        {rows.map((p) => {
          const own = items
            .filter((i) => i.playlistId === p.id)
            .sort((a, b) => a.sort - b.sort);
          return (
            <Card key={p.id} raised>
              <div className="flex items-start justify-between gap-3">
                <SeriesCover
                  playlistId={p.id}
                  artworkUrl={artByPlaylist.get(p.id) ?? null}
                  mark={copy.brand.mark}
                />
                <Badge tone={p.visibility === "published" ? "gold" : "sealed"}>
                  {p.visibility}
                </Badge>
              </div>

              {/* Edit details */}
              <form action={updateSeries} className="mt-4 space-y-3">
                <input type="hidden" name="playlistId" value={p.id} />
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs text-text-dim">
                    Title
                    <Input name="title" defaultValue={p.title} required className="w-60" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-dim">
                    Cadence
                    <Select name="cadence" defaultValue={p.cadence}>
                      {CADENCES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-dim">
                    Visibility
                    <Select name="visibility" defaultValue={p.visibility}>
                      {VISIBILITIES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-xs text-text-dim">
                  Description
                  <textarea
                    name="description"
                    rows={2}
                    defaultValue={p.description ?? ""}
                    className="rounded-[var(--radius)] border border-line bg-bg/60 px-3 py-2 text-sm text-text placeholder:text-text-dim/45 focus:border-gold/70 focus:outline-none"
                  />
                </label>
                <Button type="submit" size="sm">
                  Save details
                </Button>
              </form>

              {/* Items */}
              <ol className="mt-4 space-y-1">
                {own.length === 0 ? (
                  <li className="text-xs text-text-dim">No tracks yet.</li>
                ) : null}
                {own.map((i, idx) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-text">
                      <span className="mr-2 text-text-dim/60">{idx + 1}.</span>
                      {i.title}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <form action={moveSeriesItem}>
                        <input type="hidden" name="playlistId" value={p.id} />
                        <input type="hidden" name="itemId" value={i.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          disabled={idx === 0}
                          className="px-1.5 text-xs text-text-dim hover:text-gold disabled:opacity-30"
                        >
                          ↑
                        </button>
                      </form>
                      <form action={moveSeriesItem}>
                        <input type="hidden" name="playlistId" value={p.id} />
                        <input type="hidden" name="itemId" value={i.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          disabled={idx === own.length - 1}
                          className="px-1.5 text-xs text-text-dim hover:text-gold disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </form>
                      <form action={removeSeriesItem}>
                        <input type="hidden" name="playlistId" value={p.id} />
                        <input type="hidden" name="itemId" value={i.id} />
                        <button className="px-1.5 text-xs text-text-dim hover:text-danger">
                          remove
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ol>

              {/* Add a track */}
              <form
                action={addSeriesItem}
                className="mt-3 flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="playlistId" value={p.id} />
                <label className="flex flex-col gap-1 text-xs text-text-dim">
                  Add track
                  <Select name="trackId" required className="w-60">
                    {publishedTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </Select>
                </label>
                <Button type="submit" size="sm">
                  Add
                </Button>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
