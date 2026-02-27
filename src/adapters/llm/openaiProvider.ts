import { LLMProvider, TriageLLMResponse, TriageLLMResponseSchema } from "./llmProvider";

export class OpenAIProvider implements LLMProvider {
  constructor(private readonly apiKey?: string) {}

  async generateTriageQuestions(input: { body: string; hasGps: boolean; hasExifTime: boolean }): Promise<TriageLLMResponse | null> {
    if (!this.apiKey) return null;

    try {
      const payload = {
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Return strict JSON with keys summary and questions. questions must contain at most 2 items and skip location/time prompts if GPS/time already exist.",
          },
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
      };

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) return null;

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = json.choices?.[0]?.message?.content;
      if (!content) return null;
      return TriageLLMResponseSchema.parse(JSON.parse(content));
    } catch {
      return null;
    }
  }
}
