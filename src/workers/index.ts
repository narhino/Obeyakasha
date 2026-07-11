import "dotenv/config";

/**
 * Worker process entrypoint (PLAN §18/§22). In M0 this is a heartbeat stub;
 * job consumers (pg-boss) are wired in M1+ as their features land:
 * media-ingest, transcribe, organize-run, patreon-sync-user,
 * patreon-reconcile, push-send, poll-close, milestones-daily, etc.
 */
async function main() {
  console.log("[worker] started — no jobs registered yet (M0).");
  // Keep the process alive so the container stays up under compose.
  setInterval(() => {
    // Heartbeat; replaced by pg-boss subscriptions in M1.
  }, 60_000);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
