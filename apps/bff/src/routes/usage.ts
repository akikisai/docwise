import { Hono } from "hono";
import { getTodayUsage } from "../../../../lib/usage-store";

const usageRoute = new Hono();

usageRoute.get("/today", async (c) => {
  const result = await getTodayUsage();
  if (result.isErr()) {
    console.error("[usage] 使用量取得失敗:", result.error.message);
    return c.json({ error: "使用量データの取得に失敗しました" }, 500);
  }
  return c.json(result.value);
});

export default usageRoute;
