/** Extract a readable message from thrown values (Supabase PostgrestError is not Error). */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string") {
      const parts = [o.message];
      if (typeof o.details === "string") parts.push(o.details);
      if (typeof o.hint === "string") parts.push(o.hint);
      if (typeof o.code === "string") parts.push(`(${o.code})`);
      return parts.join(" — ");
    }
  }
  return "Analysis failed";
}
