import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  client = new Anthropic({ apiKey });
  return client;
}

export async function callClaudeJson<T>(options: {
  system: string;
  user: string;
  schemaHint: string;
}): Promise<T> {
  const anthropic = getAnthropicClient();

  const model =
    process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: options.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `${options.user}\n\nRespond with valid JSON only matching this schema:\n${options.schemaHint}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const raw = textBlock.text.trim();
  const jsonStr = raw.startsWith("```")
    ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    : raw;

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new Error(
      `Claude returned invalid JSON. Preview: ${jsonStr.slice(0, 120)}`
    );
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
