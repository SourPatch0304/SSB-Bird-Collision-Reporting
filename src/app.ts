import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { healthRouter } from "./routes/health";
import { reportsRouter } from "./routes/reports";
import { twilioRouter } from "./routes/twilio";
import { adminRouter } from "./routes/admin";
import { logger } from "./utils/logger";
import { requestIdMiddleware } from "./utils/requestId";

export function createApp() {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(cors());
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.use(healthRouter);
  app.use(twilioRouter);
  app.use(reportsRouter);
  app.use(adminRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
