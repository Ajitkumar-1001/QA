"use client";

/**
 * The error state for a failed load, a failed Start or a failed result read (PRD §15.1,
 * §10.2). It shows fixed text, never the error's message; `retry()` re-fetches and
 * re-renders the segment.
 */
export default function Error({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <h1 className="mb-6 text-xl font-semibold">QAForge</h1>
      <p role="alert">Something went wrong. It can be retried.</p>
      <button
        className="mt-4 rounded border border-current px-4 py-2"
        type="button"
        onClick={() => retry()}
      >
        Try again
      </button>
    </main>
  );
}
