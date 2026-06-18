/**
 * Replaces {{key}} in a string with values from a data object.
 * @param templateString - The string containing {{placeholders}}
 * @param data - The key-value pairs to inject (e.g., { userName: "John" })
 * @returns The string with placeholders replaced
 */
export const fillTemplate = (templateString: string, data: Record<string, string | number | undefined>): string => {
  if (!templateString) return "";

  // Regex looks for {{key}}. 'g' means global (replace all occurrences)
  return templateString.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    // Return the value from data, or keep the {{placeholder}} if data is missing
    return data[key] !== undefined ? String(data[key]) : match;
  });
};

