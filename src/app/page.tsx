import { Mail, ShieldCheck } from "lucide-react";
import { signInWithEmail, signInWithGoogle, signOut } from "@/app/auth/actions";
import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace } from "@/lib/workspaces/bootstrap";

function AuthScreen({ configured }: { configured: boolean }) {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(125,211,252,0.18),transparent_26%),radial-gradient(circle_at_80%_2%,rgba(196,181,253,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.05)_0_1px,transparent_1px)] bg-[length:auto,auto,34px_34px]" />
      <section className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-8 lg:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.28em] text-source">
            <ShieldCheck className="size-4" />
            Supabase Auth Ready
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.08em] text-zinc-50 md:text-7xl">
            복사한 지식이
            <br />
            바로 기억으로 쌓이는 곳
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted">
            Google 또는 이메일로 로그인하면 개인 workspace가 자동으로 생성됩니다.
            이후 붙여넣은 원문은 안전하게 저장되고, AI 구조화 작업은 job으로
            예약됩니다.
          </p>
        </div>

        <section className="rounded-[2rem] border border-line bg-panel/90 p-5 shadow-2xl shadow-black/50">
          <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ai">
            Sign in
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em]">
            MindGalaxy 시작
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Google SSO가 가장 빠릅니다. 이메일은 magic link 방식으로 동작합니다.
          </p>

          {!configured ? (
            <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
              Supabase 환경변수가 아직 설정되지 않았습니다.
            </div>
          ) : null}

          <form action={signInWithGoogle} className="mt-5">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-signal"
              disabled={!configured}
              type="submit"
            >
              <span className="grid size-5 place-items-center rounded-full bg-black text-xs font-bold text-white">
                G
              </span>
              Google로 계속하기
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <div className="h-px flex-1 bg-line" />
            또는
            <div className="h-px flex-1 bg-line" />
          </div>

          <form action={signInWithEmail} className="space-y-3">
            <label className="block text-xs font-medium text-muted" htmlFor="email">
              이메일
            </label>
            <input
              className="w-full rounded-2xl border border-white/10 bg-black/45 px-3 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-source/60"
              id="email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
            <button
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:border-source/50 hover:bg-source/10"
              disabled={!configured}
              type="submit"
            >
              <Mail className="size-4" />
              이메일 링크 받기
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function WorkspaceErrorScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-[2rem] border border-line bg-panel/90 p-6 shadow-2xl shadow-black/50">
        <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ai">
          Workspace Error
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.05em]">
          workspace 생성에 실패했습니다.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Supabase RLS 또는 테이블 정책을 다시 확인해야 합니다. 로그아웃 후 다시
          시도할 수 있습니다.
        </p>
        <form action={signOut} className="mt-6">
          <button
            className="inline-flex rounded-2xl bg-signal px-4 py-3 text-sm font-semibold text-black transition hover:bg-white"
            type="submit"
          >
            로그아웃
          </button>
        </form>
      </section>
    </main>
  );
}

export default async function Home() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AuthScreen configured={false} />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <AuthScreen configured />;
  }

  let workspace: Awaited<ReturnType<typeof ensureDefaultWorkspace>>;

  try {
    workspace = await ensureDefaultWorkspace(supabase, user);
  } catch {
    return <WorkspaceErrorScreen />;
  }

  const { count } = await supabase
    .from("captures")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id);

  const { data: captures } = await supabase
    .from("captures")
    .select("id, title, raw_text, source_kind, created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(6);

  return (
    <KnowledgeWorkspace
      captureCount={count ?? 0}
      recentCaptures={(captures ?? []).map((capture) => ({
        id: capture.id,
        title: capture.title,
        rawTextLength: capture.raw_text.length,
        sourceKind: capture.source_kind,
        createdAt: capture.created_at,
      }))}
      userEmail={user.email}
      workspace={workspace}
    />
  );
}
