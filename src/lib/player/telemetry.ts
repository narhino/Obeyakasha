"use client";

/** Fire-and-forget telemetry POSTs (PLAN §9). Uses sendBeacon on unload paths. */
export async function postJson(path: string, body: unknown): Promise<void> {
  try {
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // Telemetry is best-effort; never surface errors to the listener.
  }
}

export function beacon(path: string, body: unknown): void {
  try {
    const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
    if (navigator.sendBeacon(path, blob)) return;
  } catch {
    // fall through
  }
  void postJson(path, body);
}
