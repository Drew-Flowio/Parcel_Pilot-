import React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...rest }: DivProps) {
  return (
    <div
      className={`rounded-xl border border-ink-200 bg-white shadow-soft ${className}`}
      {...rest}
    />
  );
}

export function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles: Record<string, string> = {
    primary:
      "bg-ink-900 text-white hover:bg-ink-800 shadow-soft",
    secondary:
      "bg-white text-ink-900 border border-ink-200 hover:border-ink-300 hover:bg-ink-50",
    ghost:
      "bg-transparent text-ink-700 hover:bg-ink-100",
    danger:
      "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Input({
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-200 ${className}`}
      {...rest}
    />
  );
}

export function Select({
  className = "",
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-200 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Label({
  children,
  className = "",
  ...rest
}: { children: React.ReactNode; className?: string } & React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-500 ${className}`}
      {...rest}
    >
      {children}
    </label>
  );
}

export function Checkbox({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700 hover:text-ink-900">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-ink-300 text-accent-500 focus:ring-accent-300"
        {...rest}
      />
      {label}
    </label>
  );
}
