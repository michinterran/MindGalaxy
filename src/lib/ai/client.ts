import OpenAI from "openai";
import { getOpenAIEnv } from "@/lib/env";

let openAIClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const env = getOpenAIEnv();

  if (!env) {
    return null;
  }

  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  return openAIClient;
}
