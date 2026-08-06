import { Response } from "express";
import { deleteFromPublicS3, uploadToS3 } from "../../../utils/s3.js";

/** All app icons live under one prefix in the public bucket. */
const ICON_FOLDER = "app-icons";

/**
 * Stores an uploaded icon and returns its object key, or sends the error
 * response and returns `null`.
 *
 * Storage failures are answered with 502 rather than a generic 500: the request
 * itself was fine, the object store was not, and "try again" is the right advice
 * — for registration it also means the app has not been created yet, so there is
 * nothing half-made to clean up.
 */
export const storeAppIcon = async (
  file: Express.Multer.File,
  res: Response,
): Promise<string | null> => {
  try {
    return await uploadToS3(file.buffer, file.originalname, ICON_FOLDER);
  } catch (error) {
    console.error("[AppIcon] upload failed:", error);
    res.status(502).json({
      success: false,
      message: "Could not store the icon. Try again shortly.",
    });
    return null;
  }
};

/**
 * Removes an icon the app no longer points at. Best-effort by design —
 * `deleteFromPublicS3` swallows its own errors, and an orphaned object must
 * never fail a request that already succeeded.
 */
export const discardAppIcon = async (
  previousKey: string | null,
  nextKey: string | null | undefined,
) => {
  if (!previousKey || previousKey === nextKey) return;
  await deleteFromPublicS3(previousKey);
};
