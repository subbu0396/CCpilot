/**
 * Semantic chart colors. Recharts `fill`/`stroke` props need literal hex
 * values, so these mirror the CSS vars in app/globals.css (`--chart-1..5`,
 * `--destructive`) — keep the two in sync if either changes.
 */
export const SEMANTIC = {
  /** brand / primary / positive */
  brand: "#2f6f6a",
  /** attention / medium */
  attention: "#c45c26",
  /** critical / high — reserved, not decorative */
  critical: "#b91c1c",
  /** neutral / none */
  neutral: "#94a3b8",
  /** secondary neutral tint, for a 4th/5th series when needed */
  neutralLight: "#cbd5e1",
  neutralDark: "#64748b",
} as const;
