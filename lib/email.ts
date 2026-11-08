import { supabaseAdmin } from "@/lib/supabase";

// Outbound email through Resend's HTTP API (no SDK needed).
//   RESEND_API_KEY  — required to actually send; without it every send is skipped and logged
//   EMAIL_FROM      — e.g. "White Glove Auto <orders@whitegloveauto.app>" (domain must be verified in Resend)
//   EMAIL_REPLY_TO  — optional, where dealer replies land (e.g. the shop inbox)
// Sends are best-effort: they never throw and never hold a request for more than a few seconds.

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendEmail(msg: { to: string[]; subject: string; html: string; text: string }): Promise<boolean> {
  const to = Array.from(new Set(msg.to.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))));
  if (!to.length) return false;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email skipped — RESEND_API_KEY not set] to=${to.join(",")} subject="${msg.subject}"`);
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "White Glove Auto <orders@whitegloveauto.app>",
        to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error(`[email failed ${r.status}] to=${to.join(",")} subject="${msg.subject}" ${(await r.text()).slice(0, 300)}`);
    return r.ok;
  } catch (e: any) {
    console.error(`[email error] ${e?.message || e}`);
    return false;
  }
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Public URL for a dealership's portal (its first hostname), else this site's URL.
export async function siteUrlFor(dealershipId?: string | null): Promise<string> {
  if (dealershipId) {
    const { data } = await supabaseAdmin.from("dealer_dealerships").select("hostnames").eq("id", dealershipId).maybeSingle();
    const h = (data?.hostnames || []).find((x: string) => x && !x.includes("localhost"));
    if (h) return `https://${h}`;
  }
  return (process.env.URL || "https://lrt.whitegloveauto.app").replace(/\/$/, "");
}

export interface EmailBody {
  base: string; // site URL, used for the logo
  partner?: string; // dealership name shown next to the WGA mark
  heading: string;
  intro?: string; // plain text, newlines kept
  rows?: [string, string][];
  quote?: string; // a message body to show in a quote block
  cta?: { href: string; label: string };
  footer?: string;
}

// One branded, table-based layout that renders in Gmail, Outlook and Apple Mail.
export function renderEmail(b: EmailBody): { html: string; text: string } {
  const rows = (b.rows || []).filter(([, v]) => v);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f2f2f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e3e0">
<tr><td style="background:#141414;padding:18px 24px">
  <img src="${esc(b.base)}/wga-white.png" alt="White Glove Auto" height="16" style="height:16px;width:auto;display:inline-block;vertical-align:middle;border:0">
  ${b.partner ? `<span style="color:#8fd3ff;font-size:11px;letter-spacing:2px;margin-left:10px;vertical-align:middle">× ${esc(b.partner.toUpperCase())}</span>` : ""}
</td></tr>
<tr><td style="padding:28px 24px 8px">
  <div style="font-size:20px;font-weight:600;line-height:1.3;margin:0 0 12px">${esc(b.heading)}</div>
  ${b.intro ? `<div style="font-size:14px;line-height:1.55;color:#3a3a3a;white-space:pre-line">${esc(b.intro)}</div>` : ""}
</td></tr>
${b.quote ? `<tr><td style="padding:8px 24px"><div style="border-left:3px solid #8fd3ff;background:#f6f8fa;padding:12px 14px;font-size:14px;line-height:1.5;white-space:pre-line">${esc(b.quote)}</div></td></tr>` : ""}
${rows.length ? `<tr><td style="padding:12px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-top:1px solid #ececea">${rows
    .map(([k, v]) => `<tr><td style="padding:8px 0;color:#777;width:38%;border-bottom:1px solid #ececea;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #ececea;vertical-align:top">${esc(v)}</td></tr>`)
    .join("")}</table></td></tr>` : ""}
${b.cta ? `<tr><td style="padding:16px 24px 8px"><a href="${esc(b.cta.href)}" style="display:inline-block;background:#141414;color:#ffffff;text-decoration:none;font-size:13px;letter-spacing:1px;padding:12px 20px">${esc(b.cta.label.toUpperCase())}</a></td></tr>` : ""}
<tr><td style="padding:20px 24px 24px;font-size:11px;line-height:1.5;color:#999">${esc(b.footer || "White Glove Auto · Tulsa, Oklahoma")}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    b.heading,
    "",
    b.intro || "",
    b.quote ? `\n"${b.quote}"\n` : "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    b.cta ? `\n${b.cta.label}: ${b.cta.href}` : "",
    "",
    b.footer || "White Glove Auto · Tulsa, Oklahoma",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
  return { html, text };
}
