import { Response } from "express";
import asyncHandler from "express-async-handler";
import { prisma } from "../../../prisma.js";
import { TransactionStatus } from "../../../generated/prisma/enums.js";
import { paystackService } from "../../../services/paystack/paystack.service.js";
import { InitializePaymentRequestBody } from "./payment.types.js";
import {
  verifyAndProcessPayment,
  processPaymentSuccess,
  processPaymentFailure,
} from "./paymentProcessing.js";
import { getCustomerPaymentEmail } from "../../../utils/paymentEmail.js";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";

const parsePaymentAmount = (amount: string | number | undefined) => {
  const parsed =
    typeof amount === "number" ? amount : Number.parseFloat(String(amount ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const initializePayment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { amount, email, metadata }: InitializePaymentRequestBody = req.body;
    const parsedAmount = parsePaymentAmount(amount);

    if (!parsedAmount) {
      res.status(400).json({
        success: false,
        message: "A valid amount is required",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: BigInt(req.userId) },
      select: { id: true, email: true },
    });

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const customerEmail = getCustomerPaymentEmail(email || user.email);
    if (!customerEmail) {
      res.status(400).json({
        success: false,
        message: "Customer email is required for payment",
      });
      return;
    }

    try {
      const referenceId = `${user.id.toString()}-${Date.now()}`;
      const paystackResponse = await paystackService.initializeTransaction(
        referenceId,
        parsedAmount,
        customerEmail,
        {
          userId: user.id.toString(),
          ...(metadata || {}),
        },
      );

      const transaction = await prisma.transaction.create({
        data: {
          userId: user.id,
          providerReference: paystackResponse.data.reference,
          amount: parsedAmount,
          currency: "GHS",
          status: TransactionStatus.PENDING,
          providerResponse: {
            authorization_url: paystackResponse.data.authorization_url,
            access_code: paystackResponse.data.access_code,
            reference: paystackResponse.data.reference,
          },
          metadata: metadata as any,
        },
      });

      res.status(200).json({
        success: true,
        message: "Payment initialized successfully",
        data: {
          authorizationUrl: (
            paystackResponse.data.authorization_url || ""
          ).trim(),
          accessCode: paystackResponse.data.access_code,
          reference: paystackResponse.data.reference,
          transactionId: transaction.id.toString(),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to initialize payment",
      });
    }
  },
);

export const handlePaystackWebhook = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const signature = req.headers["x-paystack-signature"] as string;

    if (!signature) {
      res.status(400).json({
        success: false,
        message: "Missing x-paystack-signature header",
      });
      return;
    }

    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const isValid = paystackService.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
      return;
    }

    try {
      const event = paystackService.parseWebhookEvent(req.body);

      const transaction = await prisma.transaction.findUnique({
        where: { providerReference: event.data.reference },
      });

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
        return;
      }

      if (
        transaction.status === TransactionStatus.SUCCESS ||
        transaction.status === TransactionStatus.FAILED
      ) {
        res.status(200).json({
          success: true,
          message: "Webhook already processed",
        });
        return;
      }

      const providerData = {
        status: event.data.status,
        amount: event.data.amount,
        channel: event.data.channel,
        paid_at: event.data.paid_at,
      };

      if (paystackService.isSuccessfulPayment(event)) {
        await processPaymentSuccess(transaction, providerData);
      } else if (paystackService.isFailedPayment(event)) {
        await processPaymentFailure(transaction, providerData);
      }

      res.status(200).json({
        success: true,
        message: "Webhook processed successfully",
      });
    } catch (error: any) {
      console.error("Webhook processing error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to process webhook",
      });
    }
  },
);

export const verifyPayment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const reference = req.params.reference as string;

    if (!reference) {
      res.status(400).json({
        success: false,
        message: "Reference is required",
      });
      return;
    }

    try {
      const transaction = await prisma.transaction.findUnique({
        where: { providerReference: reference },
      });

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
        return;
      }

      const result = await verifyAndProcessPayment(reference);
      const updated = await prisma.transaction.findUnique({
        where: { id: transaction.id },
      });
      const cached = updated?.providerResponse as any;

      res.status(200).json({
        success: true,
        message: "Payment verification successful",
        data: {
          reference: updated?.providerReference,
          status: result.status,
          amount: cached?.amount
            ? cached.amount / 100
            : Number(updated?.amount ?? transaction.amount),
          currency: updated?.currency ?? transaction.currency,
          paidAt: cached?.paid_at || null,
          transactionId: transaction.id.toString(),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to verify payment",
      });
    }
  },
);

export const checkPaymentStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const reference = req.params.reference as string;

    if (!reference) {
      res.status(400).json({
        success: false,
        message: "Reference is required",
      });
      return;
    }

    const transaction = await prisma.transaction.findUnique({
      where: { providerReference: reference },
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
      return;
    }

    const result =
      transaction.status === TransactionStatus.PENDING
        ? await verifyAndProcessPayment(reference)
        : { status: transaction.status.toLowerCase() };

    res.status(200).json({
      success: true,
      data: {
        paymentStatus: result.status,
        reference: transaction.providerReference,
        transactionId: transaction.id.toString(),
      },
    });
  },
);
