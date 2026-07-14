import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type WorkspaceBootstrapResult = {
  id: string;
  name: string;
  isNew: boolean;
};

async function ensureOwnerMembership(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  userId: string,
) {
  const { error } = await supabase.from("workspace_members").upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
    },
    {
      onConflict: "workspace_id,user_id",
    },
  );

  if (error) {
    console.error("[workspace] membership upsert failed", error);
    throw new Error("WORKSPACE_MEMBERSHIP_CREATE_FAILED");
  }
}

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
    console.error("[workspace] lookup failed", existingError);
    throw new Error("WORKSPACE_LOOKUP_FAILED");
  }

  if (existing) {
    await ensureOwnerMembership(supabase, existing.id, user.id);

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
    console.error("[workspace] create failed", workspaceError);
    throw new Error("WORKSPACE_CREATE_FAILED");
  }

  await ensureOwnerMembership(supabase, workspace.id, user.id);

  return {
    id: workspace.id,
    name: workspace.name,
    isNew: true,
  };
}
