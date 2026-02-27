import { PrismaClient, QuestionType, TriageStatus } from "@prisma/client";
import { computeGeohash } from "./geoService";
import { extractCityStateFromText } from "../utils/parsing";
import { TriageService } from "./triage";
import { IncomingMedia, MediaService } from "./mediaService";

export interface CreateReportInput {
  phoneNumber: string;
  messageBody: string;
  media: IncomingMedia[];
  receivedAt: Date;
}

export class ReportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly mediaService: MediaService,
    private readonly triageService: TriageService,
  ) {}

  async createReportWithMedia(input: CreateReportInput) {
    const locationHints = extractCityStateFromText(input.messageBody);
    const report = await this.prisma.report.create({
      data: {
        phoneNumber: input.phoneNumber,
        messageBody: input.messageBody,
        city: locationHints.city,
        state: locationHints.state,
        receivedAt: input.receivedAt,
        observedAt: input.receivedAt,
        observedAtSource: "MESSAGE_RECEIVED",
        triageStatus: TriageStatus.NEW,
      },
    });

    const savedMedia = await this.mediaService.downloadAndStoreForReport(report.id, input.media);

    const firstExifTime = savedMedia.find((m) => m.exifCapturedAt)?.exifCapturedAt;
    const firstGps = savedMedia.find((m) => typeof m.exifLat === "number" && typeof m.exifLng === "number");

    const triageData = await this.triageService.buildQuestions({
      body: input.messageBody,
      hasGps: Boolean(firstGps),
      hasExifTime: Boolean(firstExifTime),
    });

    const updated = await this.prisma.report.update({
      where: { id: report.id },
      data: {
        triageStatus: TriageStatus.WAITING_FOR_ANSWERS,
        llmSummary: triageData.summary,
        observedAt: firstExifTime ?? input.receivedAt,
        observedAtSource: firstExifTime ? "EXIF" : "MESSAGE_RECEIVED",
        exifCapturedAt: firstExifTime,
        lat: firstGps?.exifLat,
        lng: firstGps?.exifLng,
        geohash:
          typeof firstGps?.exifLat === "number" && typeof firstGps?.exifLng === "number"
            ? computeGeohash(firstGps.exifLat, firstGps.exifLng)
            : null,
      },
    });

    await this.prisma.question.createMany({
      data: triageData.questions.map((q, idx) => ({
        reportId: updated.id,
        text: q.text,
        type: q.type,
        choices: q.choices,
        order: idx + 1,
      })),
    });

    return this.prisma.report.findUniqueOrThrow({
      where: { id: updated.id },
      include: {
        media: true,
        questions: { orderBy: { order: "asc" } },
      },
    });
  }

  async appendMediaToReport(reportId: string, media: IncomingMedia[]) {
    const saved = await this.mediaService.downloadAndStoreForReport(reportId, media);
    const report = await this.prisma.report.findUniqueOrThrow({ where: { id: reportId } });

    if (!report.exifCapturedAt) {
      const exifTime = saved.find((m) => m.exifCapturedAt)?.exifCapturedAt;
      if (exifTime) {
        await this.prisma.report.update({
          where: { id: reportId },
          data: {
            exifCapturedAt: exifTime,
            observedAt: exifTime,
            observedAtSource: "EXIF",
          },
        });
      }
    }

    if (typeof report.lat !== "number" || typeof report.lng !== "number") {
      const gps = saved.find((m) => typeof m.exifLat === "number" && typeof m.exifLng === "number");
      if (gps && typeof gps.exifLat === "number" && typeof gps.exifLng === "number") {
        await this.prisma.report.update({
          where: { id: reportId },
          data: {
            lat: gps.exifLat,
            lng: gps.exifLng,
            geohash: computeGeohash(gps.exifLat, gps.exifLng),
          },
        });
      }
    }
  }

  async answerQuestion(reportId: string, questionOrder: number, valueText: string) {
    const question = await this.prisma.question.findFirst({
      where: { reportId, order: questionOrder },
    });

    if (!question) {
      return { done: true as const, nextQuestion: null };
    }

    await this.prisma.answer.create({
      data: {
        reportId,
        questionId: question.id,
        valueText,
      },
    });

    const nextQuestion = await this.prisma.question.findFirst({
      where: { reportId, order: questionOrder + 1 },
    });

    if (!nextQuestion) {
      await this.prisma.report.update({
        where: { id: reportId },
        data: { triageStatus: TriageStatus.COMPLETE },
      });
      return { done: true as const, nextQuestion: null };
    }

    return { done: false as const, nextQuestion };
  }

  async reprocess(reportId: string, force = false) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { media: true },
    });

    if (!report) return null;
    if (!force && report.triageStatus === TriageStatus.COMPLETE) {
      return report;
    }

    const triageData = await this.triageService.buildQuestions({
      body: report.messageBody,
      hasGps: typeof report.lat === "number" && typeof report.lng === "number",
      hasExifTime: Boolean(report.exifCapturedAt),
    });

    await this.prisma.question.deleteMany({ where: { reportId } });
    await this.prisma.question.createMany({
      data: triageData.questions.map((q, idx) => ({
        reportId,
        text: q.text,
        type: q.type as QuestionType,
        choices: q.choices,
        order: idx + 1,
      })),
    });

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        llmSummary: triageData.summary,
        triageStatus: TriageStatus.WAITING_FOR_ANSWERS,
      },
      include: {
        questions: { orderBy: { order: "asc" } },
      },
    });
  }
}
