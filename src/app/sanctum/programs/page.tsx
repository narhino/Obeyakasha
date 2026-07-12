import { asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { programItems, programs, tracks } from "@/lib/db/schema";
import { Badge, Button, Card, Display, Input, Select, Whisper } from "@/components/ui";
import {
  addProgramItem,
  createProgram,
  removeProgramItem,
  setProgramCadence,
  setProgramVisibility,
} from "./actions";

const CADENCES = ["ongoing", "weekly", "ended"] as const;

export default async function SanctumPrograms() {
  const [progs, publishedTracks] = await Promise.all([
    db.select().from(programs).orderBy(asc(programs.createdAt)),
    db
      .select({ id: tracks.id, title: tracks.title })
      .from(tracks)
      .where(ne(tracks.visibility, "archived"))
      .orderBy(asc(tracks.title)),
  ]);

  const items = progs.length
    ? await db
        .select({
          programId: programItems.programId,
          trackId: programItems.trackId,
          dayNumber: programItems.dayNumber,
          sort: programItems.sort,
          title: tracks.title,
        })
        .from(programItems)
        .innerJoin(tracks, eq(tracks.id, programItems.trackId))
        .where(inArray(programItems.programId, progs.map((p) => p.id)))
    : [];

  return (
    <div className="max-w-3xl">
      <Display className="text-3xl">Programs</Display>
      <Whisper className="mt-1">
        Sequential trainings — your strongest format. Day-gate them or leave
        them open.
      </Whisper>

      <Card className="mt-6">
        <Whisper className="mb-3">New program</Whisper>
        <form action={createProgram} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Title
            <Input name="title" required className="w-52" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Gating
            <Select name="gating" defaultValue="sequential">
              <option value="sequential">sequential</option>
              <option value="daily">daily (24h)</option>
              <option value="open">open</option>
            </Select>
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
            Min level
            <Input
              name="minAccessLevel"
              type="number"
              min={0}
              max={99}
              defaultValue={1}
              className="w-20"
            />
          </label>
          <Button type="submit" variant="gold" size="sm">
            Create
          </Button>
        </form>
      </Card>

      <div className="mt-6 space-y-4">
        {progs.map((p) => {
          const own = items
            .filter((i) => i.programId === p.id)
            .sort((a, b) => a.sort - b.sort);
          return (
            <Card key={p.id} raised>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-[family-name:var(--font-display)] text-lg">
                    {p.title}
                  </p>
                  <Whisper className="text-xs">
                    {p.gating} · {p.cadence} · level {p.minAccessLevel} ·{" "}
                    {own.length} items
                  </Whisper>
                </div>
                <Badge tone={p.visibility === "published" ? "gold" : "sealed"}>
                  {p.visibility}
                </Badge>
              </div>

              <ol className="mt-3 space-y-1">
                {own.map((i) => (
                  <li
                    key={i.trackId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-text">
                      {i.dayNumber ? `Day ${i.dayNumber} · ` : ""}
                      {i.title}
                    </span>
                    <form action={removeProgramItem}>
                      <input type="hidden" name="programId" value={p.id} />
                      <input type="hidden" name="trackId" value={i.trackId} />
                      <button className="text-xs text-text-dim hover:text-danger">
                        remove
                      </button>
                    </form>
                  </li>
                ))}
              </ol>

              <form
                action={addProgramItem}
                className="mt-3 flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="programId" value={p.id} />
                <label className="flex flex-col gap-1 text-xs text-text-dim">
                  Add track
                  <Select name="trackId" required className="w-52">
                    {publishedTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-dim">
                  Day #
                  <Input name="dayNumber" type="number" min={1} className="w-20" />
                </label>
                <Button type="submit" size="sm">
                  Add
                </Button>
              </form>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={setProgramVisibility}>
                  <input type="hidden" name="programId" value={p.id} />
                  <input
                    type="hidden"
                    name="visibility"
                    value={p.visibility === "published" ? "draft" : "published"}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant={p.visibility === "published" ? "ghost" : "gold"}
                    disabled={own.length === 0}
                  >
                    {p.visibility === "published" ? "Unpublish" : "Publish"}
                  </Button>
                </form>
                <form
                  action={setProgramCadence}
                  className="flex items-center gap-1"
                >
                  <input type="hidden" name="programId" value={p.id} />
                  <Select name="cadence" defaultValue={p.cadence}>
                    {CADENCES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm" variant="ghost">
                    Set cadence
                  </Button>
                </form>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
