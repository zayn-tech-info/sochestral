import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { requireDatabaseUrl } from "@sochestral/database";
import { createApp } from "./app.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

requireDatabaseUrl();

const port = Number(process.env.PORT ?? "8787");
const app = createApp();

serve({ fetch: app.fetch, port }, () => {
  console.log(`Product API listening on http://localhost:${port}`);
});
