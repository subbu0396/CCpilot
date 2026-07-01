const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "its", "may", "new", "now", "old", "see", "way", "who", "boy",
  "did", "she", "use", "her", "than", "them", "then", "this", "with",
  "have", "from", "they", "been", "were", "said", "each", "which", "their",
  "will", "other", "about", "many", "some", "time", "very", "when", "come",
  "here", "just", "like", "long", "make", "over", "such", "take", "than",
  "them", "well", "were", "what", "your", "also", "back", "being", "could",
  "does", "even", "into", "more", "most", "only", "same", "that", "there",
  "these", "those", "through", "under", "where", "while", "would", "app",
  "flowstack", "really", "still", "need", "want", "been", "being", "got",
]);

const NEGATIVE_HINTS = new Set([
  "slow", "broken", "bug", "bugs", "crash", "crashes", "frustrating",
  "frustrated", "terrible", "awful", "hate", "worst", "missing", "fail",
  "failed", "error", "errors", "issue", "issues", "problem", "problems",
  "difficult", "confusing", "unusable", "disappointed", "cancel", "churn",
  "billing", "expensive", "lag", "laggy", "timeout", "support", "wait",
]);

export function tokenizeReviewText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

export function wordSentimentHue(word: string): string {
  if (NEGATIVE_HINTS.has(word)) return "hsl(0, 72%, 48%)";
  return "hsl(221, 70%, 48%)";
}

export type ReviewWordEntry = {
  text: string;
  value: number;
  quotes: { text: string; source: string; customer_id: string | null }[];
};
