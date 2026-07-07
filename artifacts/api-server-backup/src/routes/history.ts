import { Router } from "express";
import { getHistory, clearHistory } from "../lib/history.js";

const router = Router();

router.get("/history", (_req, res) => {
  res.json({ entries: getHistory() });
});

router.delete("/history", (_req, res) => {
  clearHistory();
  res.json({ success: true, message: "History cleared" });
});

export default router;
