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

/**
 * Ask for a STRUCTURED answer and get one — or a real reason why not.
 *
 * Asking a model to "return only JSON" in the prompt is a request, not a
 * constraint: it can preamble, apologise, wrap the object in commentary, or
 * decline, and every one of those arrives as an unparseable blob. That is what
 * "the model answered in a shape I couldn't read" was — the call succeeded and
 * the shape was wrong.
 *
 * Declaring a tool with a schema and forcing its use makes the shape the API's
 * job rather than the prompt's. What comes back is already validated JSON, and
 * the cases that used to look like a parse failure — a refusal, a truncation —
 * now name themselves.
 */
export async function askClaudeJson(params: {
  system: string;
  user: string;
  maxTokens: number;
  purpose: string;
  /** Name of the forced tool — describes what is being produced. */
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
}): Promise<{ ok: true; value: unknown } | { ok: false; reason: string }> {
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
        tools: [
          {
            name: params.toolName,
            description: params.toolDescription,
            input_schema: params.schema,
          },
        ],
        // The model cannot answer in any other shape.
        tool_choice: { type: "tool", name: params.toolName },
      }),
      signal: AbortSignal.timeout(120_000),
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
    content?: { type: string; name?: string; input?: unknown; text?: string }[];
    stop_reason?: string;
  } | null;

  const call = data?.content?.find(
    (c) => c.type === "tool_use" && c.name === params.toolName,
  );
  if (call && call.input !== undefined) return { ok: true, value: call.input };

  // No tool call came back. Say which of the real reasons it was, and show her
  // what the model actually said instead of leaving her guessing.
  const said = data?.content?.find((c) => c.type === "text")?.text ?? "";
  console.error(
    `[llm:${params.purpose}] no tool_use (stop_reason=${data?.stop_reason}):`,
    said.slice(0, 800),
  );
  if (data?.stop_reason === "max_tokens") {
    return {
      ok: false,
      reason: "The answer was cut off before it finished. Try again.",
    };
  }
  return {
    ok: false,
    reason: said
      ? `The model declined and said: "${said.slice(0, 220)}"`
      : "The model returned nothing usable.",
  };
}
