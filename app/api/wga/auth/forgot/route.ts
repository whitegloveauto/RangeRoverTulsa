import { NextResponse } from "next/server";
import { loadProfile } from "@/lib/wgaAuth";
import { emailConfigured, renderEmail, sendEmail } from "@/lib/email";
import { makeResetToken, requestOrigin, throttled, wgaFingerprint } from "@/lib/reset";

export const runtime = "nodejs";

// POST { email } — email a White Glove staff member a one-time link to set a new password.
// Same answer whether or not the address is a staff account.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter your White Glove email." }, { status: 400 });
  if (!emailConfigured()) return NextResponse.json({ ok: false, emailConfigured: false });
  if (throttled(`wga:${email}`)) return NextResponse.json({ ok: true, emailConfigured: true });

  const p = await loadProfile(email);
  if (typeof p !== "string") {
    const origin = requestOrigin();
    const token = await makeResetToken("wga", p.id, await wgaFingerprint(p.id));
    const link = `${origin}/wga/reset?token=${encodeURIComponent(token)}`;
    const { html, text } = renderEmail({
      base: origin,
      heading: "Reset your White Glove password.",
      intro: `Hi ${p.full_name.split(" ")[0]} — use the button below to choose a new password. It's the same password for the dealer program and the White Glove app. The link works once and expires in an hour.\n\nIf you didn't ask for this, ignore it; nothing has changed.`,
      cta: { href: link, label: "Choose a new password" },
    });
    await sendEmail({ to: [p.email], subject: "Reset your White Glove Auto password", html, text });
  }
  return NextResponse.json({ ok: true, emailConfigured: true });
}
