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
    // R2a — public catalog, smart search, segments
    publicIntro:
      "Everything I've made lives here. Look all you like — only the claimed may play.",
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
    unlockCta: "Rise to earn it",
    sealedAnon: "Sealed until you enter.",
    playAll: "Let it all play",
    queue: "Queue it",
    seriesCount: "{n} files",
    seriesEmpty: "No series yet. Soon.",
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
      queue: "What comes next",
      minimize: "Let me rest below",
      prev: "The one before",
      next: "The next one",
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

  // ── Whispers (the feed — Home) ─────────────────────────────────────────
  whispers: {
    title: "Whispers",
    empty: "I haven't whispered yet. Wait for me.",
    publicEmpty:
      "I keep my voice for those who enter. Come through, and you'll hear me.",
    pinnedLabel: "Held",
    kneel: "Kneel",
    knelt: "You knelt.",
    // The push she drops when a whisper goes live — ONE source for the
    // immediate-publish and scheduled-publish paths, so the two can't drift
    // (A11 / R1 / R9.9a).
    whisperedPush: "She whispered.",
    askingPush: "She's asking. Answer.",
  },

  // ── Home feed header (public front door) ───────────────────────────────
  home: {
    aboutLink: "The threshold",
    libraryLink: "Your library",
    publicIntro:
      "This is where I speak. Read a while. When you're ready to be known, come in.",
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
    delivered: "I made something only for you. Come listen.",
    declined: "Not this one. Ask me again another time.",
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
      settingsLabel: "Settings",
      settingsHint: "Quiet hours, your data",
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
  },

  // ── Time (relative-when labels — the one date voice, F15) ──────────────
  time: {
    now: "just now",
    yesterday: "yesterday",
  },

  // ── System / PWA ───────────────────────────────────────────────────────
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
