export const parsePaymentAmount = (
  amount: string | number | undefined,
) => {
  const parsed =
    typeof amount === "number" ? amount : Number.parseFloat(String(amount ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
