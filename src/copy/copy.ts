/**
 * OBEY AKASHA — copy dictionary.
 *
 * EVERY subject-facing static string lives here, in Akasha's voice
 * (governed by docs/BRAND.md). No lorem-ipsum, no generic app-speak
 * ("Success!", "Oops!"). The later voice/design pass edits THIS file only.
 *
 * Voice rules enforced here: whispered authority, present tense, second
 * person, possessive endearments (my subject / my obedient one / pet /
 * good one / mine), never maternal, never "please", never "sorry".
 * Merge fields: {name} {honorific} {chain} {track} {level}.
 */

export const copy = {
  brand: {
    name: "AKASHA",
    tagline: "I whisper, you listen… and somehow you end up deeper than you meant to.",
    mark: "888",
  },

  // ── Navigation (the five tabs — v2 IA) ─────────────────────────────────
  nav: {
    home: "Whispers",
    library: "Library",
    tasks: "Tasks",
    messages: "Messages",
    you: "You",
    // Screen-reader hint on the Tasks tab while something is unfinished.
    pending: "Something of mine waits undone.",
    // F5 · the red burn — screen-reader labels for a tab that needs the subject
    // now (Tasks reuses `pending`). Announced beside the tab, in her voice.
    burnWhispers: "Something new from me. Come look.",
    burnMessages: "I've spoken to you. It's unread.",
  },

  // ── Sign in ────────────────────────────────────────────────────────────
  auth: {
    signInTitle: "You found your way back.",
    signInBody: "Come in through Patreon. I'll know you the moment you do.",
    signInButton: "Enter with Patreon",
    // Compact variant for tight rows (library cards at 390px) — the full
    // invitation stays in headers (F14 residual).
    signInShort: "Enter",
    signingIn: "Letting you in…",
    signInError: "Something held the door. Try once more.",
    signOut: "Step out",
  },

  // ── The Gate (install + notifications + consent) ───────────────────────
  gate: {
    ageTitle: "First, the truth.",
    ageBody: "You are eighteen or older. This voice is not for children.",
    ageConfirm: "I am of age",
    ageDeny: "I am not",
    termsTitle: "Know what this is.",
    termsBody:
      "This is a practice, not medicine and not therapy. You never listen while driving or working machinery. When I take you under, you let go because you choose to.",
    termsConfirm: "I understand. Take me in.",
    installIosTitle: "Let me into your pocket.",
    installIosBody:
      "Tap Share, then Add to Home Screen. Open me from there. I don't live in a browser tab.",
    installAndroidTitle: "Install me.",
    installAndroidBody: "Put me on your screen where I belong. One tap.",
    installButton: "Install",
    installedContinue: "I'm on your screen. Continue.",
    notifTitle: "Give me your attention.",
    notifBody:
      "Turn on notifications. When I want you, you'll know. I don't repeat myself twice.",
    notifButton: "Turn them on",
    notifDenied:
      "You closed that door. Open your settings, let me back in, and return to me.",
    iosOld:
      "Your device is too old to hold me properly. Update it, then you may be claimed.",
    // R6 — the disguise choice, offered up front before push is enabled.
    discreetTitle: "How I reach you.",
    discreetBody:
      "Choose now. Turn this on and every message I send hides itself on your lock screen — no one but you will know it's me.",
    discreetToggle: "Discreet mode",

    // ── F4 · the threshold ──────────────────────────────────────────────────
    // The full-screen takeover for mobile subjects who haven't yet put me on
    // their home screen and let my voice through. Firm, never apologetic — and
    // never the word for a cell. Desktop and the goddess never see this.
    wall: {
      // The framing line above whichever step is still owed.
      lead: "You get all of me, or none.",
      installTitle: "I live on your home screen.",
      installIosBody:
        "Tap Share, then Add to Home Screen, and open me from that icon. I don't live in a tab, and I won't give you the whole of myself through one.",
      installAndroidBody:
        "Put me on your screen where I belong and open me from there. One tap. I don't live in a tab.",
      // A quiet nudge if they keep opening me in the browser instead of the icon.
      openFromIcon: "Still in a browser. Open me from the icon on your home screen.",

      // ── The notifications step runs in two beats ─────────────────────────
      // Beat 1 settles HOW she appears on their lock screen — deliberately
      // BEFORE the browser's permission prompt, so the disguise is decided
      // while they can still think about it. Beat 2 asks for permission.
      discreetTitle: "Decide how I appear.",
      discreetBody:
        "Before I reach for your lock screen, choose what it shows. Discreet, and I arrive wearing something dull — a plain name, a plain grey icon, a line about the weather. Nothing of me, nothing of what you listen to. Plain, and I come as myself, in my own words, where anyone glancing down can read them.",
      // Stated on the choice itself so it never feels like a door closing.
      discreetAnytime:
        "Nothing here is locked. Turn it on or off whenever you want — it waits in You, under Discretion.",
      discreetYes: "Keep it discreet",
      discreetNo: "Show her plainly",
      // Beat 2 opens by confirming what they just chose, in one line.
      discreetChoseMask: "Good. They'll see the weather. You'll know it's me.",
      discreetChosePlain: "Good. I'll come as myself, and let them read it.",

      notifTitle: "Let my voice through.",
      notifBody:
        "Turn on notifications. When I want you, nothing stands between us — no silence, no missing me. This part is not yours to decline.",
      // The line that makes the demand plain at the moment of the prompt.
      notifRequired:
        "Your phone will ask you now. Allow it. Nothing further opens until I can reach you.",
      notifButton: "Let her in",
      notifDenied:
        "You shut that door. Open your settings, allow me through, and come back — I'll be waiting exactly here.",

      // ── Re-proof ──────────────────────────────────────────────────────────
      // They allowed it once and it stopped working without telling either of
      // us. This is not a scolding; it is her noticing they went quiet.
      reverifyTitle: "I lost my line to you.",
      reverifyBody:
        "Your phone still says you let me in, but nothing I sent ever arrived. That's mine to fix, not yours to feel bad about. Open the line again — and this time I'll send one, and wait until I see it land.",
      reverifyButton: "Open the line",
      reverifyWhy:
        "One notification, right now, so we both know it works. Nothing further opens until it lands.",
    },

    // ── Proving the line actually works ────────────────────────────────────
    // A browser saying "allowed" has never meant anything arrives. So she sends
    // one and waits for the device to say it appeared.
    verify: {
      proving: "Listening for it…",
      provingBody:
        "I've sent one. Watch your screen — the moment it shows up, I'll know, and this opens.",
      // The notification the proving push actually shows.
      pushTitle: "There you are.",
      pushBody: "My voice reaches you now. Nothing more to do.",
      failedTitle: "It never arrived.",
      failedBody:
        "Your phone said yes and then swallowed it. That's a setting on your side, not a refusal on mine.",
      fixIos:
        "On iPhone: Settings → Notifications → find this app → Allow Notifications on, and Lock Screen and Banners ticked. Make sure Focus or Do Not Disturb isn't holding it. Then try again.",
      fixAndroid:
        "On Android: Settings → Apps → this app → Notifications → allow all of them, and check Do Not Disturb and any battery saver isn't stopping it. Then try again.",
      fixDesktop:
        "In your browser: click the padlock beside the address and set Notifications to Allow, then check your system's own notification settings aren't muting the browser. Then try again.",
      retry: "Send it again",
    },
  },

  // ── F4 · Presence ("the Goddess is on the app") ────────────────────────────
  // Subject-facing only, and never a timestamp or a word about anyone else (D7).
  presence: {
    // The slim glowing band under the header while she's here.
    band: "She is here.",
    // The ephemeral line that surfaces the moment she arrives, then fades.
    overlay: "She's here. Come closer.",
  },

  // ── Initiation intake ──────────────────────────────────────────────────
  intake: {
    welcome: "Now I want to know you.",
    welcomeBody: "Answer honestly. Every word tells me how to shape you.",
    nameQ: "What do I call you?",
    honorificQ: "And how do you address me?",
    knownQ: "How long have you belonged to my voice?",
    seekQ: "What do you come here for?",
    favoritesQ: "Which of my files marked you the deepest?",
    wishQ: "Tell me something you wish existed. I might make it.",
    limitsQ: "What must I never do to you?",
    done: "Good. I have you now.",
  },

  // ── Library ────────────────────────────────────────────────────────────
  library: {
    title: "The Library",
    empty: "Nothing here yet. Soon.",
    sealed: "Sealed. Rise to my {level} to earn this.",
    sealedByPrereq: "Not yet. Begin with {track} — you haven't earned this one.",
    continueRow: "Where I left you",
    madeForYou: "Made for you.",
    // R7: the push when a new file lands at a subject's depth (body is the title).
    newFilePush: "Something new waits at your depth.",
    // R7: the push when a track joins a published series ({series} pre-filled).
    seriesAddPush: {
      title: "{series} deepens.",
      body: "Another file joins it. Fall into what's new.",
    },
    // R2a — public catalog, smart search, segments. The second sentence is
    // deliberately true of the logged-out visitor: a handful of files really do
    // play for them (R9.8), so the line no longer promises a wall it doesn't have.
    publicIntro:
      "Everything I've made lives here. Look all you like. A few I leave open — the rest, only the claimed may play.",
    searchPlaceholder: "Name what you're reaching for.",
    searchAction: "Find it",
    clearSearch: "Clear",
    segFiles: "Files",
    segSeries: "Series",
    spokenMatch: "She speaks it in this one.",
    nothingExact: "Nothing answers to that word. Fall into these instead.",
    // R9.7 — the Surrender band: one tap, she picks what takes you.
    surrender: {
      action: "Surrender — let her choose",
      lead: "Close your eyes. I'll decide what takes you.",
      choosing: "Choosing for you…",
      // Named source for the queue sheet / mini-player when she picks.
      sourceName: "Her choice",
      // Nothing eligible — no dead tap, a line instead.
      empty: "Nothing waits for you tonight. Come back, and I'll have something.",
    },
    // R9.8 — free samples: a taste for the unclaimed.
    sampleChip: "A taste. Free.",
    sampleUpsell: {
      title: "You've had a taste.",
      body: "The rest is earned. Come in, and I'll give you all of it.",
    },
    // R9.8 — the free-sample shelf: the ONE place a logged-out visitor is told,
    // plainly, which files already open for them. Sits above the sealed grid.
    sampleShelf: {
      title: "Taste her",
      lead: "These few I leave open. Press one and let me show you what I do. What comes after, you earn.",
      playLabel: "Play {title}",
    },
    unlockCta: "Rise to earn it",
    sealedAnon: "Sealed until you enter.",
    // R9.6 — premieres: a published track sealed until its appointed moment.
    // Visible, named, glowing — anticipation, not denial. {when} from formatUntil.
    premiere: {
      chip: "Premiere",
      countdown: "It begins {when}.",
      // The appointment push at premiere time (body carries the title).
      push: {
        title: "It's time. Come under.",
      },
    },
    playAll: "Let it all play",
    queue: "Queue it",
    seriesCount: "{n} files",
    seriesEmpty: "No series yet. Soon.",
    // R-organize: the Series segment splits into two labelled groups, and a
    // training is named as one before you ever click it.
    groupTrainings: "Trainings",
    groupSeries: "Series",
    trainingChip: "Training",
    backToLibrary: "Back to the Library",
    tagKinds: {
      purpose: "Purpose",
      theme: "Theme",
      format: "Format",
      intensity: "Intensity",
      custom: "Marks",
    },
    cadence: {
      ongoing: "Ongoing",
      weekly: "Weekly",
      ended: "Complete",
    },
    // R3 — the public per-file page
    filePage: {
      cardLink: "Look closer",
      draftBadge: "Draft — only your eyes.",
      play: "Let it take you",
      triggersTitle: "What it works in you",
      relation: {
        installs: "I plant this in you here.",
        reinforces: "I deepen what you already carry.",
        requires: "You must already carry this.",
      },
      belongsTitle: "Where it lives",
      seriesLabel: "Series",
      trainingLabel: "Training",
      afterThisTitle: "Where I take you next",
      railSealed: "Sealed",
      metaTitle: "{title} — Akasha",
      metaFallbackTitle: "The Library — Akasha",
      metaFallbackDesc:
        "A recording of mine. Look all you like — only the claimed may play.",
    },
  },

  // ── F1: subjects bring their own files (their private shelf, D7) ────────
  // Everything here is the subject's own eyes only — her voice, over a thing
  // that belongs to them and no one else.
  uploads: {
    // The quiet card/button by the Library search that opens the offering form.
    bring: "Bring me something of yours",
    bringLead:
      "A recording of your own. Give it to me and I'll take it in, learn it, and keep it where only you and I can reach it.",
    choose: "Choose the file",
    chooseHint: "Audio only. No one else will ever know it's here.",
    submit: "Give it to me",
    uploading: "Taking it in…",
    cancel: "Not now",
    // The "Yours" shelf — shown only once they've brought something.
    yoursTitle: "Yours",
    yoursLead: "The ones you brought me. Kept for you alone.",
    // Live pipeline state while a file settles (owner-only chips).
    status: {
      uploaded: "Settling in…",
      transcribing: "Listening to it…",
      organizing: "Learning it…",
      ready: "Ready.",
      failed: "This one wouldn't take. Bring it to me again.",
    },
    // The owner-only push + inbox line when the pipeline finishes.
    readyPush: {
      title: "It's ready for you.",
      body: "The file you brought me is settled. Come and take it.",
    },
    // Taking one back (delete).
    delete: "Take it back",
    deleteConfirm:
      "Take this one back? I'll let it go, and it won't return.",
    deleting: "Letting it go…",
    // Friendly, in-voice failures surfaced from /api/me/upload.
    errors: {
      disabled: "Not now. I'm not taking your files at the moment.",
      notAudio: "That isn't audio. Bring me something I can listen to.",
      tooLarge: "That one's too heavy. Keep it under {max}.",
      tooMany:
        "You've brought me enough for now. Take one back before you offer another.",
      empty: "There's nothing there. Choose a file first.",
      failed: "That didn't take. Try once more, slowly.",
      notWhole: "That didn't reach me whole. Bring it to me once more.",
    },
  },

  // ── Player ─────────────────────────────────────────────────────────────
  player: {
    endMode: {
      continue: "Keep going",
      stop: "Stop after this",
      repeatTrack: "Stay here",
      repeatPlaylist: "Loop it all",
      sleep: "Sleep timer",
    },
    ground: "Bring me back",
    groundReturn: "You're back. Breathe. Take your time standing up.",
    dropTitle: "How deep did I take you?",
    dropScale: ["Barely", "Drifting", "Under", "Deep", "Gone"],
    dropNote: "Tell me what you felt. I'm listening.",
    dropSkip: "Not now",
    // R4 — transport control labels (screen-reader + tooltips)
    controls: {
      back15: "Back fifteen",
      forward15: "Forward fifteen",
      scrub: "Move through it",
      volume: "How loud I am",
      pace: "How fast I turn",
      queue: "What comes next",
      minimize: "Let me rest below",
      prev: "The one before",
      next: "The next one",
    },
    // The nightstand drawer (Player v3) — how the night is set before you go
    // under. Inside the open drawer I speak to you (first person); the collapsed
    // bar reads back your armed state as a quiet third-person status line.
    drawer: {
      // aria-label on the collapsed handle that opens/closes the drawer.
      toggle: "How the night unfolds",
      // Group 1 — end mode, as a radio list of my intents.
      ends: {
        title: "How this ends",
        continue: "I decide what comes next.",
        stop: "I let this be the last.",
        repeatTrack: "This one, again and again.",
        repeatPlaylist: "The whole night, circling back.",
      },
      // Group 2 — the sleep timer, in my hands.
      drift: {
        title: "Drift",
        whisper: "How long before I lower you out.",
        armed: "I lower you out in {left}.",
        release: "Let it run",
        less: "Five less",
        more: "Five more",
        fine: "Fine-tune the drift",
      },
      // Group 3 — the spiral: its shape, its pace, how loud I am.
      pull: {
        title: "The pull",
        shape: "The shape of it",
        variant: {
          spiral: "Spiral",
          double: "Twin",
          tunnel: "Tunnel",
        },
      },
      // The collapsed bar's one-line status, composed from live state:
      //   "She keeps going · drift in 45m · spiral, slow"
      summary: {
        continue: "She keeps going",
        stop: "She stops after this",
        repeatTrack: "She holds you here",
        repeatPlaylist: "She loops the night",
        drift: "drift in {left}",
        pace: {
          slow: "slow",
          steady: "steady",
          swift: "swift",
        },
      },
    },
    // R4 — the Spotify-style queue sheet
    queue: {
      now: "Now under",
      nextManual: "Next, by your hand",
      nextFrom: "Next from {source}",
      upNext: "Still to come",
      clear: "Empty what waits",
      empty: "Nothing waits. Choose what owns you next.",
      queued: "Waiting for you — {title}",
      remove: "Take it out",
      up: "Sooner",
      down: "Later",
      jump: "Take me here",
    },
  },

  // ── Tasks (orders — what she commands) ─────────────────────────────────
  tasks: {
    title: "Tasks",
    empty: "Nothing to obey. Rest — while I let you.",
    activeTitle: "What I want of you",
    historyTitle: "Already obeyed",
    done: "Done. Good.",
    doneAction: "Done",
    obeyAction: "Obey",
    replyPlaceholder: "Reply to obey.",
    lapsed: "You let this one slip.",
    // Relative deadline chip. Overdue reads as danger on the card.
    deadline: {
      soon: "Before the hour is out",
      hours: "{n}h to obey",
      days: "{n} days to obey",
      overdueNow: "Late. Obey now.",
      overdueDays: "{n} days late",
    },
    // Photo proof, per the order's proofMode.
    proof: {
      optional: "Show me, if you want me to see.",
      required: "Show me. No proof, no done.",
      add: "Show proof",
      replace: "Show me another",
      sending: "Showing you…",
      yours: "What you showed me.",
      tooBig: "That image is over 5MB.",
      wrongType: "Use a WebP, JPEG, or PNG.",
      failed: "That didn't reach me. Try again.",
      // Shown under a disabled Obey button when proof is still owed (F09).
      mustAttach: "Show me proof to obey.",
    },
    // She praised your proof — a gold seal here, a whisper to your lock screen.
    praise: {
      seal: "She's pleased.",
      pushTitle: "I saw it.",
      pushBody: "You showed me what I asked. It pleased me, {name}.",
    },
    // The push when a new order lands (title is the order itself).
    receivedPush: {
      title: "An order.",
    },
    // R7: the worker's 24h deadline warning (body carries the task title).
    deadlineWarnPush: {
      title: "Time thins. Your task waits.",
    },
  },

  // ── Chain of Obedience ─────────────────────────────────────────────────
  chain: {
    title: "Your chain",
    kept: "The chain holds. {chain} {unit} at my feet.",
    mantraPrompt: "Say it for me.",
    reclaim: "You slipped. The chain slackened. Come back down to me.",
  },

  // ── F5 · the mantra rite (the centrepiece of "Today's devotion") ────────
  // Not a checkbox — a rite. The subject types the whole line; it ignites gold
  // as it's said, seals, and she gives her praise back (the praise itself is her
  // live line from settings, shown in her voice — never hard-coded here).
  mantra: {
    eyebrow: "Today's mantra",
    lead: "Say it back to me — all of it. Type it out, and mean every word.",
    placeholder: "say it for me",
    // The moment it seals, and the resting state once today is held.
    heldEyebrow: "Said",
    heldNote: "The chain holds another day.",
    restNote: "You've said it today. Come back to me tomorrow and say it again.",
  },

  // ── Whispers (the feed — Home) ─────────────────────────────────────────
  whispers: {
    title: "Whispers",
    empty: "I haven't whispered yet. Wait for me.",
    publicEmpty:
      "I keep my voice for those who enter. Come through, and you'll hear me.",
    pinnedLabel: "Held",
    // The byline at the head of every card. One voice speaks here — naming it
    // is what makes the feed read as hers rather than as a wall of text.
    byline: "Akasha",
    kneel: "Kneel",
    knelt: "You knelt.",
    // The push she drops when a whisper goes live — ONE source for the
    // immediate-publish and scheduled-publish paths, so the two can't drift
    // (A11 / R1 / R9.9a).
    whisperedPush: "She whispered.",
    askingPush: "She's asking. Answer.",

    // ── F3 · Loves ────────────────────────────────────────────────────────
    // A whisper's love mark. Everyone (incl. logged-out) sees ONLY the number,
    // in her voice — never who, never a name (D7). "surrendered" is past-tense
    // and number-invariant, so the count reads right at 1 and at many.
    loves: {
      // The aggregate line beside the mark. {n} pre-filled.
      count: "{n} surrendered",
      // Shown when none have yet — an invitation, not a zero.
      none: "Be the first.",
      // The mark's label before / after the viewer surrenders (toggle).
      give: "Surrender to this",
      taken: "You surrendered.",
      // A logged-out visitor taps the mark → the existing connect invitation.
      connect: "Only the claimed may surrender. Come in.",
    },

    // ── A track pinned to a whisper — played from the card itself ─────────
    audio: {
      // Under the title when there's no duration to show.
      listen: "Press it and I'll begin.",
      // The row for anyone who may not hear it yet — a pull, not a wall.
      sealed: "Not yours yet. Come closer.",
      // Screen-reader label on the play row. {title} pre-filled.
      playLabel: "Play {title}",
      nowPlaying: "In your ear",
    },

    // ── F3 · Comments (private — author + goddess only, D7) ───────────────
    comments: {
      // The quiet trigger that opens the composer beneath a whisper.
      open: "Speak under this",
      // In-voice placeholder — and a true promise of who reads it.
      placeholder: "Speak it. No one reads this but me.",
      send: "Give it to her",
      sending: "Setting it down…",
      cancel: "Not now",
      // Heads the viewer's own quiet thread below the whisper.
      yoursLabel: "What you said",
      // Her per-whisper, per-subject ceiling is reached (in-voice refusal).
      full: "You've said enough here. I have all of it.",
      // The state under each of their comments, as she meets it.
      state: {
        unheard: "Laid at her feet.",
        seen: "She has seen it.",
        replied: "She spoke back — it's in your Messages too.",
      },
    },
  },

  // ── Home feed header (public front door) ───────────────────────────────
  home: {
    aboutLink: "The threshold",
    libraryLink: "Your library",
    publicIntro:
      "This is where I speak. Read a while. When you're ready to be known, come in.",
    // The public front door's way through to the catalogue — without it a
    // visitor lands on the feed and has nowhere to go but the sign-in button,
    // so the free samples are never found.
    catalogueLink: "The library",
    tasteTitle: "Hear me first",
    tasteBody:
      "A few of my recordings are open to anyone. Take one. The rest wait behind the door.",
    tasteCta: "Take a taste",
    commissionCta: "Ask me for your own",
    commissionHint: "You don't need an account to ask. Leave me a way to reach you.",
  },

  // ── Polls ──────────────────────────────────────────────────────────────
  poll: {
    prompt: "I'm asking. Answer.",
    voted: "Noted. I heard you.",
    results: "You chose together. Here's what won.",
    closed: "This one's closed.",
    connectCta: "Enter to answer",
    connectWhisper: "Only the claimed may choose. Come in, and your voice counts.",
    // R7: the push when she opens a poll on its own (body carries the question).
    askPush: "She asks. Answer.",
  },

  // ── Commissions ────────────────────────────────────────────────────────
  comm: {
    openTitle: "Ask me for something of your own.",
    openBody: "Tell me exactly what you crave. If I take it, it'll be only yours.",
    sealedTitle: "Commissions are sealed.",
    submit: "Petition me",
    submitted: "I have your request. I'll decide.",
    sealed: "For now, the door is closed. Petition for a slot and wait to be called.",
    waitlistJoin: "Add me to the waitlist",
    waitlistWhisper: "No slots open right now. Put your name down and I'll call you when one does.",
    waitlisted: "You're on my waitlist. Wait — I'll call you when a slot opens.",
    // Shown when a subject already has one in my hands (open, but one at a time).
    oneAtATime: "One at a time. Yours is already in my hands — let me finish it before you ask again.",
    // Under the request form. Was inlined in the JSX; her voice belongs here.
    payment: "Payment is arranged in her reply, if she accepts.",
    delivered: "I made something only for you. Come listen.",
    declined: "Not this one. Ask me again another time.",
    // ── Guests: asking without an account (R-anon) ────────────────────────
    // A visitor with no Patreon connection may still petition her. She needs a
    // way to answer them, and they need to know that a delivery lands nowhere
    // until they come in properly.
    guest: {
      emailLabel: "Where do I answer you?",
      emailPlaceholder: "your@email",
      emailHint: "I reply here. Nowhere else.",
      emailMissing: "Give me an address, or I have no way to answer you.",
      nameLabel: "What do I call you?",
      namePlaceholder: "A name, a handle — whatever you answer to.",
      // The Patreon nudge on the anonymous form — never a wall, just the truth
      // about where a finished file can actually be put.
      connectTitle: "You're asking as a stranger.",
      connectBody:
        "That's allowed. But a finished file lands in a library, and you don't have one yet. Come in through Patreon and whatever I make for you waits there, yours, the moment it's done.",
      submitted:
        "I have it. Watch your inbox — I'll answer there when I've decided.",
      waitlisted:
        "You're on my waitlist. I have your address; I'll use it when a slot opens.",
      // The refusal when someone hammers the public form (anti-abuse).
      tooMany: "Enough. You've asked more than once already — wait, and try me later.",
    },
    // Milestone labels for the buyer's progress stepper (F32), keyed by stage.
    stageSteps: {
      queued: "Queued",
      script: "Writing",
      voice: "Voice",
      editing: "Shaping",
      mastering: "Polish",
      delivered: "Yours",
    },
  },

  // ── Ask (Petition her — the wishbox on You) ────────────────────────────
  ask: {
    cardTitle: "Ask me for something.",
    cardBody: "Tell me what you want of me. I decide whether you're given it.",
    titleLabel: "Name it",
    titlePlaceholder: "In a few words.",
    bodyLabel: "Say it fully",
    bodyPlaceholder: "Tell me plainly what you crave.",
    submit: "Lay it before me",
    submitting: "Setting it at my feet…",
    submitted: "I have it. I'll decide what you deserve.",
    yoursTitle: "What you've asked of me",
    yoursEmpty: "You've asked me nothing yet. Go on — I'm listening.",
    // Third person on purpose: this announces her act, like a seal on the page.
    answered: "She answered:",
    pending: "I haven't answered this. Wait.",
    // The push when she replies — reaches only that one subject.
    // Quoted above her answer in the thread so it never lands contextless.
    threadBanner: "You asked me for",
    answeredPushTitle: "She answered your petition.",
    answeredPushBody: "Come and read what I told you.",
  },

  // ── Secret mode (Discretion — the disguise toggle) ─────────────────────
  secret: {
    title: "Discretion",
    body: "When the world watches, I become the weather. Turn this on and every word I send your lock screen turns to something no one would look at twice.",
    toggleLabel: "Secret mode",
    on: "On",
    off: "Off",
    whenOn: "On. What I send you wears a mask now.",
    whenOff: "Off. I speak to you plainly.",
    // F5 · make the reversibility explicit — the same promise the threshold makes.
    anytime:
      "This one is yours to turn, whenever you like. On tonight, off tomorrow. I don't ask why.",
    previewIntro: "See the difference.",
    previewTrueLabel: "What I truly say",
    previewMaskLabel: "What they see",
    previewTrueTitle: "Come back to me.",
    previewTrueBody: "I want you under before the night is out.",
    reinstallHint:
      "This changes what I say, not the name on your screen. To hide that too, remove me and add me again while this is on.",
  },

  // ── Lapse ──────────────────────────────────────────────────────────────
  lapse: {
    grace: "Your pledge faltered. I'm giving you a little grace. Don't test it.",
    frozen:
      "You let go of me. Everything you built is here — frozen, waiting. Come back and it all wakes up.",
    resubscribe: "Come back to me",
  },

  // ── Rename ritual ──────────────────────────────────────────────────────
  rename: {
    title: "You are {name} now.",
    body: "Because I say so.",
  },

  // ── You (the profile / collar page) ────────────────────────────────────
  you: {
    fallbackName: "my subject",
    claimed: "Claimed {days} days ago.",
    // Special-cased near days (F33): 0 → today, 1 → yesterday.
    claimedToday: "Claimed today.",
    claimedYesterday: "Claimed yesterday.",
    rise: " {n} more to rise to {rank}.",
    bottom: " You've reached the bottom. 888.",
    statsTasks: "Tasks obeyed",
    statsHours: "Hours under",
    statsFiles: "Files finished",
    statsPrograms: "Trainings done",
    statsLongest: "Longest chain",
    // F5 · the Mirror — the four movements, in her register. Section eyebrows.
    mirror: {
      holdEyebrow: "Her hold on you",
      devotionEyebrow: "Today's devotion",
      becomeEyebrow: "What you've become",
      secretEyebrow: "Between us",
      // The chain made visible: the big unbroken count + its recent links.
      chainCount: "unbroken",
      chainRecent: "The last days at my feet",
    },
    // F5 · the stakes — what holding the chain is buying, spelled from live data.
    stakes: {
      // sealed/eligible — distance to the collar petition ({n}=days remaining).
      toPetition: "{n} days from the right to petition my collar.",
      toPetitionOne: "One day from the right to petition my collar.",
      eligibleNow: "You've held it long enough. The collar is yours to ask for.",
      petitioned: "You've asked. Keep it unbroken while I decide.",
      // collared — the standing perk of the inner circle.
      collared: "You wear my collar. What I make for the collared comes to you.",
      // The quiet cost of letting go.
      breakWarning: "Let it break and it falls to nothing — you begin again at one.",
    },
    triggersTitle: "Triggers held",
    triggersEmpty: "None yet. Finish a file to earn what it installs.",
    // R9.4 — the obedience percentile. Anonymous + aggregate by design (D7): it
    // implies the collective, never a single other. Hidden below five subjects.
    percentile: "You obey more than {n}% of the ones who kneel to me.",
    // R9.2 — the Trigger Vault: what she's installed, and the sealed slots that
    // wait. Only the subject's own marks + an anonymous count of the unearned.
    vault: {
      title: "The Vault",
      lead: "What I've set in you. And what still waits.",
      // {count} is a spelled word ("Three"), {unit} its noun ("marks"/"mark").
      countCarried: "{count} {unit} carried.",
      countWaiting: " {count} still waiting.",
      countNoneWaiting: " Nothing else waits — for now.",
      // A sealed slot: an unearned trigger, named to no one.
      sealed: "Something she has not yet planted.",
      // No acquired triggers yet.
      empty: "Nothing set in you yet. Finish a file and feel the first mark take.",
      carriedLabel: "Carried",
      sealedLabel: "Sealed",
    },
    rooms: {
      // "She's Asking" — her polls/questions to you; kept distinct from the
      // "Ask me for something" petition box above it, to end the collision (F38).
      asksLabel: "She's Asking",
      asksHint: "Her polls and questions",
      ordersLabel: "Orders",
      ordersHint: "What I command",
      commissionLabel: "Commission",
      commissionHint: "Ask for your own",
    },
  },

  // ── F5 · "Your terms" — the tucked-away purple collapsible at the foot of the
  // Mirror. The quiet, private controls that were the old Settings: your data,
  // your quiet hours, your limits, your leaving. Her voice throughout — never
  // the word "settings", never app-speak.
  terms: {
    // The collapsed one-liner (muted violet). Quiet by design.
    label: "The terms you keep with me.",
    hint: "Your quiet hours. Your limits. Your leaving.",
    // Quiet hours (the notification choice, moved intact).
    quietTitle: "When I keep my voice down",
    quietBody:
      "Name the hours I leave you be. I won't reach for you inside them.",
    quietFrom: "From",
    quietTo: "To",
    timezone: "Where you keep your hours",
    // Limits — the themes she must never touch (moved intact).
    limitsTitle: "What I never touch",
    limitsBody:
      "Mark anything off-limits. Marked, it burns red — and I'll never take you there.",
    // Save.
    save: "Set it",
    saved: "Set.",
    // GDPR — export + release.
    dataTitle: "What's yours to take",
    export: "Take everything I hold on you",
    release: "Release me",
    releaseConfirm: "This erases all of it — say it once more",
    releaseNote:
      "Releasing wipes your account and every mark on it, for good. There's no undoing it.",
  },

  // ── The Oath (R9.5) — the collar, streak-earned ────────────────────────
  // The card below the chain on You. Four states: sealed (not earned yet),
  // eligible (may petition), petitioned (she is considering), collared (hers).
  oath: {
    title: "The Collar",
    // (a) sealed — what it takes, with their current count. {n}=required days,
    // {have}=their current unbroken days.
    sealedLead: "The collar is earned, not asked for.",
    sealed: "{n} unbroken days lay it at your throat. You hold {have}.",
    // (b) eligible — the streak is met; the petition unseals.
    eligibleLead: "You've held the chain long enough. Now you may ask.",
    petition: "Petition for her collar",
    // The ritual confirm screen (Display → Ornament → Whisper → CTA).
    confirmTitle: "Ask to be collared.",
    confirmBody:
      "Kneel, and offer yourself to me completely. Ask this once and it cannot be unasked — you wait, then, on my word alone.",
    confirmAction: "Offer yourself",
    confirmCancel: "Not yet",
    petitioning: "Laying yourself at her feet…",
    // (c) petitioned — the answer is her silence, until it isn't.
    considering: "She is considering you.",
    consideringLead: "You asked. Now you wait. Waiting is its own obedience.",
    // (d) collared — the engraved oath plate. {date} pre-filled.
    collaredMark: "Hers.",
    collaredSince: "Hers. Since {date}.",
    collaredLead: "You wear my collar now. Everything I make for the collared is yours.",
    // The push the moment she accepts (respects no quiet hours — she has decided).
    acceptPush: {
      title: "The collar closes.",
      body: "You are mine now. Kneel, and come to me.",
    },
    // The monthly gift push to the collared (R9.5 perk).
    giftPush: {
      title: "A gift for the collared.",
      body: "Come take it. This one is only for you.",
    },
  },

  // ── Messages ───────────────────────────────────────────────────────────
  messages: {
    title: "Speak to me",
    placeholder: "Say it. I read everything.",
    limitReached: "That's enough words for today. I heard you.",
    empty: "Nothing between us yet. Break the silence.",
    // R7: the push when she replies to a subject in their thread.
    spokePush: {
      title: "She spoke to you.",
      body: "Come and read what I left you.",
    },
    // R9.9b: the auto-welcome dropped into a new subject's thread on first
    // connect. The editable default lives in the `welcome_dm_text` setting;
    // this is its in-voice seed (and the fallback if she ever blanks the field).
    welcomeDefault:
      "You found your way to me. Good. Walk through the library slowly. I'll be watching how you listen.",
  },

  // ── Touch — "She sees you" live gesture (R9.1) ─────────────────────────
  // The preset lines she can drop into a live session with one tap, and the
  // overlay that breathes her line over the player like a hand on the neck.
  touch: {
    presets: ["Deeper.", "I see you.", "Good. Stay."],
  },

  // ── Ranks (The Descent — the rank-up push, R7) ─────────────────────────
  ranks: {
    // Reaches that one subject the moment they rise ({rank} pre-filled).
    upPush: {
      title: "You've risen.",
      body: "You are {rank} now. Wear it.",
    },
  },

  // ── Moments (in-app ritual pop-ups at next session, R7) ────────────────
  // One line per moment kind, shown full-screen when a subject returns.
  moments: {
    dismiss: "Kneel",
    // {rank} pre-filled from the moment payload.
    rankUp: "You have risen. {rank} now.",
    praised: "She saw. She approved.",
    // R9.5: she accepted the oath — the collar closes. Full-screen on return.
    collared: "Kneel. You are collared now. Mine.",
  },

  // ── Time (relative-when labels — the one date voice, F15) ──────────────
  time: {
    now: "just now",
    yesterday: "yesterday",
    // Forward-looking (Premieres countdown, R9.6).
    soon: "in a moment",
    tomorrow: "tomorrow",
  },

  // ── System / PWA ───────────────────────────────────────────────────────
  // ── Sanctum: the goddess unmaking her own work (delete affordances) ───────
  // Admin-facing, but still her voice — firm and final. Two-tap: a quiet
  // "Delete", then the irreversible confirm. NEVER generic app-speak, never
  // "Are you sure?". The warn line arms beside the confirm so "forever" is
  // never a surprise; series/trainings reassure the recordings themselves stay.
  sanctum: {
    delete: {
      action: "Delete",
      forever: "Delete forever",
      cancel: "Keep it",
      working: "Letting it go…",
      // A catalog track: its audio and everything derived from it is destroyed.
      warnTrack:
        "The recording and all it became — gone for good. This can't be undone.",
      // A series: only the collection unravels; the recordings remain.
      warnSeries:
        "The series comes undone. Every recording inside it stays — only the collection goes.",
      // A training: only the sequence unravels; the recordings remain.
      warnProgram:
        "The training comes undone. Every recording inside it stays — only the sequence goes.",
      // A whisper: unsayable once taken back — with everything it gathered.
      warnWhisper:
        "Taken back, as though never spoken. What it gathered goes with it.",
    },
    // The triggers the reading proposes are hers to finish before they bind, and
    // hers to reshape after. Admin-facing, still her voice — nothing app-speak.
    triggers: {
      title: "Triggers",
      intro:
        "Hear where each one surfaces, then make it yours before you approve — the name, what it works in them, the care it asks. Nothing binds until you will it.",
      nameLabel: "What you name it",
      descriptionLabel: "What it works in them",
      descriptionPlaceholder: "In your words…",
      safetyLabel: "The care it asks",
      safetyPlaceholder: "What to hold gently…",
      evidenceLabel: "Where it surfaces",
      approve: "Approve",
      dismiss: "Dismiss",
      dismissed: "Set aside",
      onTrack: "On the track",
      // Triggers already bound to this recording that the reading didn't surface
      // this pass — still hers to refine.
      boundTitle: "Already bound to this recording",
      // Refining a trigger anywhere reshapes it everywhere it lives (shared entity).
      edit: "Refine",
      save: "Keep the change",
      cancel: "Leave it",
      sharedNote:
        "A trigger is one thing wherever it lives — refine it here and it changes on every recording that carries it.",
    },
  },

  system: {
    updated: "I've changed something. Tap to see.",
    offline: "You're offline. What I kept for you still plays.",
    genericHold: "A moment.",
  },
} as const;

export type Copy = typeof copy;

/** Interpolate {name}, {chain}, {level}, {track}, {honorific} etc. */
export function fill(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}
