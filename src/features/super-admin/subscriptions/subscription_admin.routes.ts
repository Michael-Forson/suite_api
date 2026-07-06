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
router.get("/plans/:planKey", getSubscriptionPlan);
router.patch("/plans/:planKey/details", updateSubscriptionPlanDetails);
router.patch("/plans/:planKey/status", changeSubscriptionPlanStatus);
router.post("/plans/:planKey/apps", addSubscriptionPlanApp);
router.delete("/plans/:planKey/apps/:appKey", removeSubscriptionPlanApp);
router.put("/plans/:planKey/prices", upsertSubscriptionPlanPrice);
router.patch(
  "/plans/:planKey/prices/:interval/status",
  changeSubscriptionPlanPriceStatus,
);

export default router;
