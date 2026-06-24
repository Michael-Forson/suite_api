import { Router } from "express";
import { superAdminAuthenticate } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import {
  changeAppStatus,
  getAppDetails,
  listApps,
  registerApp,
  updateAppDetails,
} from "./app.controller.js";

const router = Router();

router.use(superAdminAuthenticate);
router.get("/", listApps);
router.post("/", registerApp);
router.get("/:key", getAppDetails);
router.patch("/:key/details", updateAppDetails);
router.patch("/:key/status", changeAppStatus);

export default router;
