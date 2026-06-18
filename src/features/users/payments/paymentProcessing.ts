import { prisma } from "../../../prisma.js";
import { TransactionStatus } from "../../../generated/prisma/enums.js";
import { paystackService } from "../../../services/paystack/paystack.service.js";
import { createUserNotification } from "../notification/notification.service.js";

export type ProcessResult =
  | { status: "success" }
  | { status: "failed" }
  | { status: "processing" };

interface ProviderData {
  status: string;
  amount: number;
  channel: string;
  paid_at: string | null;
}

const buildProviderResponse = (providerData: ProviderData) => ({
  status: providerData.status,
  amount: providerData.amount,
  channel: providerData.channel,
  paid_at: providerData.paid_at,
});

export async function processPaymentSuccess(
  transaction: any,
  providerData: ProviderData,
): Promise<void> {
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: TransactionStatus.SUCCESS,
      providerResponse: buildProviderResponse(providerData),
    },
  });

  if (!transaction.userId) return;

  await createUserNotification({
    userId: transaction.userId.toString(),
    title: "Payment Successful",
    message: `Your payment of GHS ${transaction.amount} was successful.`,
    type: "payment",
    metadata: {
      transactionId: transaction.id.toString(),
      reference: transaction.providerReference,
    },
  });
}

export async function processPaymentFailure(
  transaction: any,
  providerData: ProviderData,
): Promise<void> {
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: TransactionStatus.FAILED,
      providerResponse: buildProviderResponse(providerData),
    },
  });
}

export async function verifyAndProcessPayment(
  reference: string,
): Promise<ProcessResult> {
  const transaction = await prisma.transaction.findUnique({
    where: { providerReference: reference },
  });

  if (!transaction) return { status: "processing" };
  if (transaction.status === TransactionStatus.SUCCESS) return { status: "success" };
  if (transaction.status === TransactionStatus.FAILED) return { status: "failed" };

  try {
    const paystackResponse = await paystackService.verifyTransaction(reference);
    const providerData: ProviderData = {
      status: paystackResponse.data.status,
      amount: paystackResponse.data.amount,
      channel: paystackResponse.data.channel,
      paid_at: paystackResponse.data.paid_at,
    };

    if (paystackResponse.data.status === "success") {
      await processPaymentSuccess(transaction, providerData);
      return { status: "success" };
    }

    if (paystackResponse.data.status === "failed") {
      await processPaymentFailure(transaction, providerData);
      return { status: "failed" };
    }
  } catch {
    return { status: "processing" };
  }

  return { status: "processing" };
}
