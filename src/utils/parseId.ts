/**
 * Safely converts a route param string to BigInt.
 * Returns null if the value is not a valid positive integer string,
 * preventing SyntaxError crashes when non-numeric strings reach BigInt().
 */
export function parseId(id: string): bigint | null {
  if (!/^\d+$/.test(id)) return null;
  try {
    return BigInt(id);
  } catch {
    return null;
  }
}
