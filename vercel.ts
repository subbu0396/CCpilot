import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [{ path: "/api/cron/weekly-digest", schedule: "0 13 * * 1" }],
};
