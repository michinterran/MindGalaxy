import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-[2rem] border border-line bg-panel/90 p-6 shadow-2xl shadow-black/50">
        <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ai">
          Auth Error
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.05em]">
          로그인 연결을 완료하지 못했습니다.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Google 또는 이메일 링크가 만료되었거나, OAuth callback 처리 중 문제가
          발생했습니다. 다시 로그인해 주세요.
        </p>
        <Link
          className="mt-6 inline-flex rounded-2xl bg-signal px-4 py-3 text-sm font-semibold text-black transition hover:bg-white"
          href="/"
        >
          로그인으로 돌아가기
        </Link>
      </section>
    </main>
  );
}
