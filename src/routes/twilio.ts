import { Router } from "express";
import { ConversationFlowState } from "@prisma/client";
import { conversationService, reportService } from "../services";
import { validateMediaCount, validateMediaType } from "../services/mediaService";
import { normalizeStopMessage } from "../utils/parsing";
import { messageTwiml } from "../adapters/twilio/twiml";
import { verifyTwilioSignature } from "../adapters/twilio/twilioVerify";
import { prisma } from "../adapters/db";
import { logger } from "../utils/logger";

export const twilioRouter = Router();

function getBaseUrl(req: { originalUrl: string; protocol: string; get(header: string): string | undefined }): string {
  const configured = process.env.BASE_URL;
  if (configured) {
    return `${configured}${req.originalUrl}`;
  }
  const host = req.get("host") ?? "localhost:3000";
  return `${req.protocol}://${host}${req.originalUrl}`;
}

function buildMediaFromPayload(payload: Record<string, string>, count: number) {
  const media: Array<{ mediaUrl: string; contentType: string; mediaSid?: string }> = [];
  for (let i = 0; i < count; i += 1) {
    const mediaUrl = payload[`MediaUrl${i}`];
    const contentType = payload[`MediaContentType${i}`];
    const mediaSid = payload[`MediaSid${i}`];
    if (mediaUrl && contentType) {
      media.push({ mediaUrl, contentType, mediaSid });
    }
  }
  return media;
}

twilioRouter.post("/webhooks/twilio/inbound", async (req, res) => {
  const payload = req.body as Record<string, string>;
  const from = payload.From;
  const body = payload.Body ?? "";
  const numMedia = Number(payload.NumMedia ?? 0);
  const now = new Date();

  if (!from) {
    res.type("text/xml").status(400).send(messageTwiml("Missing sender phone number."));
    return;
  }

  if ((process.env.TWILIO_WEBHOOK_AUTH ?? "true") === "true") {
    const signature = req.header("x-twilio-signature");
    if (!signature || !process.env.TWILIO_AUTH_TOKEN) {
      res.type("text/xml").status(403).send(messageTwiml("Webhook signature validation failed."));
      return;
    }

    const valid = verifyTwilioSignature({
      authToken: process.env.TWILIO_AUTH_TOKEN,
      signature,
      url: getBaseUrl(req),
      body: payload,
    });

    if (!valid) {
      res.type("text/xml").status(403).send(messageTwiml("Webhook signature validation failed."));
      return;
    }
  }

  if (normalizeStopMessage(body)) {
    const state = await conversationService.getState(from);
    if (state) {
      await conversationService.markDone(from, state.currentReportId, now);
    }
    res.type("text/xml").send(messageTwiml("You have been unsubscribed from this conversation."));
    return;
  }

  const media = buildMediaFromPayload(payload, numMedia);
  const mediaCountValidation = validateMediaCount(numMedia);

  const state = await conversationService.getState(from);
  const isExistingThread =
    state && conversationService.isWithinThreadWindow(state.lastInboundAt, now) && state.state !== ConversationFlowState.DONE;

  if (!isExistingThread) {
    if (!mediaCountValidation.valid) {
      res.type("text/xml").send(messageTwiml(mediaCountValidation.message ?? "Please send photos."));
      return;
    }

    for (const item of media) {
      const mediaTypeCheck = validateMediaType(item.contentType);
      if (!mediaTypeCheck.valid) {
        res.type("text/xml").send(messageTwiml(mediaTypeCheck.message ?? "Unsupported image type."));
        return;
      }
    }

    try {
      const report = await reportService.createReportWithMedia({
        phoneNumber: from,
        messageBody: body,
        media,
        receivedAt: now,
      });

      const firstQuestion = report.questions[0]?.text ?? "Is the bird alive/injured or dead?";
      await conversationService.startAsking(from, report.id, now);
      res.type("text/xml").send(messageTwiml(`Thank you for the report. ${firstQuestion}`));
    } catch (error) {
      logger.error({ err: error }, "failed to create report");
      res.type("text/xml").send(messageTwiml("We could not process those photos. Please try again."));
    }

    return;
  }

  const currentReportId = state.currentReportId;
  const currentOrder = state.currentQuestionOrder;

  if (media.length > 0) {
    try {
      await reportService.appendMediaToReport(currentReportId, media);
    } catch (error) {
      logger.warn({ err: error }, "failed to append media in active thread");
      res.type("text/xml").send(messageTwiml("We could not attach one of those photos. Please retry with smaller JPEG/PNG files."));
      return;
    }
  }

  const response = await reportService.answerQuestion(currentReportId, currentOrder, body);
  const rehabText = process.env.REHABBER_INFO_TEXT ?? "";
  const rehabUrl = process.env.REHABBER_INFO_URL ?? "";

  const isAlive = body.trim().toLowerCase().includes("alive") || body.trim().toLowerCase().includes("injured");

  if (response.done) {
    await conversationService.markDone(from, currentReportId, now);
    const doneMessage = isAlive
      ? `Thanks, your report is complete. ${rehabText} ${rehabUrl}`.trim()
      : "Thanks, your report is complete. Our team may follow up if needed.";
    res.type("text/xml").send(messageTwiml(doneMessage));
    return;
  }

  await conversationService.advance(from, currentReportId, currentOrder + 1, now);
  const nextText = response.nextQuestion?.text ?? "Thank you.";

  if (isAlive) {
    const combined = `${rehabText} ${rehabUrl}`.trim();
    res.type("text/xml").send(messageTwiml(`${combined}\n\n${nextText}`.trim()));
    return;
  }

  res.type("text/xml").send(messageTwiml(nextText));
});

twilioRouter.post("/webhooks/twilio/status", (req, res) => {
  const payload = req.body as Record<string, string>;
  logger.info(
    {
      messageSid: payload.MessageSid,
      status: payload.MessageStatus,
      errorCode: payload.ErrorCode,
    },
    "twilio status callback",
  );
  res.status(200).json({ ok: true });
});
