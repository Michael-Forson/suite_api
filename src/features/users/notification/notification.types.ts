export interface RegisterDeviceTokenRequestBody {
  pushToken: string;
  platform: string;
}

export interface SendNotificationRequestBody {
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}
