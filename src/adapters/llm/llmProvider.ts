import { z } from "zod";

export const GeneratedQuestionSchema = z.object({
  text: z.string(),
  type: z.enum(["YES_NO", "MULTICHOICE", "FREE_TEXT"]),
  choices: z.array(z.string()).optional(),
});

export const TriageLLMResponseSchema = z.object({
  summary: z.string().optional(),
  questions: z.array(GeneratedQuestionSchema).max(2),
});

export type TriageLLMResponse = z.infer<typeof TriageLLMResponseSchema>;

export interface LLMProvider {
  generateTriageQuestions(input: {
    body: string;
    hasGps: boolean;
    hasExifTime: boolean;
  }): Promise<TriageLLMResponse | null>;
}
