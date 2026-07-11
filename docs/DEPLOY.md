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
- **Notifications & install-to-homescreen:** that's milestone **M2** — I build it
  next; it needs two extra keys (`npx web-push generate-vapid-keys`) which we add
  to `.env` when it's ready.
- **Something wrong?** Copy the output of
  `docker compose -f compose.prod.yml logs --tail=50 web` and send it to me.
