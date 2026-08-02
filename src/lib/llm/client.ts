import { env } from "@/lib/env";

/**
 * One way in to the model, and one place where failure is made VISIBLE.
 *
 * Every LLM call in here used to end in `catch { return null }`, which reaches
 * her as "Couldn't draft right now" — a sentence that is true, useless, and
 * indistinguishable between a missing key, a model her account can't use, a
 * spent balance, a rate limit, and a network that never left the container. She
 * cannot fix what she cannot see, and neither can anyone reading the logs.
 *
 * So: the real reason comes back, in her words, and the raw one goes to the
 * server log. The Sanctum is hers alone, so showing the actual cause there
 * leaks nothing.
 */

export const LLM_MODEL = process.env.LLM_DRAFTS_MODEL || "claude-sonnet-5";

export type LlmResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export function llmConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

/** Turn an API failure into something she can act on. */
function explain(status: number, body: string, model: string): string {
  const type = /"type"\s*:\s*"([a-z_]+)"/.exec(body)?.[1] ?? "";
  const message = /"message"\s*:\s*"([^"]{0,300})"/.exec(body)?.[1] ?? "";
  if (status === 401 || type === "authentication_error")
    return "The ANTHROPIC_API_KEY on the server is wrong or revoked.";
  if (status === 403 || type === "permission_error")
    return `That key isn't allowed to use ${model}.`;
  if (status === 404 || type === "not_found_error")
    return `The model ${model} doesn't exist for this key. Set LLM_DRAFTS_MODEL on the server to one it can use.`;
  if (status === 400 && /credit|balance/i.test(message))
    return "The Anthropic account is out of credit.";
  if (status === 429 || type === "rate_limit_error")
    return "Rate limited by Anthropic. Wait a moment and try again.";
  if (status >= 500) return "Anthropic is having trouble. Try again shortly.";
  return message
    ? `Anthropic refused it (${status}): ${message}`
    : `Anthropic refused it (${status}).`;
}

export async function askClaude(params: {
  system: string;
  user: string;
  maxTokens: number;
  /** Named in logs so a failure says WHICH feature broke. */
  purpose: string;
}): Promise<LlmResult> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, reason: "No ANTHROPIC_API_KEY on the server." };

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: [{ role: "user", content: params.user }],
      }),
      // Without this a hung connection holds her request open until the
      // platform kills it, and she sees nothing at all.
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    console.error(`[llm:${params.purpose}] request failed:`, err);
    const name = err instanceof Error ? err.name : "";
    return {
      ok: false,
      reason:
        name === "TimeoutError"
          ? "Anthropic took too long to answer. Try again."
          : "The server couldn't reach Anthropic at all. Check its outbound network.",
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[llm:${params.purpose}] ${res.status} from Anthropic (model=${LLM_MODEL}):`,
      body.slice(0, 800),
    );
    return { ok: false, reason: explain(res.status, body, LLM_MODEL) };
  }

  const data = (await res.json().catch(() => null)) as {
    content?: { type: string; text?: string }[];
    stop_reason?: string;
  } | null;
  const text = data?.content?.find((c) => c.type === "text")?.text ?? "";
  if (!text) {
    console.error(`[llm:${params.purpose}] empty answer:`, JSON.stringify(data).slice(0, 500));
    return { ok: false, reason: "Anthropic answered with nothing." };
  }
  // A truncated answer can't be parsed as JSON downstream; say WHY rather than
  // failing as if the model had refused.
  if (data?.stop_reason === "max_tokens") {
    console.error(`[llm:${params.purpose}] hit max_tokens (${params.maxTokens})`);
  }
  return { ok: true, text };
}

/** Pull the first JSON value out of an answer, fences and preamble tolerated. */
export function extractJson(text: string, open: "[" | "{"): unknown | null {
  const close = open === "[" ? "]" : "}";
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
