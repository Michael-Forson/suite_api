import { Router } from "express";
import { superAdminAuthenticate } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import {
  changeSuperAdminStatus,
  createSuperAdmin,
  listSuperAdmins,
  updateSuperAdmin,
} from "./account.controller.js";

const router = Router();

router.use(superAdminAuthenticate);
router.get("/", listSuperAdmins);
router.post("/", createSuperAdmin);
router.patch("/:superAdminId", updateSuperAdmin);
router.patch("/:superAdminId/status", changeSuperAdminStatus);

export default router;
