import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type WorkspaceBootstrapResult = {
  id: string;
  name: string;
  isNew: boolean;
};

export async function ensureDefaultWorkspace(
  supabase: SupabaseClient<Database>,
  user: User,
): Promise<WorkspaceBootstrapResult> {
  const { data: existing, error: existingError } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error("WORKSPACE_LOOKUP_FAILED");
  }

  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      isNew: false,
    };
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({
      owner_id: user.id,
      name: "MindGalaxy",
    })
    .select("id, name")
    .single();

  if (workspaceError || !workspace) {
    throw new Error("WORKSPACE_CREATE_FAILED");
  }

  const { error: membershipError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: "owner",
    });

  if (membershipError) {
    throw new Error("WORKSPACE_MEMBERSHIP_CREATE_FAILED");
  }

  return {
    id: workspace.id,
    name: workspace.name,
    isNew: true,
  };
}
