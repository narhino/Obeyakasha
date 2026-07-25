# Security audit — pre-launch

Date: 2026-07-25 · Branch: `claude/creator-platform-memberships-feag1l` · Scope: whole
repository (auth, data, media, privacy, headers, deploy, abuse, dependencies).
Method: source review of every API route, every `"use server"` file, the media
and auth layers, the deploy configs, plus a dependency audit. No live system was
touched.

---

## Launch verdict: **GO WITH CAVEATS**

1. **The dangerous holes found are fixed in this commit.** The worst one let any
   signed-in subject overwrite or delete your published audio by naming their
   upload file cleverly; that, plus five smaller ones, are closed and verified.
2. **Nothing found exposes your real name, your email, or your server's IP.**
   Provider names, secrets, and internal paths stay on the server; your Patreon
   data never reaches a subject.
3. **Three things are on you before you open the doors** (numbered list further
   down): set a real `AUTH_SECRET`, keep Cloudflare's orange cloud on, and decide
   whether the public "12 surrendered" counts are acceptable to you — the plan
   says subjects should never see counts of each other.

---

## Findings

| id | area | severity | what it is | status | evidence |
|----|------|----------|------------|--------|----------|
| S-01 | Media / injection | **High** | A subject's upload filename became part of the storage key unfiltered, so `../../stream/<any-track-id>.mp3` let any signed-in subject **overwrite** any track's audio/art — and, by then deleting their own upload, **delete** any stored object. Affected both the local disk and the Bunny provider. | **FIXED** | `src/lib/media/ingest.ts:19` (new `safeStorageName`), applied at `:99`, `:176`; reached from `src/app/api/me/upload/route.ts:86` and `src/lib/library/uploads.ts:82` (delete side) |
| S-02 | Media / traversal | **Medium** | The local-media path guard used `startsWith(ROOT)`, which a sibling directory (`/media-x` next to `/media`) satisfies; an absolute key would also have been honoured. | **FIXED** | `src/lib/media/local.ts:16-28` (now proven with `relative()`) |
| S-03 | Auth / secrets | **Medium** | `AUTH_SECRET` silently fell back to the published default `dev-insecure-secret-change-me`. Had production ever booted without it, anyone could mint a **goddess** session and sign their own media URLs. | **FIXED** | `src/lib/env.ts:9`, `:56-72`, `:77-80` — production now refuses to boot on the default or on a secret under 32 chars |
| S-04 | Authz / D7 | **Medium** | `GET /api/devices?deviceId=` returned any device row unscoped — leaking that another subject's device exists and its install/push state. `POST` could re-point another user's device row (and its push subscription) to the caller. | **FIXED** | `src/app/api/devices/route.ts:78` (read scoped), `:49` (`setWhere` on the upsert) |
| S-05 | IDOR | **Medium** | `sessionId` on the listen endpoints was trusted without an owner check: another subject's session could be read (`completed`, `secondsListened`), inflated, and used to earn the attacker's chain day. | **FIXED** | `src/lib/listen/record.ts:66` (`setWhere`), `:113-127` (both reads scoped) |
| S-06 | Info disclosure | **Medium** | Every `withSubject` route returned the raw thrown message to the client — a driver or filesystem error would have handed a subject table names, paths, or config. | **FIXED** | `src/lib/api.ts:14-19` — logged server-side, `{"error":"request_failed"}` to the client. `withGoddess` still surfaces real messages (admin-only, deliberate) at `:34` |
| S-07 | Abuse | **Medium** | Chunked uploads were keyed only by a client-chosen `uploadId`, with no binding to the caller — a known id let one account append to, or wipe, another's in-flight assembly. | **FIXED** | `src/lib/media/chunked.ts:80`, `:93-97`, `:283-286`, `:306`, `:323-325`; callers `src/app/api/sanctum/upload/route.ts:52`, `src/app/api/me/upload/route.ts:60` |
| S-08 | D7 / privacy | **Medium** | Subjects (and logged-out visitors) are shown **cross-subject counts**: "{n} surrendered" on every whisper, poll tallies with counts and percentages, and an obedience percentile. `PLAN.md:890` says never expose "names, **counts**, receipts". The percentile is also quantised, so a subject can derive the exact subject count. | **RECOMMENDED** (product decision — not changed) | `src/lib/feed/loves.ts:50-70`; `src/lib/feed/whispers.ts:96-123`, `:182`, `:228`; `src/components/whispers/WhispersFeed.tsx:181`; `src/components/whispers/FeedPoll.tsx:96`; `src/lib/stats/standing.ts:27-58`; `src/app/(subject)/me/page.tsx:261`; `src/copy/copy.ts:475`, `:649` |
| S-09 | Dependencies | **Medium** | `next@15.5.16` is behind `15.5.21`: 3 high + 4 moderate advisories apply (DoS via Server Actions, SSRF in Server Actions / rewrites, response-body cache confusion, unauthenticated disclosure of internal Server Function endpoints). No code change needed — a version bump. | **RECOMMENDED** | `package.json:29`; see "Dependency audit" below |
| S-10 | Abuse / DoS | **Medium** | No rate limiting anywhere except message send (`msg_daily_limit`), the presence throttle, and 60-second dedupes. Sign-in, uploads, comments, wishes, votes, proof images and search are all unmetered, and `req.json()` parses an unbounded body before zod ever sees it. | **RECOMMENDED** | `src/app/api/commissions/route.ts:8` (`z.record(z.string(), z.unknown())`, no size bound); `src/lib/messages/ops.ts:25` is the only real limiter |
| S-11 | Abuse / disk | **Medium** | A subject may hold 20 files × 100 MB, but nothing caps **concurrent in-flight assemblies**: many parallel `uploadId`s can each stage up to the per-file ceiling in `/tmp`, swept only after 6 hours. Filling the disk stops Postgres. | **RECOMMENDED** | `src/lib/media/chunked.ts:39` (`STALE_MS`), `:47` (`chunkRoot`); per-file gate at `src/app/api/me/upload/route.ts:56-82` |
| S-12 | Identity leak | **Medium** | Uploaded audio and cover art are stored and served **byte-for-byte** — no transcode, no metadata strip. ID3 tags in your masters (artist, studio, software, comments) and EXIF/GPS in art reach every subject who plays or views them. | **RECOMMENDED** | `src/lib/media/ingest.ts:62` ("No transcode in dev — the original bytes are the stream source"); `src/lib/media/bunny.ts:48-54`; no EXIF handling exists anywhere in `src/` |
| S-13 | Headers | **Low** | CSP is enforced (not report-only) but `script-src` and `style-src` carry `'unsafe-inline'`, so the CSP is not an XSS backstop. No injection sink was found to pair it with (no `dangerouslySetInnerHTML`, no `eval`). | **ACCEPTED-RISK** | `next.config.ts:19-21`; documented as later hardening at `:14-16` |
| S-14 | Privacy | **Low** | The service worker caches every navigation response — including authenticated pages — into a shared cache that sign-out does not clear. On a borrowed device, cached pages remain readable offline. Cuts against Secret mode. | **RECOMMENDED** | `public/sw.js:33-51` |
| S-15 | Media | **Low** | Signed media URLs live 6 hours and are pure bearer tokens; anyone given the URL streams for that window. With the local provider the URL also carries the raw storage key in the query string. | **ACCEPTED-RISK** | `src/app/api/tracks/[id]/stream-url/route.ts:51`; `src/lib/media/local.ts:87-92`; `src/lib/art/resolve.ts:13` |
| S-16 | Authz | **Low** | `ADMIN_PATREON_EMAIL` grants the goddess role by email match. It is convenient, but it is a weaker pin than the numeric id: it trusts whatever email Patreon returns. | **RECOMMENDED** | `src/lib/patreon/sync.ts:125-140`; `src/auth.config.ts:72-77` |
| S-17 | Authz | **Low** | The role lives in the JWT and is never re-read from the database, so a revoked goddess keeps admin until the token expires. Not exploitable by a subject (they can never *gain* the role), but worth knowing. | **ACCEPTED-RISK** | `src/auth.config.ts:58-80`; `src/lib/api.ts:27` |
| S-18 | Abuse | **Low** | `POST /api/offline/grant` accepts any `deviceId` UUID without checking it belongs to the caller. The grant row is keyed to the caller's own id, so impact is limited to writing a grant against a device they don't own. | **RECOMMENDED** | `src/app/api/offline/grant/route.ts:11-14`, `:38` |
| S-19 | Privacy | **Info** | The "new whispers" burn lights even when the new whisper is addressed to someone else — a faint, contentless hint that something exists for another subject. Already documented as deliberate. | **ACCEPTED-RISK** | `src/lib/attention/resolve.ts:36-57` |
| S-20 | Privacy | **Info** | Library "popular" ordering is derived from all subjects' play counts. No number is shown, but the ranking is an observable channel. | **ACCEPTED-RISK** | `src/lib/library/queries.ts:322-333`, `:396-404` |

---

## Dependency audit

`pnpm audit --prod` prints a long list, but most of it does not apply to the
versions actually installed. Filtering each advisory's range against the
lockfile:

| package | installed | verdict |
|---------|-----------|---------|
| `next` | 15.5.16 | **7 advisories apply** (3 high, 4 moderate), all fixed in **15.5.21**. Reachable: Server-Action DoS and the internal Server-Function-endpoint disclosure. The SSRF ones need a custom server / rewrites — this app has neither. |
| `next-auth` | 5.0.0-beta.32 | Clean. The two critical Auth.js advisories cap at beta.31. |
| `@auth/core` | 0.41.3 (pinned by an override) | Clean — the fix version exactly. |
| `drizzle-orm` | 0.45.2 | Clean — the SQL-identifier injection is fixed in 0.45.2, and no dynamic identifiers are used anywhere regardless. |
| `postcss` | 8.4.31 + 8.5.17 | Advisories apply, but postcss only ever runs at build time on your own CSS. Not reachable. |
| `sharp` | 0.34.5 | libvips CVEs apply (`<0.35.0`). Only reachable through `next/image`, which is used on three pages with static local art and no `remotePatterns`. Not attacker-reachable. |
| dev-only (`vitest`, `vite`, `esbuild`, `drizzle-kit`, `brace-expansion`) | — | Never shipped to the server. Ignore for launch. |

A previous commit (`e503b7b`) already patched the critical auth-bypass and
SQL-injection advisories; the remaining `next` gap is one patch release.

---

## What the owner must do herself before launch

1. **Put a real secret in `.env`.** Run `openssl rand -base64 32`, paste the
   result after `AUTH_SECRET=`, and redeploy. The app now refuses to start in
   production without one, so if the site comes up, this is done. Never reuse
   this value anywhere else, and never paste it into a chat or a screenshot.
2. **Pick a long database password** for `POSTGRES_PASSWORD` in the same file.
   The database is not reachable from the internet (checked), but the password
   is the last door if the server is ever shared.
3. **Keep Cloudflare's orange cloud ON for your domain.** That is what hides your
   server's IP address. Use `deploy/Caddyfile.cloudflare` with an Origin
   Certificate, as `docs/DEPLOY.md` describes. If you ever turn the proxy off to
   fix something, your server's address becomes public.
4. **Strip hidden information from your files before you upload them.** Audio
   files carry tags (artist, studio, software, comments) and photos carry camera
   and sometimes GPS data — and this app serves those files exactly as you give
   them. Export audio without tags, and re-save cover images through an editor
   that removes metadata. This is the single most likely way a real name reaches
   a listener.
5. **Decide about the public counts.** Every whisper shows "12 surrendered",
   polls show vote counts, and the You page says "You obey more than 70% of the
   ones who kneel to me." Your own plan says subjects should never see counts of
   each other. If you want them gone, say so and they can be hidden behind a
   setting — it is a small change, but it changes what people see, so it is your
   call, not mine.
6. **Update Next.js soon after launch** (not necessarily before). Change the
   `next` line in `package.json` to `15.5.21`, run `pnpm install`, and redeploy.
   It closes seven known issues in the framework — none of them a break-in, all
   of them "someone could make the site slow or fall over."
7. **Ask for rate limiting in the first week.** Right now nothing stops someone
   from hammering sign-in, uploads, or the wishbox thousands of times. It has not
   been built yet; it is the top item for the first hardening pass.
8. **If you ever shared your `.env` file, or it was on a machine someone else
   used, rotate everything in it** — Patreon client secret, Bunny keys, VAPID
   keys, database password, `AUTH_SECRET`. Nothing secret was found committed to
   this repository (checked), so this is precaution, not a response to a leak.

---

## Appendix — verified safe

Coverage was real; these were read, not assumed.

**Authentication and roles**
- JWT sessions, no session-fixation vector; a fresh token is minted at sign-in
  (`src/auth.config.ts:58-89`). Sign-out is wired on the You page, the Sanctum
  rail, and account deletion.
- A subject can never become the goddess: the role is only ever written from
  `ADMIN_PATREON_USER_ID` / `ADMIN_PATREON_EMAIL` (`src/lib/patreon/sync.ts:125`),
  and the JWT is signed with a secret that is now guaranteed non-default.
- Cookies use Auth.js defaults — `httpOnly`, `SameSite=Lax`, `Secure` with the
  `__Secure-` prefix over HTTPS. No override anywhere (`src/auth.config.ts`).
  `SameSite=Lax` is also what makes the cookie-less-CSRF story hold for the JSON
  POST routes; Next.js server actions carry their own origin check.
- **Every** one of the 8 `/api/sanctum/**` routes re-checks the goddess role in
  the handler, not just in middleware. **Every** one of the 20 `"use server"`
  files calls `requireGoddess()` (or `requireSubject()` / an explicit session
  check) in every exported action. `/sanctum` pages are additionally gated by
  `src/app/sanctum/layout.tsx:2`. Losing the middleware would not open the admin.
- All 43 non-sanctum API routes were enumerated; every one that touches user data
  is behind `withSubject` or an explicit session check. The only unauthenticated
  routes are `/api/health` (returns `{ok, service}` only), `/api/push/vapid-key`
  (a public key by design), `/api/stream` (HMAC-gated), and NextAuth's own.

**Data**
- Every raw-SQL site (`src/lib/jobs/runner.ts`, `src/lib/stats/standing.ts`,
  `src/app/sanctum/analytics/page.tsx`, `src/lib/library/queries.ts:269`,
  `src/app/sanctum/library/actions.ts:240`, `src/workers/index.ts`) uses bound
  parameters or schema-derived identifiers. No user input is ever concatenated
  into SQL. `ffprobe` is spawned with an argument array, never a shell string.
- Zod validates every route body and every action input reviewed; ids that come
  from the user are UUID-checked before use (`orders/[id]/proof:39`,
  `sanctum/series-art:30`, the chunk params at `chunked.ts:111`).
- IDOR sweep across tracks, series, messages, orders, commissions, asks, polls,
  whisper comments, moments, offline grants, uploads and exports: every read and
  write is scoped to the caller (the two exceptions found are S-04 and S-05, both
  fixed). `getAccessibleTrack` settles personal-upload ownership *before* any URL
  is signed (`src/lib/library/queries.ts:653-656`).

**Media**
- Stream tokens are HMAC-SHA256 over `key:exp` with `timingSafeEqual` and a
  length pre-check; a token for one track cannot be replayed against another
  (`src/lib/media/sign.ts`, tested in `src/lib/media/media.test.ts`).
- Entitlement is enforced once, at `/api/tracks/[id]/stream-url`, before signing;
  `/api/stream` trusts only the signature and serves `private, no-store`.
- No signing oracle exists: every key handed to `signStreamUrl` is
  server-constructed or read from the database.

**Privacy and identity**
- Transcripts never leave the Sanctum. The one subject-facing query that touches
  them returns `trackId` only (`src/lib/library/queries.ts:254-273`).
- No LLM, transcription or storage provider name appears in any subject-facing
  string or component. `src/copy/copy.ts` is clean.
- No `NEXT_PUBLIC_*` variables exist. The built client bundles contain no
  secrets, no email address, no admin identifiers and no absolute server paths;
  **no source maps are emitted** (0 `.map` files in `.next/static`).
- Patreon campaign ids, tier ids and emails stay server-side and in the Sanctum.
- Push payloads route through one choke point that rewrites title/body/icon for
  Secret mode before anything leaves the server (`src/lib/push/send.ts:60-65`),
  and the manifest goes neutral per-session (`src/app/manifest.webmanifest/route.ts`).
- D7 re-verified across the whole subject surface: private comments, messages,
  presence ("is she here" is a bare boolean), the live room, the Sanctum-only
  admin readers, the vault, oath, chain, ranks and the data export are all
  caller-scoped. The only cross-subject data reaching a subject are the
  deliberate aggregates in S-08.

**Transport, headers, deploy**
- CSP enforced, plus `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, and
  `poweredByHeader: false` (`next.config.ts:12-46`). HSTS with `includeSubDomains`
  and `-Server` are set at the edge (`deploy/Caddyfile:13-18`, and the Cloudflare
  variant).
- `compose.prod.yml`: Postgres publishes **no** ports, the transcriber and the web
  app use `expose` (container-network only); only Caddy binds 80/443. The
  database and the transcription sidecar are unreachable from the internet.
- `.gitignore` and `.dockerignore` both exclude `.env` and `.env.*`. A scan of
  every tracked file found **no** API keys, tokens, private keys or passwords;
  the two committed env files are templates with empty values.
- No `dangerouslySetInnerHTML`, no `eval`, no `new Function` anywhere in `src/`.

**Verification of the fixes in this commit:** `pnpm typecheck` clean,
`pnpm lint` clean, `pnpm test` 318/318 passing (including the database-backed
listen and media suites), `pnpm build` succeeds.
