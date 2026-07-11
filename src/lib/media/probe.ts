import { spawn } from "node:child_process";

/**
 * ffprobe wrapper (PLAN §7.2). ffmpeg/ffprobe is present in the worker
 * container (prod) but optional in dev — callers must handle a null duration
 * (the client measures it, or the admin sets it). Never throws on absence.
 */
export async function probeDurationSeconds(
  filePath: string,
): Promise<number | null> {
  return new Promise((resolve) => {
    let out = "";
    let proc;
    try {
      proc = spawn("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ]);
    } catch {
      resolve(null);
      return;
    }
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve(null)); // ffprobe not installed
    proc.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const val = parseFloat(out.trim());
      resolve(Number.isFinite(val) ? Math.round(val) : null);
    });
  });
}
