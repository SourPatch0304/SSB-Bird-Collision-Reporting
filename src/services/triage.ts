import { QuestionType } from "@prisma/client";
import { LLMProvider } from "../adapters/llm/llmProvider";

export interface QuestionTemplate {
  text: string;
  type: QuestionType;
  choices?: string[];
}

export interface TriageResult {
  summary?: string;
  questions: QuestionTemplate[];
}

export class TriageService {
  constructor(private readonly llmProvider: LLMProvider) {}

  async buildQuestions(input: {
    body: string;
    hasGps: boolean;
    hasExifTime: boolean;
  }): Promise<TriageResult> {
    const fallback = this.fallbackQuestions(input.hasGps);

    const generated = await this.llmProvider.generateTriageQuestions(input);
    if (!generated) {
      return { questions: fallback };
    }

    const questions: QuestionTemplate[] = [
      {
        text: "Is the bird alive/injured or dead?",
        type: QuestionType.MULTICHOICE,
        choices: ["Alive/Injured", "Dead", "Not sure"],
      },
      ...generated.questions.map((q) => ({
        text: q.text,
        type: q.type,
        choices: q.choices,
      })),
    ].slice(0, 3);

    if (questions.length < 2) {
      return { questions: fallback };
    }

    return {
      summary: generated.summary,
      questions,
    };
  }

  fallbackQuestions(hasGps: boolean): QuestionTemplate[] {
    const q1: QuestionTemplate = {
      text: "Is the bird alive/injured or dead?",
      type: QuestionType.MULTICHOICE,
      choices: ["Alive/Injured", "Dead", "Not sure"],
    };

    const q2: QuestionTemplate = hasGps
      ? {
          text: "Was it found near glass/windows?",
          type: QuestionType.YES_NO,
        }
      : {
          text: "Where exactly was it found (address, park, or building)?",
          type: QuestionType.FREE_TEXT,
        };

    const q3: QuestionTemplate = hasGps
      ? {
          text: "Any visible head injury or bleeding?",
          type: QuestionType.YES_NO,
        }
      : {
          text: "Any landmark/building name nearby?",
          type: QuestionType.FREE_TEXT,
        };

    return [q1, q2, q3];
  }
}
