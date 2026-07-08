import { Router } from "express";
import { superAdminAuthenticate } from "../../../middleware/super-admin/superAdminAuth.middleware.js";
import {
  addSubscriptionPlanApp,
  changeSubscriptionPlanPriceStatus,
  changeSubscriptionPlanStatus,
  createSubscriptionPlan,
  getSubscriptionPlan,
  listSubscriptionPlans,
  removeSubscriptionPlanApp,
  updateSubscriptionPlanDetails,
  upsertSubscriptionPlanPrice,
} from "./subscription_admin.controller.js";

const router = Router();

router.use(superAdminAuthenticate);

router.get("/plans", listSubscriptionPlans);
router.post("/plans", createSubscriptionPlan);
router.get("/plans/:planId", getSubscriptionPlan);
router.patch("/plans/:planId/details", updateSubscriptionPlanDetails);
router.patch("/plans/:planId/status", changeSubscriptionPlanStatus);
router.post("/plans/:planId/apps", addSubscriptionPlanApp);
router.delete("/plans/:planId/apps/:appKey", removeSubscriptionPlanApp);
router.put("/plans/:planId/prices", upsertSubscriptionPlanPrice);
router.patch(
  "/plans/:planId/prices/:interval/status",
  changeSubscriptionPlanPriceStatus,
);

export default router;
