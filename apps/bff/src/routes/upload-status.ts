import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { uploadStatusQuerySchema } from "../../../../packages/shared/src/schemas";
import { JobStore } from "../../../../lib/job-store";

const uploadStatusRoute = new Hono();

uploadStatusRoute.get(
  "/",
  zValidator("query", uploadStatusQuerySchema),
  (c) => {
    const { jobId } = c.req.valid("query");
    const job = JobStore.find(jobId);
    if (!job) {
      return c.json({ error: "ジョブが見つかりません" }, 404);
    }
    return c.json(job);
  }
);

export default uploadStatusRoute;
