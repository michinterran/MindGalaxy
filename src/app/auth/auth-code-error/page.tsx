import Link from "next/link";
import { t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export default async function AuthCodeErrorPage() {
  const locale = await getRequestLocale();

  return (
    <main className="center-screen">
      <section className="system-card">
        <p className="ui-kicker">{t(locale, "auth.codeError.kicker")}</p>
        <h1>{t(locale, "auth.codeError.title")}</h1>
        <p>{t(locale, "auth.codeError.description")}</p>
        <Link className="primary-button" href="/">
          {t(locale, "auth.codeError.back")}
        </Link>
      </section>
    </main>
  );
}
