"use client";

import React from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          classNames: {
            toast:
              "font-sans border border-ink-200/90 bg-white text-ink-900 shadow-lg",
            title: "font-semibold text-ink-900",
            description: "text-ink-600",
            success: "border-emerald-200 bg-emerald-50/95",
            error: "border-red-200 bg-red-50/95",
          },
        }}
      />
    </>
  );
}
