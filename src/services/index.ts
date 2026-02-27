import { prisma } from "../adapters/db";
import { LocalStorageAdapter } from "../adapters/storage/localStorage";
import { OpenAIProvider } from "../adapters/llm/openaiProvider";
import { ConversationService } from "./conversation";
import { MediaService } from "./mediaService";
import { ReportService } from "./reportService";
import { TriageService } from "./triage";

const storage = new LocalStorageAdapter(process.env.STORAGE_DIR ?? "./data/uploads");
const llm = new OpenAIProvider(process.env.OPENAI_API_KEY);
const triageService = new TriageService(llm);

export const mediaService = new MediaService(
  prisma,
  storage,
  process.env.TWILIO_ACCOUNT_SID ?? "",
  process.env.TWILIO_AUTH_TOKEN ?? "",
  Number(process.env.MAX_MEDIA_BYTES ?? "8000000"),
);

export const reportService = new ReportService(prisma, mediaService, triageService);
export const conversationService = new ConversationService(
  prisma,
  Number(process.env.THREAD_WINDOW_MINUTES ?? "10"),
);
