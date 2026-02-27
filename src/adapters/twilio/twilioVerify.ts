import twilio from "twilio";

export function verifyTwilioSignature(params: {
  authToken: string;
  signature: string;
  url: string;
  body: Record<string, string>;
}): boolean {
  return twilio.validateRequest(params.authToken, params.signature, params.url, params.body);
}
