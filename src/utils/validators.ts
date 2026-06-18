export const isValidEmail = (email?: string) => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidPhone = (phone?: string) => {
  if (!phone) return false;
  // Accepts numbers with optional leading +
  return /^\+?\d{9,12}$/.test(phone);
};

export const isValidCode = (code?: string, length = 6) => {
  if (!code) return false;
  return new RegExp(`^\\d{${length}}$`).test(code);
};

export const normalizePhone = (phone: string): string => {
  if (phone.startsWith("0")) {
    return "+233" + phone.slice(1);
  }
  if (!phone.startsWith("+")) {
    return "+" + phone;
  }
  return phone;
};

export const isValidPassword = (password?: string) => {
  if (!password) return false;
  return password.length >= 8;
};

export const parseDob = (dob?: string) => {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
};
