export type WhatsAppConfig = {
  enabled: boolean;
  appSecret: string;
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  apiVersion: string;
  publicWebOrigin: string;
};

export function loadWhatsAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): WhatsAppConfig {
  return {
    enabled: env.WHATSAPP_CHANNEL_ENABLED === "true",
    appSecret: env.WHATSAPP_APP_SECRET?.trim() ?? "",
    verifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? "",
    accessToken: env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "",
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || null,
    apiVersion: env.WHATSAPP_API_VERSION?.trim() || "v21.0",
    publicWebOrigin: (
      env.PUBLIC_WEB_ORIGIN?.trim() ||
      env.CORS_ORIGIN?.trim() ||
      "http://localhost:3000"
    ).replace(/\/$/, ""),
  };
}

export function whatsappSendConfigured(config: WhatsAppConfig): boolean {
  return Boolean(config.accessToken && config.phoneNumberId);
}
