import multer from "multer";
import { Request, Response, NextFunction } from "express";

const storage = multer.memoryStorage();

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/**
 * Middleware that runs AFTER multer.
 *
 * When the client sends multipart/form-data, structured fields are sent as a
 * JSON string in a `data` field.  This middleware parses that string back into
 * req.body so controllers always receive properly-typed values (booleans,
 * numbers, etc.) regardless of whether the request was JSON or multipart.
 */
export function parseMultipartData(req: Request, _res: Response, next: NextFunction) {
  if (typeof req.body?.data === "string") {
    try {
      req.body = JSON.parse(req.body.data);
    } catch {
      // leave req.body as-is if data isn't valid JSON
    }
  }
  next();
}
