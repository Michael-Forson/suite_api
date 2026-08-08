import { Response } from "express";

/**
 * A failure a caller can do something about.
 *
 * The inventory services run behind the global error handler in
 * `createApp.ts`, which turns a bare `throw new Error(...)` into a 500. That is
 * right for a bug and wrong for "no unit by that id" or "this brand is still on
 * twelve products" — both are ordinary answers, not faults. Services throw this
 * instead so the controller can hand back the status the client deserves, and
 * anything that is *not* one of these keeps falling through to the 500 it
 * should be.
 */
export class InventoryError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "INVENTORY_ERROR") {
    super(message);
    this.name = "InventoryError";
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string) =>
  new InventoryError(400, message, "BAD_REQUEST");

export const notFound = (message: string) =>
  new InventoryError(404, message, "NOT_FOUND");

/** 409: the row exists and is fine, but something still points at it. */
export const inUse = (message: string) =>
  new InventoryError(409, message, "IN_USE");

/** 409: a row with that name already exists in this organization. */
export const duplicate = (message: string) =>
  new InventoryError(409, message, "DUPLICATE");

export const isInventoryError = (error: unknown): error is InventoryError =>
  error instanceof InventoryError;

/**
 * The controller half. Returns true when it handled the error, so callers read
 * `if (sendInventoryError(res, error)) return; throw error;` — unrecognized
 * errors stay unhandled on purpose.
 */
export const sendInventoryError = (res: Response, error: unknown): boolean => {
  if (!isInventoryError(error)) return false;

  res.status(error.status).json({
    success: false,
    message: error.message,
    code: error.code,
  });
  return true;
};

/**
 * Wraps a controller body so thrown `InventoryError`s become responses. Sits
 * inside `asyncHandler`, not instead of it — real faults still reach the global
 * handler.
 */
export const handleInventoryErrors = async (
  res: Response,
  run: () => Promise<void>,
): Promise<void> => {
  try {
    await run();
  } catch (error) {
    if (!sendInventoryError(res, error)) throw error;
  }
};
