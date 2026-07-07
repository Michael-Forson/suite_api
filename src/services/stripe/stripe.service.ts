import axios, { AxiosInstance } from "axios";
import crypto from "crypto";
import {
  CreateStripeCheckoutSessionInput,
  StripeCheckoutSession,
  StripeCustomer,
  StripeWebhookEvent,
} from "./stripe.types.js";

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

const appendMetadata = (
  params: URLSearchParams,
  prefix: string,
  metadata: Record<string, string>,
) => {
  for (const [key, value] of Object.entries(metadata)) {
    params.append(`${prefix}[metadata][${key}]`, value);
  }
};

export class StripeService {
  private api: AxiosInstance;
  private secretKey: string;
  private webhookSecret: string;

  constructor() {
    this.secretKey = process.env.STRIPE_SECRET_KEY || "";
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    this.api = axios.create({
      baseURL: "https://api.stripe.com/v1",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  }

  private ensureConfigured() {
    if (!this.secretKey) {
      throw new Error("STRIPE_SECRET_KEY is required");
    }
  }

  async createCustomer({
    email,
    name,
    metadata,
  }: {
    email?: string | null;
    name?: string | null;
    metadata?: Record<string, string>;
  }): Promise<StripeCustomer> {
    this.ensureConfigured();

    const params = new URLSearchParams();
    if (email) params.append("email", email);
    if (name) params.append("name", name);
    for (const [key, value] of Object.entries(metadata || {})) {
      params.append(`metadata[${key}]`, value);
    }

    const response = await this.api.post<StripeCustomer>("/customers", params);
    return response.data;
  }

  async createCheckoutSession({
    customerId,
    priceId,
    successUrl,
    cancelUrl,
    metadata,
  }: CreateStripeCheckoutSessionInput): Promise<StripeCheckoutSession> {
    this.ensureConfigured();

    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("customer", customerId);
    params.append("success_url", successUrl);
    params.append("cancel_url", cancelUrl);
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");
    for (const [key, value] of Object.entries(metadata)) {
      params.append(`metadata[${key}]`, value);
    }
    appendMetadata(params, "subscription_data", metadata);

    const response = await this.api.post<StripeCheckoutSession>(
      "/checkout/sessions",
      params,
    );
    return response.data;
  }

  verifyWebhookSignature(payload: string, signatureHeader: string): boolean {
    if (!this.webhookSecret || !signatureHeader) return false;

    const parts = Object.fromEntries(
      signatureHeader.split(",").map((part) => {
        const [key, ...value] = part.split("=");
        return [key, value.join("=")];
      }),
    );
    const timestamp = parts.t;
    const signatures = signatureHeader
      .split(",")
      .filter((part) => part.startsWith("v1="))
      .map((part) => part.slice(3));
    if (!timestamp || signatures.length === 0) return false;

    const timestampSeconds = Number(timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Date.now() / 1000 - timestampSeconds) >
        WEBHOOK_TOLERANCE_SECONDS
    ) {
      return false;
    }

    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    return signatures.some((signature) => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(expected, "hex"),
          Buffer.from(signature, "hex"),
        );
      } catch {
        return false;
      }
    });
  }

  parseWebhookEvent(payload: any): StripeWebhookEvent {
    return payload as StripeWebhookEvent;
  }
}

export const stripeService = new StripeService();
