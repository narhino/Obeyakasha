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

  // ── Sign in ────────────────────────────────────────────────────────────
  auth: {
    signInTitle: "You found your way back.",
    signInBody: "Come in through Patreon. I'll know you the moment you do.",
    signInButton: "Enter with Patreon",
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
    },
    cadence: {
      ongoing: "Ongoing",
      weekly: "Weekly",
      ended: "Complete",
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
  },

  // ── Chain of Obedience ─────────────────────────────────────────────────
  chain: {
    title: "Your chain",
    kept: "The chain holds. {chain} days at my feet.",
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
  },

  // ── Commissions ────────────────────────────────────────────────────────
  comm: {
    openTitle: "Ask me for something of your own.",
    openBody: "Tell me exactly what you crave. If I take it, it'll be only yours.",
    submit: "Petition me",
    submitted: "I have your request. I'll decide.",
    sealed: "Commissions are sealed. Petition for a slot and wait to be called.",
    waitlistJoin: "Add me to the waitlist",
    delivered: "I made something only for you. Come listen.",
    declined: "Not this one. Ask me again another time.",
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

  // ── Messages ───────────────────────────────────────────────────────────
  messages: {
    title: "Speak to me",
    placeholder: "Say it. I read everything.",
    limitReached: "That's enough words for today. I heard you.",
    empty: "Nothing between us yet. Break the silence.",
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
