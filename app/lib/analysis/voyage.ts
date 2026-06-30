const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3";
const DIMENSIONS = 1024;
const MAX_RETRIES = 6;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatVoyageError(status: number, body: string): string {
  if (body.includes("payment method")) {
    return (
      "Voyage AI is rate-limiting requests (3/min without billing). " +
      "Add a payment method at https://dashboard.voyageai.com/, wait 5–10 minutes for limits to update, then re-run the pipeline."
    );
  }
  if (status === 429 || body.toLowerCase().includes("rate limit")) {
    return "Voyage AI rate limit exceeded. The pipeline will retry automatically.";
  }
  return `Voyage embedding failed (${status}): ${body.slice(0, 240)}`;
}

function isRetryableVoyageError(status: number, body: string): boolean {
  return (
    status === 429 ||
    status === 503 ||
    body.includes("payment method") ||
    body.toLowerCase().includes("rate limit")
  );
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is not configured");
  }

  if (texts.length === 0) return [];

  let lastError = "Unknown Voyage error";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: texts,
        model: MODEL,
        input_type: "document",
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        data: { embedding: number[] }[];
      };
      return data.data.map((d) => d.embedding);
    }

    const errBody = await response.text();
    lastError = formatVoyageError(response.status, errBody);

    if (isRetryableVoyageError(response.status, errBody) && attempt < MAX_RETRIES) {
      const waitMs = Math.min(90_000, 15_000 * (attempt + 1));
      await sleep(waitMs);
      continue;
    }

    throw new Error(lastError);
  }

  throw new Error(lastError);
}

export function getVoyageBatchDelayMs(): number {
  const raw = process.env.VOYAGE_BATCH_DELAY_MS;
  if (raw === undefined || raw === "") return 22_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 22_000;
}

export function embeddingToPgVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export { MODEL as VOYAGE_MODEL, DIMENSIONS as EMBEDDING_DIMENSIONS };
