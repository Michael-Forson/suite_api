import { Router } from "express";
import {
  getPlatformConfig,
  getAppVersion,
} from "./config.controller.js";

const router = Router();

router.get("/", getPlatformConfig);
router.get("/app-version", getAppVersion);

export default router;
