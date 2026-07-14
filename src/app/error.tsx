"use client";

import { useEffect } from "react";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("MindGalaxy app boundary", {
      digest: error.digest,
      name: error.name,
    });
  }, [error.digest, error.name]);

  return (
    <main className="error-boundary">
      <section>
        <p>MindGalaxy</p>
        <h1>{t(DEFAULT_LOCALE, "app.error.title")}</h1>
        <p>{t(DEFAULT_LOCALE, "app.error.description")}</p>
        <button className="primary-button" onClick={reset} type="button">
          {t(DEFAULT_LOCALE, "app.error.retry")}
        </button>
      </section>
    </main>
  );
}
