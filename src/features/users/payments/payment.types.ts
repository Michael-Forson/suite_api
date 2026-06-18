export interface InitializePaymentRequestBody {
  amount: string | number;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializePaymentResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
  transactionId: string;
}

export interface VerifyPaymentResponse {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  paidAt: string | null;
  transactionId: string;
}
