import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { currentTenant } from "@/lib/tenant";
import { emailConfigured, renderEmail, sendEmail } from "@/lib/email";
import { dealerFingerprint, makeResetToken, requestOrigin, throttled } from "@/lib/reset";

export const runtime = "nodejs";

// POST { email } — email a one-time reset link to a dealership login on this portal.
// Always answers the same way whether or not the address has a login.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter the email you sign in with." }, { status: 400 });
  if (!emailConfigured()) return NextResponse.json({ ok: false, emailConfigured: false });
  if (throttled(`dealer:${email}`)) return NextResponse.json({ ok: true, emailConfigured: true });

  const tenant = await currentTenant();
  if (tenant) {
    const { data: user } = await supabaseAdmin
      .from("dealer_users")
      .select("id, name, email, active")
      .eq("dealership_id", tenant.dealership.id)
      .ilike("email", email)
      .maybeSingle();
    const f = user?.active ? await dealerFingerprint(user.id) : null;
    if (user && f) {
      const origin = requestOrigin();
      const token = await makeResetToken("dealer", user.id, f);
      const link = `${origin}/reset?token=${encodeURIComponent(token)}`;
      const { html, text } = renderEmail({
        base: origin,
        partner: tenant.dealership.short_name || tenant.dealership.name,
        heading: "Reset your password.",
        intro: `Hi ${user.name.split(" ")[0]} — someone asked to reset the password for your ${tenant.dealership.name} dealer portal login. If that was you, use the button below. The link works once and expires in an hour.\n\nIf it wasn't you, ignore this email; your password hasn't changed.`,
        cta: { href: link, label: "Choose a new password" },
      });
      await sendEmail({ to: [user.email], subject: "Reset your dealer portal password", html, text });
    }
  }
  return NextResponse.json({ ok: true, emailConfigured: true });
}
