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
 * `upload.single`, with multer's rejections turned into 400s.
 *
 * Left to itself multer hands a rejected upload to `next(err)`, and the global
 * handler reports "Only image files are allowed" as a 500 — a client mistake
 * dressed up as a server fault.
 */
export function singleImage(field: string) {
  const handler = upload.single(field);

  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }

      const message =
        error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5 MB or smaller."
          : error instanceof Error
            ? error.message
            : "Invalid upload.";

      res.status(400).json({ success: false, message });
    });
  };
}

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
