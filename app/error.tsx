"use client";
export default function Error({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <main className="dashboard">
      <section className="panel" role="alert">
        <h1 className="text-2xl font-bold">
          Campaign data could not be loaded
        </h1>
        <p className="my-4 text-slate-600">
          The data service may be unavailable. Try again to reload this
          selection.
        </p>
        <button className="action" onClick={retry}>
          Try again
        </button>
      </section>
    </main>
  );
}
