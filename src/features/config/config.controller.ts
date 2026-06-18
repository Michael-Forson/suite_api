import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { prisma } from "../../prisma.js";

/** Load the singleton platform config row. Reusable by other modules. */
export const loadPlatformConfig = async () => {
  const config = await prisma.platformConfig.findUnique({ where: { id: 1 } });
  if (!config) {
    throw new Error(
      "Platform config not found. Please seed the platform_config table.",
    );
  }

  return {
    serviceFeePercent: Number(config.serviceFeePercent),
    serviceFeeCap: Number(config.serviceFeeCap),
    taxRate: Number(config.taxRate),
  };
};

// GET /api/v1/config
export const getPlatformConfig = asyncHandler(
  async (_req: Request, res: Response) => {
    const config = await loadPlatformConfig();

    res.status(200).json({
      success: true,
      data: config,
    });
  },
);

// GET /api/v1/config/app-version?platform=android&app=user
export const getAppVersion = asyncHandler(
  async (req: Request, res: Response) => {
    const { platform, app } = req.query as {
      platform?: string;
      app?: string;
    };

    if (!platform || !app) {
      res.status(400).json({
        success: false,
        message: "platform and app query parameters are required",
      });
      return;
    }

    const validApps = ["user"];
    const validPlatforms = ["ios", "android"];

    if (!validApps.includes(app) || !validPlatforms.includes(platform)) {
      res.status(400).json({
        success: false,
        message: "Invalid app or platform value",
      });
      return;
    }

    const version = await prisma.appVersion.findUnique({
      where: { app_platform: { app, platform } },
    });

    if (!version) {
      res.status(404).json({
        success: false,
        message: "Version info not found for this app/platform",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        latestVersion: version.latestVersion,
        minimumVersion: version.minimumVersion,
        storeUrl: version.storeUrl,
        updateMessage: version.updateMessage,
        forceMessage: version.forceMessage,
      },
    });
  },
);
