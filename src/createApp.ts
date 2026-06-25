import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./features/core/authentication/auth.routes.js";
import appRoutes, {
  organizationAppsRouter,
} from "./features/core/app/app.routes.js";
import organizationInvitationRoutes from "./features/core/organization-invitation/org_inv.routes.js";
import organizationMemberRoutes from "./features/core/organization-member/org_mem.routes.js";
import organizationRoutes from "./features/core/organization/org.routes.js";
import paymentRoutes from "./features/config/payments/payment.routes.js";
import notificationRoutes from "./features/config/notification/notification.router.js";
import configRoutes from "./features/config/config.routes.js";
import superAdminAuthRoutes from "./features/super-admin/authentication/super_admin_auth.routes.js";
import superAdminAccountRoutes from "./features/super-admin/account/account.routes.js";
import superAdminAppRoutes from "./features/super-admin/app/app.routes.js";
import superAdminRbacRoutes from "./features/super-admin/rbac/rbac.routes.js";
import appRoleRoutes from "./features/core/app-role/app_role.routes.js";
import { generalLimiter } from "./middleware/common/rateLimiter.middleware.js";

dotenv.config();

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    "/user/api/v1/payments/paystack/webhook",
    express.raw({ type: "application/json" }),
    (req, _res, next) => {
      (req as any).rawBody = req.body.toString("utf8");
      try {
        req.body = JSON.parse((req as any).rawBody);
      } catch {
        // Keep the raw body when the provider sends an invalid JSON payload.
      }
      next();
    },
  );

  app.use(helmet());
  app.use(cors({ origin: "*", credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/user/api", generalLimiter);
  app.use("/super-admin/api", generalLimiter);

  app.use("/user/api/v1/config", configRoutes);
  app.use("/user/api/v1/auth", authRoutes);
  app.use("/user/api/v1/apps", appRoutes);
  app.use("/user/api/v1/organizations", organizationInvitationRoutes);
  app.use("/user/api/v1/organizations", organizationMemberRoutes);
  app.use("/user/api/v1/organizations", organizationAppsRouter);
  app.use("/user/api/v1/organizations", appRoleRoutes);
  app.use("/user/api/v1/organizations", organizationRoutes);
  app.use("/user/api/v1/payments", paymentRoutes);
  app.use("/user/api/v1/notifications", notificationRoutes);
  app.use("/super-admin/api/v1/auth", superAdminAuthRoutes);
  app.use("/super-admin/api/v1/accounts", superAdminAccountRoutes);
  app.use("/super-admin/api/v1/apps", superAdminRbacRoutes);
  app.use("/super-admin/api/v1/apps", superAdminAppRoutes);

  app.get("/payment/callback", (req, res) => {
    const reference = req.query.reference;
    if (reference) console.log("[Payment] Callback hit, reference:", reference);
    res
      .status(200)
      .send(
        "<!DOCTYPE html><html><body><p>Payment received. You can close this window.</p></body></html>",
      );
  });

  app.get("/", (_req, res) => {
    res
      .status(200)
      .send(
        "<!DOCTYPE html><html><body><p>You can close this window.</p></body></html>",
      );
  });

  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const ip = req.ip || req.socket?.remoteAddress;
      if (err.type === "entity.parse.failed") {
        console.error(
          `[BadJSON] ${req.method} ${req.originalUrl} | IP: ${ip} | UA: ${req.headers["user-agent"]} | ${err.message}`,
        );
        return res.status(400).json({ error: "Invalid JSON in request body" });
      }
      console.error(
        `[Error] ${req.method} ${req.originalUrl} | IP: ${ip} |`,
        err,
      );
      res
        .status(err.status || 500)
        .json({ error: err.message || "Internal server error" });
    },
  );

  return app;
}
