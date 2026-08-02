import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  entitlements,
  messages,
  patreonLinks,
  threads,
  users,
} from "@/lib/db/schema";
import { collarCard } from "@/lib/profile/collar";
import { profileTimeline } from "@/lib/profile/timeline";
import { getOrCreateThread } from "@/lib/messages/ops";
import { requireGoddess } from "@/lib/auth-helpers";
import { Badge, Button, Card, Display, Input, Whisper } from "@/components/ui";
import { countOf } from "@/lib/format/plural";
import { formatWhen } from "@/lib/format/when";
import {
  acceptOathAction,
  addSubjectNote,
  declineOathAction,
  deleteSubjectNote,
  personalPush,
  pinSubjectNote,
  recheckSubjectPatreon,
  renameSubject,
  setSubjectAccess,
  toggleSubjectGate,
} from "../actions";
import { notesFor } from "@/lib/profile/dossier";
import { subjectNotifications, subjectReach } from "@/lib/push/receipts";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { reconcileConfigured } from "@/lib/patreon/reconcile";

export default async function SubjectProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireGoddess();
  const { id } = await params;
  // A hand-typed non-UUID would throw 22P02 in Postgres — treat as not-found.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) notFound();

  const [
    card,
    timeline,
    threadId,
    reach,
    pushes,
    access,
    syncable,
    link,
    grant,
    notes,
  ] = await Promise.all([
    collarCard(id),
    profileTimeline(id),
    getOrCreateThread(id),
    subjectReach(id),
    subjectNotifications(id, 25),
    resolveAccess(id),
    reconcileConfigured(),
    db
      .select()
      .from(patreonLinks)
      .where(eq(patreonLinks.userId, id))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.userId, id), eq(entitlements.source, "grant")))
      .limit(1)
      .then((r) => r[0] ?? null),
    notesFor(id),
  ]);
  void threads;

  // How many of his messages she hasn't opened — put on the button so she can
  // see there's something waiting without going looking.
  const [{ n: unreadFromHim } = { n: 0 }] = await db
    .select({ n: count() })
    .from(messages)
    .where(
      and(
        eq(messages.threadId, threadId),
        eq(messages.sender, "subject"),
        isNull(messages.readAt),
      ),
    );

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">
        {card?.honorific ? `${card.honorific}'s ` : ""}
        {card?.chosenName ?? "subject"}
      </Display>
      <Whisper className="mt-1">{user.email}</Whisper>

      {/* Their standing with the pledge, first — it is the single most common
          thing she is asked about, and it decides what they can even open. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {access.frozen ? (
          <Badge tone="danger">frozen — their pledge stopped</Badge>
        ) : access.inGrace ? (
          <Badge tone="gold">in grace · level {access.accessLevel}</Badge>
        ) : access.accessLevel > 0 ? (
          <Badge tone="gold">current · level {access.accessLevel}</Badge>
        ) : (
          <Badge tone="sealed">at the threshold — nothing pledged</Badge>
        )}
        {access.frozen ? (
          <Whisper className="text-xs">
            Everything they built is preserved. Pledging again restores it
            instantly — nothing to redo on your side.
          </Whisper>
        ) : null}
      </div>

      {/* Read what he actually said — the first thing she wants off a profile,
          so it's a button at the top and not a link at the bottom. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={`/sanctum/messages/${threadId}`}>
          <Button size="sm" variant="gold">
            Read the conversation
            {unreadFromHim > 0 ? ` · ${unreadFromHim} new` : ""}
          </Button>
        </Link>
        <Link href={`#file`}>
          <Button size="sm" variant="ghost">
            {notes.length > 0
              ? `His file · ${countOf(notes.length, "note")}`
              : "Write in his file"}
          </Button>
        </Link>
      </div>

      {card ? (
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Badge tone="gold">chain {card.chain.currentLen}d</Badge>
          <Badge tone="neutral">{countOf(card.filesCompleted, "file")}</Badge>
          <Badge tone="neutral">{card.listeningHours}h</Badge>
          <Badge tone="neutral">{countOf(card.triggersHeld.length, "trigger")}</Badge>
          {user.oathAt ? <Badge tone="gold">collared</Badge> : null}
        </div>
      ) : null}

      {/* Collar petition (R9.5) — accept closes the collar (ritual + push);
          decline clears it quietly, no push. Only when asked, not yet collared. */}
      {user.oathPetitionedAt && !user.oathAt ? (
        <Card raised className="mt-4 border-gold/40">
          <Whisper className="text-xs">
            Petitions for your collar · asked {formatWhen(user.oathPetitionedAt)}
          </Whisper>
          <Display as="h2" className="mt-1 text-xl text-gold">
            {card?.chosenName ?? "This one"} kneels for the collar.
          </Display>
          <div className="mt-3 flex gap-2">
            <form action={acceptOathAction}>
              <input type="hidden" name="userId" value={id} />
              <Button type="submit" size="sm" variant="gold">
                Accept — collar them
              </Button>
            </form>
            <form action={declineOathAction}>
              <input type="hidden" name="userId" value={id} />
              <Button type="submit" size="sm" variant="ghost">
                Decline (silence)
              </Button>
            </form>
          </div>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card>
          <Whisper className="text-xs">Rename (an ownership ritual)</Whisper>
          <form action={renameSubject} className="mt-2 flex gap-2">
            <input type="hidden" name="userId" value={id} />
            <Input name="name" defaultValue={card?.chosenName ?? ""} className="flex-1" />
            <Button type="submit" size="sm" variant="gold">
              Rename
            </Button>
          </form>
        </Card>
        <Card>
          <Whisper className="text-xs">Say something only to them</Whisper>
          <form action={personalPush} className="mt-2 flex gap-2">
            <input type="hidden" name="userId" value={id} />
            <Input name="message" placeholder="I saw what you did last night." className="flex-1" />
            <Button type="submit" size="sm">
              Send
            </Button>
          </form>
        </Card>
      </div>

      {/* Everywhere this one person shows up — no dead ends off a profile. */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link
          href={`/sanctum/messages/${threadId}`}
          className="text-gold underline underline-offset-2"
        >
          Open conversation →
        </Link>
        <Link
          href={`/sanctum/wishes#u-${id}`}
          className="text-text-dim underline underline-offset-2 transition-colors hover:text-gold"
        >
          Their asks
        </Link>
        <Link
          href={`/sanctum/commissions#u-${id}`}
          className="text-text-dim underline underline-offset-2 transition-colors hover:text-gold"
        >
          Their commissions
        </Link>
        <Link
          href={`/sanctum/their-files#u-${id}`}
          className="text-text-dim underline underline-offset-2 transition-colors hover:text-gold"
        >
          Their files
        </Link>
      </div>

      {/* Her file on him. Everything the counters can't hold — and the first
          thing a proposed reply reads. */}
      <Card className="mt-6 scroll-mt-24" id="file">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Whisper className="text-xs uppercase tracking-wide">
            What you know about him
          </Whisper>
          <Whisper className="text-xs">
            Yours only — he never sees this.
          </Whisper>
        </div>
        <form action={addSubjectNote} className="mt-3 space-y-2">
          <input type="hidden" name="userId" value={id} />
          <textarea
            name="body"
            rows={2}
            required
            maxLength={2000}
            placeholder="What he responds to, what he's afraid of, what made him give…"
            className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" variant="gold">
              Write it down
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text-dim">
              <input
                type="checkbox"
                name="pinned"
                value="true"
                className="h-3.5 w-3.5 accent-[var(--color-gold)]"
              />
              Hold it at the top
            </label>
            <Whisper className="text-xs">
              Every proposed reply reads this first.
            </Whisper>
          </div>
        </form>

        {notes.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className={`rounded-[var(--radius)] border p-2.5 ${
                  n.pinned ? "border-gold/40 bg-gold/[0.05]" : "border-line/70"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
                  {n.body}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-dim/60"
                    suppressHydrationWarning
                  >
                    {formatWhen(n.createdAt)}
                  </span>
                  <form action={pinSubjectNote}>
                    <input type="hidden" name="noteId" value={n.id} />
                    <button
                      type="submit"
                      className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-dim/70 transition-colors hover:text-gold"
                    >
                      {n.pinned ? "Release" : "Hold at top"}
                    </button>
                  </form>
                  <form action={deleteSubjectNote}>
                    <input type="hidden" name="noteId" value={n.id} />
                    <button
                      type="submit"
                      className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-dim/50 transition-colors hover:text-danger"
                    >
                      Forget it
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Whisper className="mt-3 text-xs">
            Nothing written yet. The app knows his hours and his chain; it
            doesn&apos;t know what he told you at 2am.
          </Whisper>
        )}
      </Card>

      {/* Their access, hers to set. Sits right under the standing badge that
          prompted the question. */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Whisper className="text-xs uppercase tracking-wide">
            Their access
          </Whisper>
          {syncable.ok ? (
            <form action={recheckSubjectPatreon}>
              <input type="hidden" name="userId" value={id} />
              <Button type="submit" size="sm" variant="ghost">
                Ask Patreon again now
              </Button>
            </form>
          ) : (
            /* Say why instead of offering a button that silently does nothing. */
            <Whisper className="text-xs text-danger">
              {syncable.reason === "no_token"
                ? "Can't ask Patreon — no creator token on the server."
                : "Can't ask Patreon — no campaign id discovered yet."}
            </Whisper>
          )}
        </div>
        <Whisper className="mt-1 text-xs">
          Patreon says{" "}
          <span className="text-text">
            {link?.patronStatus ?? "nothing — not on the campaign"}
          </span>
          {link?.lastSyncedAt
            ? ` · last checked ${formatWhen(link.lastSyncedAt)}`
            : " · never checked"}
          . Your own grant stacks on top and can only ever open more, never less
          — so setting it can&apos;t lock out a paying member.
        </Whisper>
        <form action={setSubjectAccess} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="userId" value={id} />
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Give them level
            <Input
              name="level"
              type="number"
              min={0}
              max={99}
              defaultValue={grant?.accessLevel ?? 0}
              className="w-24"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-text-dim">
            Why (for your audit trail)
            <Input
              name="reason"
              maxLength={200}
              placeholder="Paid outside Patreon / Patreon is wrong / a gift"
              defaultValue={grant?.reason ?? ""}
            />
          </label>
          <Button type="submit" size="sm" variant="gold">
            Set it
          </Button>
        </form>
        <Whisper className="mt-1 text-xs">
          {grant
            ? `You currently grant them level ${grant.accessLevel}. Set 0 to remove your grant and hand them back to Patreon.`
            : "No grant from you — they get exactly what Patreon gives."}
        </Whisper>
      </Card>

      {/* Her release from the requirement, per device kind. Sits directly
          above Reach, because that is where she'll be looking when she decides
          someone should stop being pressed about it. */}
      <Card className="mt-6">
        <Whisper className="text-xs uppercase tracking-wide">
          What they&apos;re required to do
        </Whisper>
        <Whisper className="mt-1 text-xs">
          This only decides what the app <em>demands</em> of them — it never
          stops you sending anything. A laptop is never blocked for anyone.
        </Whisper>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-line/60 p-3">
            <div className="min-w-0">
              <p className="text-sm text-text">On their phone</p>
              <Whisper className="text-xs">
                {user.gatePhone
                  ? "Held until installed + notifications proved."
                  : "Released — never held, never re-asked."}
              </Whisper>
            </div>
            <form action={toggleSubjectGate}>
              <input type="hidden" name="userId" value={id} />
              <input type="hidden" name="which" value="phone" />
              <Button
                type="submit"
                size="sm"
                variant={user.gatePhone ? "ghost" : "gold"}
              >
                {user.gatePhone ? "Release" : "Require"}
              </Button>
            </form>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-line/60 p-3">
            <div className="min-w-0">
              <p className="text-sm text-text">On their laptop</p>
              <Whisper className="text-xs">
                {user.gateDesktop
                  ? "Invited once, dismissible."
                  : "Silenced — never even asked."}
              </Whisper>
            </div>
            <form action={toggleSubjectGate}>
              <input type="hidden" name="userId" value={id} />
              <input type="hidden" name="which" value="desktop" />
              <Button
                type="submit"
                size="sm"
                variant={user.gateDesktop ? "ghost" : "gold"}
              >
                {user.gateDesktop ? "Stop asking" : "Ask again"}
              </Button>
            </form>
          </div>
        </div>
      </Card>

      {/* ── Reach: can she actually get to them, and what happened ────────── */}
      <Display as="h2" id="reach" className="mt-8 scroll-mt-24 text-xl">
        Reach
      </Display>
      <Whisper className="mt-1 text-xs">
        &quot;Sent&quot; only means the push service took it. Landed means their
        phone actually drew it. Opened means they tapped it.
      </Whisper>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Card>
          <Whisper className="text-xs">Devices</Whisper>
          <p
            className={`mt-1 text-2xl ${reach.pushEnabled > 0 ? "text-gold" : "text-danger"}`}
          >
            {reach.pushEnabled}
            <span className="text-sm text-text-dim">/{reach.devices}</span>
          </p>
          <Whisper className="text-xs">
            {reach.pushEnabled > 0
              ? "can be reached now"
              : reach.devices > 0
                ? "installed, notifications off"
                : "nothing installed"}
          </Whisper>
        </Card>
        <Card>
          <Whisper className="text-xs">Pushes landed</Whisper>
          <p className="mt-1 text-2xl text-text">
            {reach.delivered}
            <span className="text-sm text-text-dim">/{reach.sent}</span>
          </p>
          <Whisper className="text-xs">
            {reach.lastDeliveredAt
              ? `last ${formatWhen(reach.lastDeliveredAt)}`
              : "none confirmed yet"}
          </Whisper>
        </Card>
        <Card>
          <Whisper className="text-xs">Opened</Whisper>
          <p className="mt-1 text-2xl text-text">{reach.opened}</p>
          <Whisper className="text-xs">
            {reach.lastOpenedAt
              ? `last ${formatWhen(reach.lastOpenedAt)}`
              : "never tapped one"}
          </Whisper>
        </Card>
      </div>

      <div className="mt-3 space-y-1.5">
        {pushes.length === 0 ? (
          <Whisper>You haven&apos;t sent them anything yet.</Whisper>
        ) : (
          pushes.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-text">{p.title}</p>
                <Whisper className="text-xs">
                  {p.sentAt ? formatWhen(p.sentAt) : "—"}
                  {p.deepLink ? ` · ${p.deepLink}` : ""}
                </Whisper>
              </div>
              <Badge
                tone={
                  p.state === "opened"
                    ? "gold"
                    : p.state === "delivered"
                      ? "neutral"
                      : "danger"
                }
              >
                {p.state === "opened"
                  ? "opened"
                  : p.state === "delivered"
                    ? "landed"
                    : "never landed"}
              </Badge>
            </Card>
          ))
        )}
      </div>

      <Display as="h2" className="mt-8 text-xl">
        Timeline
      </Display>
      <div className="mt-3 space-y-1.5">
        {timeline.length === 0 ? (
          <Whisper>Nothing yet.</Whisper>
        ) : (
          timeline.map((e, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="w-24 shrink-0 text-xs text-text-dim/70">
                {e.at.toISOString().slice(0, 10)}
              </span>
              <span className="text-text">{e.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
