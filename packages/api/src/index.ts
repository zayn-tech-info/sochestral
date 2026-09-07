import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { getDb, requireDatabaseUrl } from "@sochestral/database";
import { createApp } from "./app.js";
import { ImageService } from "./image-service.js";
import { MediaService } from "./media-storage.js";
import { startImageWorker } from "./image-worker.js";
import { startCampaignWorker } from "./campaign-worker.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

requireDatabaseUrl();

const port = Number(process.env.PORT ?? "8787");
const db = getDb().db;
const app = createApp(db);
const media = new MediaService(db);
const images = new ImageService(db, media);
startImageWorker(() => images);
startCampaignWorker(db);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Product API listening on http://localhost:${port}`);
});
