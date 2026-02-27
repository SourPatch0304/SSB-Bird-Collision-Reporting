import { ConversationFlowState, ConversationState, PrismaClient, Question } from "@prisma/client";

export class ConversationService {
  constructor(private readonly prisma: PrismaClient, private readonly threadWindowMinutes: number) {}

  async getState(phoneNumber: string): Promise<ConversationState | null> {
    return this.prisma.conversationState.findUnique({ where: { phoneNumber } });
  }

  isWithinThreadWindow(lastInboundAt: Date, now: Date): boolean {
    const diffMs = now.getTime() - lastInboundAt.getTime();
    return diffMs <= this.threadWindowMinutes * 60 * 1000;
  }

  async markDone(phoneNumber: string, reportId: string, now: Date): Promise<void> {
    await this.prisma.conversationState.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        currentReportId: reportId,
        currentQuestionOrder: 0,
        state: ConversationFlowState.DONE,
        lastInboundAt: now,
      },
      update: {
        currentQuestionOrder: 0,
        state: ConversationFlowState.DONE,
        lastInboundAt: now,
      },
    });
  }

  async startAsking(phoneNumber: string, reportId: string, now: Date): Promise<void> {
    await this.prisma.conversationState.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        currentReportId: reportId,
        currentQuestionOrder: 1,
        state: ConversationFlowState.ASKING,
        lastInboundAt: now,
      },
      update: {
        currentReportId: reportId,
        currentQuestionOrder: 1,
        state: ConversationFlowState.ASKING,
        lastInboundAt: now,
      },
    });
  }

  async advance(phoneNumber: string, reportId: string, nextOrder: number, now: Date): Promise<void> {
    await this.prisma.conversationState.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        currentReportId: reportId,
        currentQuestionOrder: nextOrder,
        state: ConversationFlowState.ASKING,
        lastInboundAt: now,
      },
      update: {
        currentQuestionOrder: nextOrder,
        state: ConversationFlowState.ASKING,
        lastInboundAt: now,
      },
    });
  }

  async getQuestionByOrder(reportId: string, order: number): Promise<Question | null> {
    return this.prisma.question.findFirst({
      where: { reportId, order },
    });
  }
}
