import { Mail, Network, ShieldCheck } from "lucide-react";
import { signInWithEmail, signInWithGoogle, signOut } from "@/app/auth/actions";
import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { loadWorkspaceGraph } from "@/features/knowledge-map/server/load-workspace-graph";
import { t, type Locale } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace } from "@/lib/workspaces/bootstrap";

function AuthScreen({
  configured,
  locale,
}: {
  configured: boolean;
  locale: Locale;
}) {
  return (
    <main className="auth-screen">
      <section className="auth-shell">
        <div className="auth-copy">
          <div className="auth-badge">
            <ShieldCheck className="size-4" />
            {t(locale, "auth.badge")}
          </div>
          <h1>{t(locale, "auth.title")}</h1>
          <p>{t(locale, "auth.description")}</p>
          <div className="auth-preview" aria-hidden="true">
            <Network className="size-5" />
            <span>{t(locale, "auth.preview.mindMap")}</span>
            <i />
            <span>{t(locale, "auth.preview.galaxy")}</span>
            <i />
            <span>{t(locale, "auth.preview.export")}</span>
          </div>
        </div>

        <section className="auth-card">
          <p className="ui-kicker">{t(locale, "auth.signIn.kicker")}</p>
          <h2>{t(locale, "auth.signIn.title")}</h2>
          <p>{t(locale, "auth.signIn.description")}</p>

          {!configured ? (
            <div className="auth-warning">
              {t(locale, "auth.notConfigured")}
            </div>
          ) : null}

          <form action={signInWithGoogle}>
            <button
              className="auth-google-button"
              disabled={!configured}
              type="submit"
            >
              <span>G</span>
              {t(locale, "auth.googleCta")}
            </button>
          </form>

          <div className="auth-divider">
            <i />
            {t(locale, "auth.divider")}
            <i />
          </div>

          <form action={signInWithEmail} className="auth-email-form">
            <label className="field-label" htmlFor="email">
              {t(locale, "auth.emailLabel")}
              <input
                id="email"
                name="email"
                placeholder={t(locale, "auth.emailPlaceholder")}
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
              {t(locale, "auth.emailCta")}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function WorkspaceErrorScreen({ locale }: { locale: Locale }) {
  return (
    <main className="center-screen">
      <section className="system-card">
        <p className="ui-kicker">{t(locale, "auth.workspaceError.kicker")}</p>
        <h1>{t(locale, "auth.workspaceError.title")}</h1>
        <p>{t(locale, "auth.workspaceError.description")}</p>
        <form action={signOut}>
          <button className="primary-button" type="submit">
            {t(locale, "auth.signOut")}
          </button>
        </form>
      </section>
    </main>
  );
}

export default async function Home() {
  const locale = await getRequestLocale();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AuthScreen configured={false} locale={locale} />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <AuthScreen configured locale={locale} />;
  }

  let workspace: Awaited<ReturnType<typeof ensureDefaultWorkspace>>;

  try {
    workspace = await ensureDefaultWorkspace(supabase, user);
  } catch {
    return <WorkspaceErrorScreen locale={locale} />;
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
  const captureIds = (captures ?? []).map((capture) => capture.id);
  const { data: jobs } = captureIds.length
    ? await supabase
        .from("processing_jobs")
        .select("capture_id, status, created_at")
        .eq("workspace_id", workspace.id)
        .in("capture_id", captureIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const latestJobStatusByCaptureId = new Map<string, string>();

  for (const job of jobs ?? []) {
    if (!latestJobStatusByCaptureId.has(job.capture_id)) {
      latestJobStatusByCaptureId.set(job.capture_id, job.status);
    }
  }
  const graph = await loadWorkspaceGraph(supabase, workspace.id, locale);

  return (
    <KnowledgeWorkspace
      captureCount={count ?? 0}
      recentCaptures={(captures ?? []).map((capture) => ({
        id: capture.id,
        title: capture.title,
        rawTextLength: capture.raw_text.length,
        sourceKind: capture.source_kind,
        createdAt: capture.created_at,
        processingStatus: latestJobStatusByCaptureId.get(capture.id) ?? null,
      }))}
      locale={locale}
      graph={graph}
      userEmail={user.email}
      workspace={workspace}
    />
  );
}
