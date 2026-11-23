"use client";

/**
 * The fallback for an error the root layout cannot handle (NX-011). It replaces the root
 * layout, so it brings its own document and gets none of the app's styles.
 */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>QAForge</h1>
          <p role="alert">Something went wrong. It can be retried.</p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
