import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { ParcelPilotLogo } from "@/components/ui/Logo";
import { ParcelDetailClient } from "./ParcelDetailClient";
import type { Parcel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ParcelPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("parcels")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) notFound();

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <header className="mb-8 flex items-center justify-between border-b border-ink-200 pb-6">
        <Link href="/">
          <ParcelPilotLogo />
        </Link>
        <Link
          href="/"
          className="text-sm font-medium text-ink-500 hover:text-accent-600"
        >
          ← Back to cockpit
        </Link>
      </header>

      <ParcelDetailClient initial={data as Parcel} />
    </div>
  );
}
