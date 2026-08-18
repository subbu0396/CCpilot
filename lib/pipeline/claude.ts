import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function estimateCostUsd(usage: TokenUsage): number {
  // Approximate Sonnet rates; cache reads cheaper
  const input = (usage.input_tokens / 1e6) * 3;
  const output = (usage.output_tokens / 1e6) * 15;
  const cacheRead = (usage.cache_read_tokens / 1e6) * 0.3;
  const cacheWrite = (usage.cache_creation_tokens / 1e6) * 3.75;
  return Number((input + output + cacheRead + cacheWrite).toFixed(6));
}

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model response");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Call Claude with a cacheable system prompt.
 * Anthropic prompt caching: system content marked with cache_control ephemeral.
 */
export async function cachedJsonCompletion<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
}): Promise<{ data: T; usage: TokenUsage }> {
  if (!hasAnthropicKey()) {
    throw new Error("ANTHROPIC_API_KEY missing — use heuristic mode");
  }

  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: opts.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: opts.user }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = opts.schema.parse(extractJson(text));
  const usage: TokenUsage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_tokens:
      (response.usage as { cache_read_input_tokens?: number })
        .cache_read_input_tokens ?? 0,
    cache_creation_tokens:
      (response.usage as { cache_creation_input_tokens?: number })
        .cache_creation_input_tokens ?? 0,
  };
  return { data: parsed, usage };
}

export function mergeUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_tokens: a.cache_read_tokens + b.cache_read_tokens,
    cache_creation_tokens: a.cache_creation_tokens + b.cache_creation_tokens,
  };
}

export const emptyUsage = (): TokenUsage => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
});
