import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="center-screen">
      <section className="system-card">
        <p className="ui-kicker">Auth Error</p>
        <h1>로그인 연결을 완료하지 못했습니다.</h1>
        <p>
          Google 또는 이메일 링크가 만료되었거나, OAuth callback 처리 중 문제가
          발생했습니다. 다시 로그인해 주세요.
        </p>
        <Link className="primary-button" href="/">
          로그인으로 돌아가기
        </Link>
      </section>
    </main>
  );
}
