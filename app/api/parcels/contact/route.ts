import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import type { ContactedVia, ContactStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ContactBody {
  id: string;
  action: "sms" | "email" | "call";
  message?: string;
  newStatus?: ContactStatus;
}

/**
 * Stub for SMS/email send. In production, swap in Twilio / Resend / SendGrid.
 * Reads provider keys from env (currently unused) but never exposes them.
 */
async function sendStub(action: "sms" | "email", payload: Record<string, unknown>) {
  // const key = action === "sms" ? process.env.SMS_PROVIDER_API_KEY : process.env.EMAIL_PROVIDER_API_KEY;
  // TODO: integrate with provider
  console.log(`[parcel-pilot] (stub) ${action} send`, payload);
  return { ok: true };
}

export async function POST(req: NextRequest) {
  let body: ContactBody;
  try {
    body = (await req.json()) as ContactBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id || !body.action) {
    return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
  }

  const supabase = getSupabaseServer();

  // Look up parcel for the stub send
  const { data: parcel, error: fetchErr } = await supabase
    .from("parcels")
    .select("id, owner_name, owner_phone, owner_email")
    .eq("id", body.id)
    .single();
  if (fetchErr || !parcel) {
    return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
  }

  if (body.action === "sms" || body.action === "email") {
    await sendStub(body.action, {
      to: body.action === "sms" ? parcel.owner_phone : parcel.owner_email,
      owner: parcel.owner_name,
      message: body.message ?? "",
    });
  }

  const via: ContactedVia = body.action;
  const newStatus: ContactStatus = body.newStatus ?? "contacted";

  const { data: updated, error: updErr } = await supabase
    .from("parcels")
    .update({
      contact_status: newStatus,
      contacted_via: via,
      last_contacted_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select("*")
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, parcel: updated });
}
