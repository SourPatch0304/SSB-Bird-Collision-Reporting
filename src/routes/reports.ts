import { Router } from "express";
import { z } from "zod";
import { prisma } from "../adapters/db";
import { TriageStatus } from "@prisma/client";

const querySchema = z.object({
  status: z.nativeEnum(TriageStatus).optional(),
  phoneNumber: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

const answersSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      valueText: z.string().min(1),
    }),
  ),
});

export const reportsRouter = Router();

reportsRouter.get("/reports", async (req, res, next) => {
  try {
    const parsed = querySchema.parse(req.query);
    const reports = await prisma.report.findMany({
      where: {
        triageStatus: parsed.status,
        phoneNumber: parsed.phoneNumber,
        createdAt:
          parsed.fromDate || parsed.toDate
            ? {
                gte: parsed.fromDate ? new Date(parsed.fromDate) : undefined,
                lte: parsed.toDate ? new Date(parsed.toDate) : undefined,
              }
            : undefined,
      },
      orderBy: { createdAt: "desc" },
      include: {
        media: true,
      },
    });

    res.json(reports);
  } catch (error) {
    next(error);
  }
});

reportsRouter.get("/reports/:id", async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: {
        media: true,
        questions: { orderBy: { order: "asc" } },
        answers: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    res.json(report);
  } catch (error) {
    next(error);
  }
});

reportsRouter.post("/reports/:id/answers", async (req, res, next) => {
  try {
    const body = answersSchema.parse(req.body);
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    await prisma.answer.createMany({
      data: body.answers.map((a) => ({
        reportId: req.params.id,
        questionId: a.questionId,
        valueText: a.valueText,
      })),
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});
