import { describe, expect, it } from "vitest";
import { normalizeStopMessage } from "../src/utils/parsing";
import { TriageService } from "../src/services/triage";

class NoopLLM {
  async generateTriageQuestions() {
    return null;
  }
}

describe("conversation flow", () => {
  const triage = new TriageService(new NoopLLM() as any);

  it("new report -> ask Q1", async () => {
    const result = await triage.buildQuestions({
      body: "Found outside office",
      hasGps: false,
      hasExifTime: false,
    });

    expect(result.questions[0]?.text).toBe("Is the bird alive/injured or dead?");
  });

  it("answer -> ask Q2", async () => {
    const result = await triage.buildQuestions({
      body: "Found outside office",
      hasGps: true,
      hasExifTime: true,
    });

    const currentQuestionOrder = 1;
    const nextQuestion = result.questions[currentQuestionOrder];
    expect(nextQuestion?.text).toBe("Was it found near glass/windows?");
  });

  it("finish -> COMPLETE", async () => {
    const result = await triage.buildQuestions({
      body: "Found outside office",
      hasGps: true,
      hasExifTime: true,
    });

    const answeredAll = 3;
    const done = answeredAll >= result.questions.length;
    expect(done).toBe(true);
  });

  it("STOP -> ends", () => {
    expect(normalizeStopMessage("STOP")).toBe(true);
    expect(normalizeStopMessage("CANCEL")).toBe(true);
    expect(normalizeStopMessage("UNSUBSCRIBE")).toBe(true);
  });
});
