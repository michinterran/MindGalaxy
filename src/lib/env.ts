import { z } from "zod";

const supabasePublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const openAIEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
});

export type SupabasePublicEnv = z.infer<typeof supabasePublicEnvSchema>;
export type OpenAIEnv = z.infer<typeof openAIEnvSchema>;

type EnvReadiness = {
  supabase: boolean;
  openai: boolean;
  missing: string[];
};

export function getPublicSupabaseEnv(): SupabasePublicEnv | null {
  const parsed = supabasePublicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  return parsed.success ? parsed.data : null;
}

export const getSupabasePublicEnv = getPublicSupabaseEnv;

export function getOpenAIEnv(): OpenAIEnv | null {
  const parsed = openAIEnvSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  });

  return parsed.success ? parsed.data : null;
}

export function getEnvReadiness(): EnvReadiness {
  const missing: string[] = [];
  const supabase = getPublicSupabaseEnv() !== null;
  const openai = getOpenAIEnv() !== null;

  if (!supabase) {
    missing.push(
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  if (!openai) {
    missing.push("OPENAI_API_KEY");
  }

  return {
    supabase,
    openai,
    missing,
  };
}
