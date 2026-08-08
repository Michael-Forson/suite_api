import { Router } from "express";
import {
  parseMultipartData,
  singleImage,
} from "../../../middleware/common/upload.middleware.js";
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

/**
 * Register and details accept either JSON or `multipart/form-data` carrying an
 * `icon` image alongside the other fields as a JSON string in `data`.
 *
 * The pair is a no-op on a JSON request — multer passes it through and
 * `parseMultipartData` only acts when `data` is a string — so JSON clients are
 * unaffected.
 */
const acceptsIcon = [singleImage("icon"), parseMultipartData];

router.get("/", listApps);
router.post("/", ...acceptsIcon, registerApp);
router.get("/:key", getAppDetails);
router.patch("/:key/details", ...acceptsIcon, updateAppDetails);
router.patch("/:key/status", changeAppStatus);

export default router;
