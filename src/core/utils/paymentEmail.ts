export const getCustomerPaymentEmail = (email?: string | null) =>
  email?.trim() || process.env.CUSTOMER_EMAIL?.trim() || null;
