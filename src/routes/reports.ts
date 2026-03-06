import { Router } from "express";
import { z } from "zod";
import { prisma } from "../adapters/db";

// Since we removed the Enums to fix the SQLite JSON/Enum errors, 
// we will validate the status as a simple string via Zod.
const querySchema = z.object({
  status: z.string().optional(),
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

// 1. GET ALL REPORTS
reportsRouter.get("/reports", async (req, res, next) => {
  try {
    const parsed = querySchema.parse(req.query);
    const reports = await prisma.reports.findMany({
      where: {
        status: parsed.status, // Match lowercase column 'status'
        sender_hash: parsed.phoneNumber, // Match 'sender_hash'
        created_at:
          parsed.fromDate || parsed.toDate
            ? {
                gte: parsed.fromDate, // SQLite handles dates as strings
                lte: parsed.toDate,
              }
            : undefined,
      },
      orderBy: { created_at: "desc" },
      include: {
        images: true, // Table name is now 'images', not 'media'
      },
    });

    res.json(reports);
  } catch (error) {
    next(error);
  }
});

// 2. GET SINGLE REPORT BY ID
reportsRouter.get("/reports/:id", async (req, res, next) => {
  try {
    const report = await prisma.reports.findUnique({
      where: { report_id: req.params.id }, // Column is 'report_id'
      include: {
        images: true,
        chatbot_interactions: { orderBy: { created_at: "asc" } },
        followup_answers: { orderBy: { created_at: "asc" } },
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

// 3. POST ANSWERS TO A REPORT
reportsRouter.post("/reports/:id/answers", async (req, res, next) => {
  try {
    const body = answersSchema.parse(req.body);
    const report = await prisma.reports.findUnique({ 
      where: { report_id: req.params.id } 
    });
    
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    // Table is now 'followup_answers', not 'answer'
    await prisma.followup_answers.createMany({
      data: body.answers.map((a) => ({
        answer_id: crypto.randomUUID(), // SQLite often needs a generated ID for creates
        report_id: req.params.id,
        question_type: a.questionId, // Mapping questionId to question_type
        answer_text: a.valueText,    // Mapping valueText to answer_text
      })),
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});