import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import checkpointRouter from "./checkpoint.js";
import sessionRouter from "./session.js";
import feedRouter from "./feed.js";
import instagramRouter from "./instagram.js";
import historyRouter from "./history.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(checkpointRouter);
router.use(sessionRouter);
router.use(feedRouter);
router.use(instagramRouter);
router.use(historyRouter);

export default router;
