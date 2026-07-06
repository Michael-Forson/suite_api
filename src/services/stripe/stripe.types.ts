export interface StripeCustomer {
  id: string;
  email?: string | null;
  name?: string | null;
  metadata?: Record<string, string>;
}

export interface CreateStripeCheckoutSessionInput {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  url?: string | null;
  customer?: string | null;
  subscription?: string | null;
  payment_status?: string | null;
  status?: string | null;
  metadata?: Record<string, string>;
}

export interface StripeSubscriptionObject {
  id: string;
  status?: string | null;
  current_period_end?: number | null;
  metadata?: Record<string, string>;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
}
