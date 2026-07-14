"use server";

import { redirect } from "next/navigation";
import { getRequestOrigin } from "@/lib/auth/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getEmail(formData: FormData) {
  const email = formData.get("email");
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export async function signInWithGoogle() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/?auth=not-configured");
  }

  const origin = await getRequestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=/`,
    },
  });

  if (error || !data.url) {
    redirect("/?auth=google-error");
  }

  redirect(data.url);
}

export async function signInWithEmail(formData: FormData) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/?auth=not-configured");
  }

  const email = getEmail(formData);

  if (!email) {
    redirect("/?auth=email-required");
  }

  const origin = await getRequestOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    redirect("/?auth=email-error");
  }

  redirect("/?auth=email-sent");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/");
}
