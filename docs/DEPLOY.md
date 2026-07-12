# Getting OBEY AKASHA online

A plain-language guide to putting the app on the internet so you can sign in and
test it. No coding. You create a few accounts and paste a handful of commands;
the app does the rest (including getting its own HTTPS certificate).

**Time:** ~45–60 minutes the first time. **Cost:** ~€5–15/month + ~$10/year for
a domain.

You'll set up four things, in order:
**A. Domain → B. Server → C. Point the domain at the server → D. Patreon app → E. Launch.**

If you'd rather not touch a server console at all, hand this file to any
developer — it's written so they can do it in 15 minutes — or ask me and I'll
walk you through each screen.

---

## Before you start — what you'll collect

By the end you'll have filled in these values (keep them in a note):

| Value | Where it comes from |
|---|---|
| Your domain | Step A |
| Server IP address | Step B |
| `AUTH_SECRET` | a command generates it (Step E) |
| `POSTGRES_PASSWORD` | you make one up (any strong text) |
| `PATREON_CLIENT_ID` / `PATREON_CLIENT_SECRET` | Step D |
| Your Patreon email | you already know it |

---

## A. Get a domain (~10 min, ~$10/yr)

1. Go to a registrar — [Porkbun](https://porkbun.com), [Cloudflare](https://dash.cloudflare.com), or Namecheap.
2. Search for and buy your domain, e.g. **obeyakasha.com**.
3. That's it for now. Keep the registrar tab open — you'll add one setting in Step C.

---

## B. Create the server (~10 min, ~€5–15/mo)

We use **Hetzner** (cheap, and fine with this kind of content). DigitalOcean
works too.

1. Make an account at [hetzner.com/cloud](https://www.hetzner.com/cloud).
2. **New Project** → name it "akasha" → **Add Server**.
3. Choose:
   - **Location:** closest to most of your audience.
   - **Image:** **Ubuntu 24.04**.
   - **Type:** **CX22** (2 vCPU / 4 GB) is plenty to start (~€5/mo). Pick CPX31 if
     you expect a lot of simultaneous listeners.
   - **Networking:** leave IPv4 on.
   - **SSH keys:** skip if you don't have one — set a **root password** instead
     (you'll get it by email, or set it under "Cloud config"/rescue). Simplest:
     after creating, open the server's **Console** (see next step) which logs
     you in directly.
4. **Create & Buy Now.** After ~30 seconds you'll see the server with an **IP
   address** — write it down.

### Open the server's console

On the server's page in Hetzner, click the **`>_` Console** button (top right).
A black terminal opens in your browser, already logged in as `root`. Everything
below is pasted into this window (right-click or Ctrl+Shift+V to paste).

---

## C. Point your domain at the server (~5 min, then a short wait)

1. In your **registrar** (Step A), find **DNS settings**.
2. Add two records (replace `1.2.3.4` with your server IP):

   | Type | Name / Host | Value |
   |---|---|---|
   | A | `@` | `1.2.3.4` |
   | A | `www` | `1.2.3.4` |

3. Save. DNS can take a few minutes (occasionally up to an hour) to take effect.
   You can continue while it propagates.

> **If your domain is on Cloudflare — read this or the site breaks.**
> Cloudflare shows an **orange cloud** next to each DNS record, meaning it
> proxies your traffic. Your server (Caddy) gets its own HTTPS certificate
> automatically, and the orange-cloud proxy *blocks* that from happening — the
> result is a **"SSL handshake failed — Error code 525"** page for your visitors.
> **Click the orange cloud so it turns grey ("DNS only")** on both the `@` and
> `www` records. That's the setup this stack is built for. (See the 525 fix in
> **Troubleshooting** below if you've already hit it.)

---

## D. Create your Patreon app (~10 min)

1. Go to **[patreon.com/portal](https://www.patreon.com/portal)** → **Clients & API Keys**.
2. **Create Client.** Fill in:
   - **App Name:** Obey Akasha
   - **Redirect URIs:** `https://YOURDOMAIN/api/auth/callback/patreon`
     (use your real domain, keep the `https://` and the exact path)
   - Fill any other required fields with anything reasonable.
3. Save. Copy the **Client ID** and **Client Secret** — you'll paste them in Step E.

---

## E. Launch (~10 min + one build)

Paste these into the Hetzner **Console**, one block at a time.

**1. Install git and get the code.** The repo is private, so use a GitHub
Personal Access Token: at [github.com/settings/tokens](https://github.com/settings/tokens)
create a **classic token** with the **`repo`** scope, copy it, and use it as the
password below (username is your GitHub username).

```bash
apt-get update && apt-get install -y git
git clone https://github.com/narhino/Obeyakasha.git
cd Obeyakasha
```

**2. Create your settings file.**

```bash
cp .env.production.example .env
nano .env
```

`nano` is a simple editor. Fill in the blanks (arrow keys to move):

- `APP_DOMAIN=` your domain, e.g. `obeyakasha.com`
- `APP_ORIGIN=` `https://` + your domain, e.g. `https://obeyakasha.com`
- `AUTH_SECRET=` run this in another console line later, or paste any 40+ random
  characters. (Tip: you can generate one with `openssl rand -base64 32`.)
- `POSTGRES_PASSWORD=` make up any strong password
- `PATREON_CLIENT_ID=` from Step D
- `PATREON_CLIENT_SECRET=` from Step D
- `ADMIN_PATREON_EMAIL=` the email on your Patreon account (this makes **you** the admin)

Save and exit nano: **Ctrl+O**, **Enter**, then **Ctrl+X**.

**3. Start everything.**

```bash
bash deploy/bootstrap.sh
```

This installs Docker, builds the app, and starts it with automatic HTTPS. The
first build takes a few minutes. When it finishes it prints your address.

**4. Open your site.** Visit **https://YOURDOMAIN**. Give it 1–2 minutes on the
very first load while it fetches its security certificate.

---

## First test (the fun part)

1. Open **https://YOURDOMAIN** → **Enter with Patreon** → approve.
2. Because your Patreon email is the admin email, you land in **The Sanctum**
   (your admin area).
3. **Sanctum → Access:** your Patreon tiers appear. Give each one an access
   level (e.g. entry tier = 1, higher tier = 2). Save.
4. **Sanctum → Library:** upload an audio file, set its access level, **Publish**.
5. Open the site on your **phone** the same way, sign in, go to **The Library**,
   and press play — you should hear it, with the spiral in full-screen. Rate your
   drop when it ends.

That's the full loop: you publish, a subject listens, the data lands.

---

## Everyday commands (in the server console, inside the `Obeyakasha` folder)

```bash
# see what's running
docker compose -f compose.prod.yml ps

# watch logs
docker compose -f compose.prod.yml logs -f web

# update to the latest code after I push changes
git pull && docker compose -f compose.prod.yml up -d --build

# stop / start everything
docker compose -f compose.prod.yml down
docker compose -f compose.prod.yml up -d
```

---

## Notes & what's next

- **Audio storage:** to start, files live on the server's disk — perfectly fine
  for testing. When your catalog grows, add a Bunny.net account and paste four
  `BUNNY_*` values into `.env`, then `up -d --build`. No other change.
- **Backups:** once you're past testing, we'll turn on nightly database backups
  (PLAN §20).
- **Notifications & install-to-homescreen (M2 — now built):** see the section
  just below to switch it on.
- **Something wrong?** Copy the output of
  `docker compose -f compose.prod.yml logs --tail=50 web` and send it to me.

---

## Turn on notifications (M2)

Push notifications need one pair of keys. Generate them **inside the running
app** (no extra software on the server), then add them to `.env`:

```bash
cd ~/Obeyakasha
docker compose -f compose.prod.yml exec web npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Open `.env`:

```bash
nano .env
```

and set these three lines (uncomment them if needed):

```
VAPID_PUBLIC_KEY=<the Public Key>
VAPID_PRIVATE_KEY=<the Private Key>
VAPID_SUBJECT=mailto:you@yourdomain.com
```

Save (Ctrl+O, Enter, Ctrl+X), then apply:

```bash
docker compose -f compose.prod.yml up -d
```

Now:

- **Subjects** who open the app go through **the Gate**: confirm they're 18+,
  agree to the hypnosis terms, install to their home screen (on phones), and
  turn on notifications — all in Akasha's voice. Until they do, the Library
  stays behind the Gate.
- **You** get a **Broadcast** page in the Sanctum: send a push to everyone, to
  an access tier, or to one subject, with `{name}` / `{honorific}` personalizing
  each message. It respects quiet hours so you don't wake anyone at 3am.
- Subjects also see every message in an in-app **Whispers** inbox (the ✦ in the
  header), since phone push isn't 100% guaranteed to arrive.

**Note on iPhones:** Apple only allows web-app notifications when the app is
added to the Home Screen (iOS 16.4+), which is exactly why the Gate requires it.
The install/permission steps are guided but not forced (a browser can't reliably
confirm "added to home screen"), so no one gets locked out.

---

## Transcription + organize (M3)

Transcription is **self-hosted and free** — your audio never leaves your server.
It's on by default after you redeploy (`git pull` + `up -d --build`). The first
build downloads the speech model; the first transcription of each file downloads
the model weights once (a minute or two), then it's fast.

**Using it (in the Sanctum):**
1. **Library → a track → Transcribe.** Status shows *processing*, then *done*.
   The script appears in an editable box (fix any mishears, Save).
2. **Organize** (on the track, or **Organize → Organize all**). The agent reads
   the transcript and proposes tags, triggers (with the exact quote as evidence),
   and playlist/program placement.
3. **Organize page → Approve / Reject** each track's proposals. Nothing is
   applied to the Library until you approve it. Approved tags immediately power
   the subject-side filters, and installed triggers start filling each subject's
   vault as they complete files.

**Model size / resources:** default `WHISPER_MODEL=base` is light enough for a
small server. For more accuracy set `WHISPER_MODEL=small` (or `medium`) in
`.env` and redeploy — those use more memory, so prefer them on a 4GB+ server.

**The organize agent needs no AI key** — it works from your title conventions
(`[F4M]`, `[FDOM]`, `DAY 2`, `Training Session 3`…) and transcript keywords. If
you ever want richer proposals, add an `ANTHROPIC_API_KEY` to `.env` and it will
blend in an LLM pass automatically.

**Prefer ElevenLabs?** Scribe (their speech-to-text) is more accurate but paid
(~$0.40/hour after a small free tier). The code already has a provider slot for
it — say the word and I'll wire your `ELEVENLABS_API_KEY` in.

---

## Troubleshooting

### "SSL handshake failed — Error code 525"

This exact error only ever comes from **Cloudflare**. It means Cloudflare is
proxying your domain (the **orange cloud**), and it can't complete a secure
handshake with your server — because your server's Caddy hasn't been allowed to
get its own HTTPS certificate. That "works on one browser, fails on another"
flicker is the same cause: different Cloudflare edges, some retrying the failed
handshake.

**The fix (2 minutes) — turn the proxy off:**

1. Go to the **Cloudflare dashboard → your domain → DNS → Records**.
2. On the `@` record (and `www` if present), click the **orange cloud** so it
   turns **grey** — it now says **"DNS only."**
3. Save. Wait ~2 minutes, then reload **https://YOURDOMAIN** in a fresh tab.
   Caddy fetches its certificate and the 525 is gone.

This is the right setup for this platform anyway: Caddy already gives you free,
auto-renewing HTTPS, and going direct avoids Cloudflare's upload-size limit and
buffering — which matter for long audio files and large uploads.

**If you specifically want to keep Cloudflare's proxy on** (orange cloud, for
its CDN/DDoS shield), you must give the origin a certificate Cloudflare trusts:

1. Cloudflare → **SSL/TLS → Origin Server → Create Certificate** (accept the
   defaults; it's a 15-year cert). Copy the **certificate** and **private key**.
2. On the server, save them (e.g. `deploy/origin.pem` and `deploy/origin.key`),
   and in `deploy/Caddyfile` replace the site line's automatic TLS by adding
   inside the block: `tls /etc/caddy/origin.pem /etc/caddy/origin.key` (mount
   the two files into the Caddy container), then redeploy.
3. Cloudflare → **SSL/TLS → Overview → set the mode to "Full (strict)."**

Grey-cloud (the first option) is what I recommend unless you have a specific
reason to keep Cloudflare in front.

### Site won't load at all / "took too long"

- Give it 1–2 minutes on the very first visit (certificate fetch).
- Check the app is up: in the server console, `docker compose -f
  compose.prod.yml ps` — all services should say `running`/`healthy`.
- Confirm DNS points at the server IP: DNS changes can take up to an hour.

---

## Launch checklist

When you're ready to go from testing to live:

1. **Domain** bought and DNS pointed at the server (HTTPS working).
2. **Patreon app** redirect URI = `https://YOURDOMAIN/api/auth/callback/patreon`;
   `ADMIN_PATREON_EMAIL` set to your Patreon email.
3. **Rotate the Patreon secret** on the Patreon portal, update `.env`, redeploy —
   so the live secret was never shared anywhere.
4. **Tiers mapped** (Sanctum → Access) so each Patreon tier unlocks the right level.
5. **Notifications on** (VAPID keys set — see the section above).
6. **Your catalog** uploaded and published; a couple transcribed + organized.
7. **Record two short audios:** the grounding/"come back up" track and a lapsed-
   member voice note (optional but nice).
8. **Legal:** `/terms` and `/privacy` are live (linked from the landing page and
   in-app). Read them once and tell me any wording to change.
9. **Backups:** add the cron line from `scripts/backup.sh` and run one restore
   drill so you trust it.
10. **Commissions:** decide open or sealed (Sanctum → Commissions toggle);
    align the form fields with your Google Form (Sanctum, or ask me).
11. **Invite:** post your platform link on Patreon / YouTube / linktree.

Everything above except the domain, Patreon app, and your content is already
built and running — most of this is flipping switches in the Sanctum.

## Privacy & data (built in)

- Subjects can **export** everything held about them or **delete their account**
  (Settings → Your data) — immediate and complete. No third-party trackers; a
  strict Content-Security-Policy is set.
- **Analytics** (Sanctum → Analytics) are yours only and never leave the server:
  plays, completion %, unique listeners, mean drop depth, and daily/weekly active.
