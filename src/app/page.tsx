import { Mail, Network, ShieldCheck } from "lucide-react";
import { signInWithEmail, signInWithGoogle, signOut } from "@/app/auth/actions";
import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace } from "@/lib/workspaces/bootstrap";

function AuthScreen({ configured }: { configured: boolean }) {
  return (
    <main className="auth-screen">
      <section className="auth-shell">
        <div className="auth-copy">
          <div className="auth-badge">
            <ShieldCheck className="size-4" />
            Supabase Auth Ready
          </div>
          <h1>
            복사한 지식이 바로 정리되는 개인 지식지도
          </h1>
          <p>
            Google 또는 이메일로 로그인하면 개인 workspace가 자동으로 생성됩니다.
            이후 붙여넣은 원문은 안전하게 저장되고, AI 구조화 작업은 job으로
            예약됩니다.
          </p>
          <div className="auth-preview" aria-hidden="true">
            <Network className="size-5" />
            <span>Mind Map</span>
            <i />
            <span>Galaxy</span>
            <i />
            <span>Export</span>
          </div>
        </div>

        <section className="auth-card">
          <p className="ui-kicker">Sign in</p>
          <h2>MindGalaxy 시작</h2>
          <p>
            Google SSO가 가장 빠릅니다. 이메일은 magic link 방식으로 동작합니다.
          </p>

          {!configured ? (
            <div className="auth-warning">
              Supabase 환경변수가 아직 설정되지 않았습니다.
            </div>
          ) : null}

          <form action={signInWithGoogle}>
            <button
              className="auth-google-button"
              disabled={!configured}
              type="submit"
            >
              <span>G</span>
              Google로 계속하기
            </button>
          </form>

          <div className="auth-divider">
            <i />
            또는
            <i />
          </div>

          <form action={signInWithEmail} className="auth-email-form">
            <label className="field-label" htmlFor="email">
              이메일
              <input
                id="email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </label>
            <button
              className="secondary-button auth-email-button"
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
    <main className="center-screen">
      <section className="system-card">
        <p className="ui-kicker">Workspace Error</p>
        <h1>workspace 생성에 실패했습니다.</h1>
        <p>
          Supabase RLS 또는 테이블 정책을 다시 확인해야 합니다. 로그아웃 후 다시
          시도할 수 있습니다.
        </p>
        <form action={signOut}>
          <button className="primary-button" type="submit">
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
