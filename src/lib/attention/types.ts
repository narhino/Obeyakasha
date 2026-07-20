/**
 * The red attention system (F5) — the pure shape, split out so the client navs
 * can import it without dragging the DB-backed resolver (and postgres/web-push)
 * into the browser bundle.
 */
export interface Attention {
  /** A new whisper (or her reply to one of their comments) since last seen. */
  whispers: boolean;
  /** Tasks owed — pending assignments / deadlines (the former danger pulse). */
  tasks: number;
  /** Her word waiting, unread, in their thread. */
  messages: boolean;
}

export const NO_ATTENTION: Attention = {
  whispers: false,
  tasks: 0,
  messages: false,
};
