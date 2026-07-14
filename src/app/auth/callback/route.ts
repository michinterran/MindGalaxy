import { NextResponse } from "next/server";
import { ensureDefaultWorkspace } from "@/lib/workspaces/bootstrap";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getSafeNext(searchParams: URLSearchParams) {
  const next = searchParams.get("next") ?? "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeNext(url.searchParams);

  if (!code) {
    return NextResponse.redirect(new URL("/auth/auth-code-error", url.origin));
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/?auth=not-configured", url.origin));
  }

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(new URL("/auth/auth-code-error", url.origin));
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL("/auth/auth-code-error", url.origin));
  }

  try {
    await ensureDefaultWorkspace(supabase, user);
  } catch {
    return NextResponse.redirect(new URL("/?auth=workspace-error", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
