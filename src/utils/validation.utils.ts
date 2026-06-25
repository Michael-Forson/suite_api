export const normalizeOptionalString = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const isOptionalStringValue = (value: unknown) =>
  value === undefined || value === null || typeof value === "string";

export const normalizeRequiredText = (
  value: unknown,
  maxLength: number,
) => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
};

export const normalizeNullableText = (
  value: unknown,
  maxLength?: number,
) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return null;
  if (maxLength && text.length > maxLength) return undefined;
  return text;
};
