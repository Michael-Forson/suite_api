const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseId(id: string): string | null {
  const value = id.trim();
  return UUID_REGEX.test(value) ? value : null;
}

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && parseId(value) !== null;
