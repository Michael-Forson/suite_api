import axios, { AxiosInstance } from "axios";
import crypto from "crypto";
import {
  PaystackInitializeRequest,
  PaystackInitializeResponse,
  PaystackVerifyResponse,
  PaystackWebhookEvent,
} from "./paystack.types.js";

export class PaystackService {
  private api: AxiosInstance;
  private secretKey: string;
  private webhookSecret: string;
  private callbackUrl: string;

  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || "";
    this.webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || this.secretKey;
    this.callbackUrl = (process.env.PAYMENT_CALLBACK_URL || "").trim();
    // console.log("[Paystack] PAYMENT_CALLBACK_URL from env:", this.callbackUrl || "(empty)");

    if (!this.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is required");
    }

    this.api = axios.create({
      baseURL: "https://api.paystack.co",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Initialize a Paystack transaction
   * @param referenceId - Local payment reference metadata
   * @param amount - Amount in GHS (will be converted to pesewas)
   * @param email - Customer email
   * @param metadata - Additional metadata
   * @returns Paystack initialization response with authorization URL
   */
  async initializeTransaction(
    referenceId: string | number,
    amount: number,
    email: string,
    metadata?: Record<string, any>,
    callbackUrl?: string,
  ): Promise<PaystackInitializeResponse> {
    try {
      // Convert GHS to pesewas (multiply by 100)
      const amountInPesewas = Math.round(amount * 100);

      // Use provided callbackUrl or fall back to default
      const resolvedCallbackUrl = callbackUrl || this.callbackUrl;

      const payload: PaystackInitializeRequest = {
        email,
        amount: amountInPesewas,
        currency: "GHS",
        metadata: {
          referenceId: String(referenceId),
          ...metadata,
        },
        ...(resolvedCallbackUrl && { callback_url: resolvedCallbackUrl }),
      };

      const response = await this.api.post<PaystackInitializeResponse>(
        "/transaction/initialize",
        payload
      );

      if (!response.data.status) {
        throw new Error(response.data.message || "Failed to initialize transaction");
      }

      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          error.response.data?.message || "Failed to initialize Paystack transaction"
        );
      }
      throw error;
    }
  }

  /**
   * Verify a transaction by reference
   * @param reference - Paystack transaction reference
   * @returns Transaction verification response
   */
  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    try {
      const response = await this.api.get<PaystackVerifyResponse>(
        `/transaction/verify/${reference}`
      );

      if (!response.data.status) {
        throw new Error(response.data.message || "Failed to verify transaction");
      }

      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          error.response.data?.message || "Failed to verify Paystack transaction"
        );
      }
      throw error;
    }
  }

  /**
   * Verify webhook signature from Paystack
   * @param payload - Raw request body as string
   * @param signature - Signature from x-paystack-signature header
   * @returns boolean indicating if signature is valid
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const hash = crypto
        .createHmac("sha512", this.webhookSecret)
        .update(payload)
        .digest("hex");

      return hash === signature;
    } catch (error) {
      return false;
    }
  }

  /**
   * Parse webhook event from Paystack
   * @param payload - Webhook payload
   * @returns Parsed webhook event
   */
  parseWebhookEvent(payload: any): PaystackWebhookEvent {
    return payload as PaystackWebhookEvent;
  }

  /**
   * Check if webhook event indicates successful payment
   * @param event - Webhook event
   * @returns boolean
   */
  isSuccessfulPayment(event: PaystackWebhookEvent): boolean {
    return (
      event.event === "charge.success" &&
      event.data.status === "success" &&
      event.data.currency === "GHS"
    );
  }

  /**
   * Check if webhook event indicates failed payment
   * @param event - Webhook event
   * @returns boolean
   */
  isFailedPayment(event: PaystackWebhookEvent): boolean {
    return event.event === "charge.failed" || event.data.status === "failed";
  }
}

export const paystackService = new PaystackService();

