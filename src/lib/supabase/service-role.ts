import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretEnv } from "@/lib/env";
import type { Database } from "@/types/database";

let serviceRoleClient: SupabaseClient<Database> | null = null;

export function getSupabaseServiceRoleClient(): SupabaseClient<Database> | null {
  if (typeof window !== "undefined") {
    throw new Error("SUPABASE_SERVICE_ROLE_SERVER_ONLY");
  }

  const env = getSupabaseSecretEnv();

  if (!env) {
    return null;
  }

  if (!serviceRoleClient) {
    serviceRoleClient = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return serviceRoleClient;
}
