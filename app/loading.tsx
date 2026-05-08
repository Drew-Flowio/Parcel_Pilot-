import React from "react";

function ShimmerBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-ink-100 ${className ?? ""}`} aria-hidden />;
}

export default function Loading() {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-ink-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <ShimmerBar className="h-9 w-40" />
          <div className="flex gap-2">
            <ShimmerBar className="h-8 w-24" />
            <ShimmerBar className="h-8 w-20" />
            <ShimmerBar className="h-8 w-20" />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-ink-200/90 bg-gradient-to-br from-white via-accent-50/20 to-white p-6 shadow-soft sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:justify-between">
              <div className="max-w-2xl flex-1 space-y-4">
                <ShimmerBar className="h-6 w-48" />
                <ShimmerBar className="h-10 w-full max-w-md" />
                <ShimmerBar className="h-4 w-full" />
                <ShimmerBar className="h-4 w-[80%]" />
                <div className="flex gap-2 pt-2">
                  <ShimmerBar className="h-10 w-32" />
                  <ShimmerBar className="h-10 w-40" />
                </div>
              </div>
              <div className="w-full rounded-2xl border border-ink-200 bg-white/80 p-5 sm:max-w-sm">
                <ShimmerBar className="h-3 w-28" />
                <ShimmerBar className="mt-3 h-6 w-3/4" />
                <ShimmerBar className="mt-2 h-3 w-full" />
                <ShimmerBar className="mt-5 h-2.5 w-full" />
                <ShimmerBar className="mt-2 h-3 w-full" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ink-200/90 bg-gradient-to-b from-white to-ink-50/80 p-4 shadow-soft sm:p-5">
            <ShimmerBar className="h-5 w-48" />
            <ShimmerBar className="mt-2 h-3 max-w-xl" />
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex flex-col items-center rounded-2xl border border-ink-200/70 bg-white/90 px-2 py-4 shadow-sm"
                >
                  <div className="relative h-[5.25rem] w-[8.75rem] overflow-hidden rounded-lg bg-ink-50/90">
                    <ShimmerBar className="absolute bottom-2 left-1/4 right-1/4 top-10 h-6" />
                  </div>
                  <ShimmerBar className="mt-3 h-2 w-20" />
                  <ShimmerBar className="mt-2 h-3 w-full max-w-[8rem]" />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-soft lg:col-span-5">
              <ShimmerBar className="h-3 w-40" />
              <ShimmerBar className="mt-4 h-12 w-3/4" />
              <ShimmerBar className="mt-3 h-4 w-full" />
              <ShimmerBar className="mt-6 h-2.5 w-full border-t border-ink-100 pt-6" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-ink-200 bg-white p-5 shadow-soft">
                  <ShimmerBar className="h-3 w-32" />
                  <ShimmerBar className="mt-3 h-8 w-24" />
                  <ShimmerBar className="mt-4 h-2.5 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
