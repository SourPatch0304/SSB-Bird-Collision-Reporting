import { Router } from "express";
import { z } from "zod";
import { reportService } from "../services";

const querySchema = z.object({
  force: z.coerce.boolean().optional(),
});

export const adminRouter = Router();

adminRouter.post("/admin/reprocess/:id", async (req, res, next) => {
  try {
    const { force } = querySchema.parse(req.query);
    const report = await reportService.reprocess(req.params.id, force ?? false);

    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    res.json(report);
  } catch (error) {
    next(error);
  }
});
