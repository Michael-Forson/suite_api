import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./features/users/authentication/auth.routes.js";
import paymentRoutes from "./features/users/payments/payment.routes.js";
import notificationRoutes from "./features/users/notification/notification.router.js";
import configRoutes from "./features/config/config.routes.js";
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

  app.use("/api", generalLimiter);

  app.use("/user/api/v1/config", configRoutes);
  app.use("/user/api/v1/auth", authRoutes);
  app.use("/user/api/v1/payments", paymentRoutes);
  app.use("/user/api/v1/notifications", notificationRoutes);

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
