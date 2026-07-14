import { z } from "zod";

const supabasePublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const supabaseSecretEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const openAIEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
});

const analysisWorkerEnvSchema = z.object({
  ANALYSIS_WORKER_SECRET: z.string().min(24),
});

export type SupabasePublicEnv = z.infer<typeof supabasePublicEnvSchema>;
export type SupabaseSecretEnv = z.infer<typeof supabaseSecretEnvSchema>;
export type OpenAIEnv = z.infer<typeof openAIEnvSchema>;
export type AnalysisWorkerEnv = z.infer<typeof analysisWorkerEnvSchema>;

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

export function getSupabaseSecretEnv(): SupabaseSecretEnv | null {
  const parsed = supabaseSecretEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
  });

  return parsed.success ? parsed.data : null;
}

export function getOpenAIEnv(): OpenAIEnv | null {
  const parsed = openAIEnvSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  });

  return parsed.success ? parsed.data : null;
}

export function getAnalysisWorkerEnv(): AnalysisWorkerEnv | null {
  const parsed = analysisWorkerEnvSchema.safeParse({
    ANALYSIS_WORKER_SECRET: process.env.ANALYSIS_WORKER_SECRET,
  });

  return parsed.success ? parsed.data : null;
}

export function getEnvReadiness(): EnvReadiness {
  const missing: string[] = [];
  const supabase = getPublicSupabaseEnv() !== null;
  const openai = getOpenAIEnv() !== null;
  const worker = getAnalysisWorkerEnv() !== null;

  if (!supabase) {
    missing.push(
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  if (!openai) {
    missing.push("OPENAI_API_KEY");
  }

  if (!worker) {
    missing.push("ANALYSIS_WORKER_SECRET");
  }

  return {
    supabase,
    openai: openai && worker,
    missing,
  };
}
