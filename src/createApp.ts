import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import coreUserRoutes from "./core/core-user/core-user.routes.js";
import superAdminRoutes from "./core/super-admin/super-admin.routes.js";
import inventoryRoutes from "./Inventory/app/inventory.routes.js";
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

  app.use(
    "/user/api/v1/subscriptions/stripe/webhook",
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

  // One router per app. Each owns every path below its version prefix, so
  // adding an endpoint is a change inside that app and never a change here.
  app.use("/user/api/v1", coreUserRoutes);
  app.use("/user/api/v1", inventoryRoutes);
  app.use("/super-admin/api/v1", superAdminRoutes);

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
