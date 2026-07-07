import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import sessionRouter from "./session.js";
import instagramRouter from "./instagram.js";
import historyRouter from "./history.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionRouter);
router.use(instagramRouter);
router.use(historyRouter);

export default router;
