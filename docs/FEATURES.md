# Obey Akasha — Platform Feature Specification (v0 — proposal)

> Status: **approved by Akasha 2026-07-11** ("I love all those features") with
> these decisions: Patreon-only payments at launch · commissions become direct
> requests (no checkout) · transcription mode added (F12) · in-app offline
> downloads added (F13) · polls added (A24) · **A10 cut** · strictly no
> subject↔subject communication. The authoritative build spec is
> `docs/PLAN.md` (decisions table in PLAN §0). Read `docs/BRAND.md` first — it
> governs all naming and copy. Note on language: Akasha's content is hypnosis
> audio with erotic energy — no nudity, nothing pornographic; where this doc
> discusses "classification risk" it refers to third-party platforms' own
> broad definitions, not a judgment about the content.

## 1. Product thesis

A members-only PWA where Akasha's subjects sign in with Patreon (or a direct
subscription), listen inside a hypnosis-native player, and are **individually
perceived, progressively conditioned, and safely held** — while Akasha runs the
whole relationship from one admin cockpit: content, notifications, profiles,
messages, revenue. The platform's psychological jobs, in order:

1. **Continuity** — subjects are *built over time* (programs, triggers, levels), not sold files.
2. **Being seen** — every subject feels personally perceived by her (data → personal touches at scale).
3. **Ritual** — daily/nightly structure that makes listening a practice, not a purchase.
4. **Variable presence** — her voice arrives unpredictably; the app is worth opening every day.
5. **Safe surrender** — visible safety rails make deeper surrender possible (and protect her legally).

---

## 2. Confirmed features (Akasha's spec, restated precisely)

**F1. Patreon sign-in + tier entitlements.** OAuth with Patreon; read membership
tier; unlock library content per tier. Webhooks keep entitlements current
(upgrades, downgrades, lapses).

**F2. Direct subscription (non-Patreon path). [DEFERRED → v2, decision D1.]**
Recurring payment option for people without Patreon. See Risk R1 — **Whop
cannot be used**; when built, use a processor that openly accepts
erotic-content businesses (CCBill / Segpay / Verotel) behind a pluggable
`PaymentProvider` interface. The entitlements engine already merges rails
(Patreon tier ∪ direct plan → one access level), so this slots in later
without rework.

**F3. Commissions tab with admin toggle — request flow (decision D2).**
"Order a custom file" = a direct request to Akasha, no checkout: subject fills
an **admin-editable form** (fields stored in DB; seeded per PLAN §14.1, which
Akasha aligns with her Google Form questions in the Sanctum editor) → lands in
her inbox as a commission with statuses (new → reviewing → accepted →
in_progress → delivered → closed/declined). Payment is arranged in her
acceptance reply (off-app at launch). Delivery = the finished track appears in
that subject's library only ("Made for you"). Admin toggle ON/OFF; OFF shows
the A14 waitlist.

**F4. The Library.** All tracks the signed-in subject has access to; locked
items visible but sealed (tier upsell). Filters: series/program, theme, purpose,
duration, intensity. Continue-listening row.

**F5. Organize agent.** Admin clicks "Organize": an AI pass over the catalog
(titles, descriptions, and **full transcripts** — F12) that (a) proposes normalized
tags per track — purpose (induction / deepening / conditioning / trigger /
maintenance / sleep), theme (chastity, obedience, devotion, transformation…),
format (pure hypno / RP), intensity, heat level, triggers installed/required —
and (b) proposes playlist/program assignments. **Everything lands in a review
queue; nothing applies until Akasha approves** (per-item or bulk).

**F6. The Player.** Persistent bottom player + full-screen mode with looping
spiral visuals (selectable spirals, dim mode). Queue: play a playlist in one
tap, add-to-queue from anywhere, reorder. End-of-track behavior prominent and
per-session: stop after this track / repeat track / repeat playlist / continue
queue / sleep timer. Background audio, lock-screen controls (Media Session API),
resume where you left off.

**F7. Admin push notifications.** Send to all / tier / segment / individual,
anytime. Composer with `{name}` personalization, scheduling, in-voice templates.

**F8. Install + notification gate.** On first visit: iOS Safari → must Add to
Home Screen, then enable notifications to proceed (iOS 16.4+ requirement for web
push; guided step-by-step screens with her voice). Android → install PWA +
enable notifications. Desktop → allowed with notifications, install optional.
Framed in-brand as *initiation*, not a permissions chore ("Let me into your
pocket. I don't repeat myself twice.").

**F9. Initiation intake (on first sign-in).** Collected into the subject's
profile: how they wish to be identified (name/pronoun/honorific) · since when
they've known her · what they seek most · favorite files so far · files/things
they wish existed · (plus consent + limits acknowledgment, see A19). Presented
one question per screen, in her voice — an interrogation ritual, not a form.

**F10. Recurring profile questions.** From admin: compose a question, target
all/tier/segment/individual, subjects answer in-app (full-screen "Answer me."
moment); answers append to their profile timeline.

**F11. Messages (subject → Akasha).** Subjects can write to her; she reads in
admin with full profile context beside the thread; she replies directly OR
requests **AI-drafted replies trained on her past answers + BRAND.md** — always
draft-first, she edits/approves, never auto-send. (Enhanced by A9 voice notes,
A20 safety triage.)

**F12. Transcription mode (added 2026-07-11, decision D3).** Every track is
transcribed automatically, self-hosted — audio never leaves the server.
Transcripts are Akasha's **script archive** (viewable, editable, exportable in
the Sanctum; never shown to subjects) and the raw material the organize agent
works from: tags, triggers with in-file timestamps, and search/filters are
derived from actual script content, not just titles. Spec: PLAN §8.

**F13. Offline downloads, in-app only (added 2026-07-11, decision D4).**
YouTube-model: entitled tracks can be kept for offline listening **inside the
app** — encrypted at rest, entitlement-revalidated on each online launch,
purged on lapse/logout — never exportable files. Spec: PLAN §10.

---

## 3. Proposed additions

Grouped by psychological function. Priority: **[MVP]** build first,
**[v1.1]** fast follow, **[v2]** later.

### A. Being seen — parasocial → personal

**A1. Listening presence panel + "seen" touches. [MVP]**
Per-subject listening telemetry (what, when, how often, completed or not,
repeats). Admin sees it per profile and as a daily digest ("Marc looped Devotion
Doctrine 4× last night; Day 6 completed by 11 subjects"). One tap from the
digest → personal notification ("I know what you listened to last night. Good.").
*Why:* being individually perceived is the single strongest devotion lever a
platform can add; it converts telemetry into intimacy. Also her best content
analytics.

**A2. The Collar Card (subject profile). [MVP]**
Every subject has a card: chosen name + honorific (from intake), **which Akasha
can rename at will** (renaming = ownership ritual, notified in her voice), rank
(A6), date claimed (join date), chain of obedience (A7), triggers held (A5),
files completed. The app addresses them by this name everywhere — especially in
notifications.
*Why:* identity labeling; self-concept follows the label. Her renaming a subject
is the cheapest, most potent personal touch in the system.

**A3. Anniversaries & milestones. [v1.1]**
Auto-surfaced to admin: 30/90/365 days claimed, 100th listen, program completed.
One tap → personal note or small unlock (a private whisper).
*Why:* commitment ritualization; anniversaries are pre-written excuses for
personal contact.

**A4. Voice-note replies in messages. [v1.1]**
She can answer any message with a 10–60s voice note instead of text.
*Why:* her voice IS the product; a 15-second voice reply outweighs a paragraph
and is faster for her.

### B. Conditioning made structural — continuity

**A5. Trigger Vault. [v1.1]**
Files declare (via organize-agent tags, admin-approved) which triggers/anchors
they **install** and which they **require**. Each subject accumulates a personal
vault of installed triggers from verified listens. Library shows readiness:
"This file requires *the Clicker*. You haven't earned it. Start with
Training Session 3." Vault page = their conditioning record.
*Why:* makes her core promise — real conditioning, continuity across files —
structurally true and visible; also enforces safe sequencing. No competitor
Patreon page can do this.

**A6. The Descent (levels). [v1.1]**
Named ranks earned through consistency + program completion (e.g. Curious →
Entranced → Collared → Conditioned → Devoted → 888). Unlocks at each level:
a private whisper, a spiral skin, early access. Subject-facing copy per
BRAND.md vocabulary — never "XP/levels".
*Why:* endowed progress + identity labels; gives the "built over time" audience
a visible arc. Also a soft upsell scaffold (some levels need tier N content).

**A7. Chain of Obedience (daily ritual). [MVP]**
One small daily act keeps the chain intact: a breath ritual button, a one-line
mantra typed, or ≥5 min listened. Break → the chain "slackens" and a reclaim
notification goes out in her voice ("You slipped. Come back down.").
*Why:* ritual + loss aversion + streak psychology, translated into D/s framing.
Primary retention mechanic.

**A8. Programs as first-class content. [MVP]**
Sequential, optionally day-gated series (her proven format: Training Sessions,
30 Days Chastity). Day N unlocks 24h after completing Day N-1 (or by calendar);
push notification on unlock ("Day 7 is open. You know where to lie down.").
Progress bar per program, certificate-of-completion moment in her voice.
*Why:* Zeigarnik effect (open loops), anticipation scheduling, and it matches
how she already writes. This is the spine of the library, not a playlist skin.

**A9. Session journal / drop reports. [MVP]**
When a session ends: one-tap depth rating (light … gone) + optional "report to
her" text + how they feel. Feeds: their profile timeline, her per-file analytics
(which inductions drop people deepest), and the AI reply corpus.
*Why:* self-disclosure deepens attachment (Aron); effort investment; and it's
her most valuable product feedback loop. Framed as *reporting for inspection*,
not journaling.

**A10. Bedtime mode. [CUT — Akasha, 2026-07-11.]**
Removed at her decision. The sleep timer remains part of the player (F6).

### C. Her presence at scale — variable reinforcement

**A11. Whispers (one-way drops). [MVP]**
A vertical feed only she can post to: short audio whispers, a line of text, an
image, a spiral, a tease of the next file. Targetable (all/tier/segment/
individual — an individually-targeted whisper is devastatingly effective).
Subjects can only acknowledge (a single "kneel" reaction) — no comments.
*Why:* variable-ratio reinforcement (the most habit-forming schedule there is)
gives the app daily-open value beyond the library, while one-way flow preserves
scarcity and sovereignty. This is the anti-"community feed".

**A12. Orders (tasks/assignments). [v1.1]**
She issues orders: listen to X tonight · write your mantra 8 times · abstain
until Friday · reply with one word. Deadline + done/proof acknowledgment;
completion feeds the Chain (A7) and profile. Targetable like notifications.
*Why:* effort justification — investment deepens commitment; also the core D/s
dynamic her audience pays for, made structural.

**A13. Automations. [v1.1]**
Rules she configures once: inactive 5 days → reclaim whisper · new file
published → tier notification · program day unlocked → nudge · chain broken →
reclaim · anniversary → flag to admin. All copy from in-voice template bank.
*Why:* her presence at scale — the platform whispers for her while she sleeps.

**A24. Polls. [MVP — added 2026-07-11, decision D6.]**
She composes a poll (question + 2–8 options), sends to everyone or a segment →
push "She's asking." → full-screen one-tap vote (changeable until close). At
close she gets counts, percentages, the winner, and who voted what (unless she
marks it anonymous); one tap optionally shares the results back to subjects as
a whisper. Votes append to each profile timeline.
*Why:* participatory authorship — voting on the next script makes subjects
co-invested in content before it exists (IKEA effect), and it's live demand
data for her writing. Full spec: PLAN §13.6.

### D. Desire → revenue loops

**A14. Commission waitlist + scarcity. [MVP — part of F3]**
When commissions are OFF, the tab shows a waitlist ("Commissions are sealed.
Petition for a slot.") with the brief form still fillable. When she re-opens,
waitlisted subjects get notified in order.
*Why:* scarcity increases desire; demand is captured instead of bounced.

**A15. Wishlist pipeline. [v1.1]**
Intake wishes (F9) + an always-open "tell me what you crave" box feed an admin
board; similar wishes cluster (AI-assisted); she picks winners. When a wished
file ships, wishers get: "You asked for this. I made it exist. Kneel."
Optionally: a wish can be converted into a paid commission offer to its author.
*Why:* closes the loop desire → content → devotion (subjects feel authorship),
and doubles as a zero-effort content roadmap ranked by real demand.

**A16. Offerings (tributes). [v2 — gated on payment rail]**
A quiet page of one-tap tributes (fixed in-brand amounts, 8/88/888…) with an
optional line of devotion attached; she can acknowledge with one tap.
*Why:* spontaneous devotion needs an outlet; recurring subs alone under-monetize
peak devotion moments. Requires the v2 direct-payment rail (R1).

**A17. Lapse grace + frozen progress. [v1.1]**
When Patreon lapses: access pauses but the account shows everything preserved —
chain length, vault, rank — "frozen, waiting", with her voice note and one-tap
resubscribe. Truthful loss-aversion, not punishment.
*Why:* churn-save at the moment of maximum loss salience; honest because
progress genuinely is preserved.

**A18. The Threshold (free funnel). [v1.1]**
A public teaser zone for YouTube arrivals: 1–2 free files + Day 1 of a program,
behind the same install+notification+intake gate (F8/F9) but no payment.
Conversion path surfaces locked content with her voice doing the selling.
*Why:* she has ~505K YouTube views and a linktree; the platform should be the
funnel's mouth, not only its end. Free users are future subjects already
receiving her notifications.

### E. Safety & trust rails — they protect the fantasy

**A19. Consent architecture. [MVP]**
18+ gate; explicit consent screen for hypnosis content (no listening while
driving/operating machinery; not therapy; limits acknowledgment); per-theme
opt-outs recorded in profile (e.g. no findom prompts). Terms + privacy policy.
*Why:* standard protection for erotic-energy content made for adults (it
matches her Patreon's own 18+ setting), and visible consent rails make
subjects surrender deeper — safety is what makes "safe surrender" sellable.

**A20. Grounding / Emergence button. [MVP]**
Always-reachable control that fades audio and plays her short grounding/wake
track. AI inbox triage (F11) flags distress-flavored messages to the top of her
inbox with a "handle personally" banner (never AI-drafted).
*Why:* responsible hypnosis practice; one bad drop handled badly is a
reputation-level risk. Trust compounds.

**A21. Privacy by design. [MVP]**
Subjects exist under chosen names; email + payment identity stored separately
from kink profile data; export + delete my data (GDPR); no third-party
analytics trackers; quiet hours default ON in the subject's timezone.
*Why:* her audience is high-status men with careers — a leak is existential for
them and for her. Privacy IS a premium feature here.

**A22. Leak-resistant delivery. [MVP baseline / v2 hardening]**
Baseline: no public file URLs; signed, expiring, account-bound stream URLs;
streaming-only by default; downloads (if ever) a top-tier perk. v2: per-user
inaudible audio watermark for forensic tracing of leaks.
*Why:* file piracy is the #1 revenue drain for audio kink creators.

### F. Explicitly NOT building (and why)

- **Subject-to-subject community / chat / comments.** It dilutes the dyad
  (her↔subject), creates moderation burden and drama, and flattens her mystique
  into a Discord. The entire architecture is deliberately one-to-one and
  one-to-many *from her only*.
- Instead, one ambient co-presence signal, optional: **"N subjects are under
  right now"** in the player — social proof and ritual solidarity with zero
  interaction surface. [v2, her call]
- **Public spending leaderboards.** Off-brand for "safe surrender" positioning;
  invites competition-driven regret churn. (A soft, opt-in "her favorites this
  moon" honors list could exist later if she wants it.)
- **Referral programs.** Nobody recruits colleagues into their kink. Growth
  comes from YouTube → Threshold (A18).

---

## 4. Risks & constraints (must-know before build)

**R1. Whop's policy could freeze the business. [RESOLVED 2026-07-11 → D1/D2:
Patreon-only at launch; commissions are direct requests.]** Akasha's content
has no nudity and nothing pornographic — but Whop's prohibited-products policy
bans "services intended primarily for adult sexual gratification," **Whop
decides what that covers**, and enforcement includes account termination with
payment holds of 90–180 days. Not a lever to hand anyone. If/when a direct
rail is added (v2): processors that openly accept erotic-content businesses
with recurring billing — **CCBill, Segpay, Verotel** (also Epoch, NetBilling);
5–10% fees + possible rolling reserve; KYC onboarding takes days — apply
early. Built behind a `PaymentProvider` interface so processors are swappable.

**R2. iOS web push requires iOS 16.4+ and an installed PWA**, with permission
requested from a user gesture. The F8 gate flow is exactly right; needs a
graceful fallback message for older iOS. Android PWA push via FCM is
straightforward. Notification deliverability on iOS is decent but not
guaranteed — never make a *safety* feature depend on push.

**R3. Patreon API dependency.** OAuth + membership data + webhooks are stable,
but tokens expire and webhooks can be missed — entitlements need a periodic
reconciliation sync, and the platform must degrade gracefully if Patreon is
down (cache last-known tier).

**R4. Data sensitivity.** Profiles tie identities to kink data. Treat the DB as
radioactive: encryption at rest, minimal PII, separated identity vs. profile
stores, strict admin-only access, no analytics SaaS with raw content. (A21.)

**R5. Third-party classification risk.** The content is erotic-energy hypnosis
audio — no nudity, not pornography. But payment processors and some hosts
classify by their own broad definitions ("sexual gratification" purpose), which
can sweep in audio regardless of imagery, and the classification decision is
theirs, not ours. The stack therefore never depends on a discretionary
platform: VPS + Bunny for hosting/media (PLAN §1), Patreon for payments.
Online-safety / age-verification laws are tightening in several jurisdictions
(UK OSA, some US states) — the 18+ gate anticipates pluggable
age-verification providers.

---

## 5. Suggested in-brand naming (Akasha may veto)

| System concept | Subject-facing name |
|---|---|
| The app itself | **OBEY AKASHA** / The Temple |
| Onboarding | The Initiation |
| Library | The Library / The Archive |
| Programs | Trainings |
| Streak | Chain of Obedience |
| Levels | The Descent |
| Trigger record | The Vault |
| One-way feed | Whispers |
| Tasks | Orders |
| Tributes | Offerings |
| Free zone | The Threshold |
| Admin cockpit (her only) | The Sanctum |

---

## 6. Priority map

**MVP (launchable core):** F1 F3(request flow) F4 F5 F6 F7 F8 F9 F10 F11 F12
F13 · A1 A2 A7 A8 A9 A11 A14 A19 A20 A21 A22-baseline A24.

**v1.1 (fast follows):** A3 A4 A5 A6 A12 A13 A15 A17 A18.

**v2:** F2 direct subscriptions · A16 offerings · watermarking · presence
counter · age-verification provider integration · anything she adds after
living with v1.

**Cut:** A10.

Authoritative build sequence: PLAN §23 (milestones M0–M7).

---

## 7. Open questions — resolution status (2026-07-11)

1. **Design references** — deferred by Akasha; design is a later dedicated
   pass. Build against the token contract + `/styleguide` (PLAN §4).
2. **Payments** — resolved: Patreon-only at launch (D1); commissions are
   direct requests (D2).
3. **Patreon tiers** — handled in-app: tier→level mapping is admin-config
   after her first sign-in (PLAN §6.2); doesn't block the build.
4. **Catalog** — some files on her laptop, most on Patreon → bulk upload +
   import & match flow (PLAN §7.4).
5. **Downloads** — resolved: yes, in-app offline only (D4 / F13).
6. **Threshold** — approved (v1.1); she picks the free tracks via ADMIN-CONFIG.
7. **Domain** — not yet purchased; everything env-driven (D10). Recommend
   registering `obeyakasha.com` before M7.
8. **AI** — approved; per-task provider abstraction (PLAN §17).
9. **Presence counter** — v2, behind an admin toggle.
10. **Cuts** — A10 only; everything else approved ("I love all those features").
