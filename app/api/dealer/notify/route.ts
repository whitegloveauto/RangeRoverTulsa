import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getNotifyPrefs, setNotifyPrefs, type NotifyLevel } from "@/lib/dealerEmail";
import { emailConfigured } from "@/lib/email";

export const runtime = "nodejs";

// GET — this dealership's email preferences (dealer admins)
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  return NextResponse.json({ prefs: await getNotifyPrefs(s.dealershipId), emailConfigured: emailConfigured() });
}

// PUT { users?: { [userId]: "mine"|"all"|"off" }, extra?: string[] } — merged into what's saved
export async function PUT(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const cur = await getNotifyPrefs(s.dealershipId);
  if (b.users && typeof b.users === "object") {
    for (const [id, lvl] of Object.entries(b.users)) {
      if (["mine", "all", "off"].includes(String(lvl))) cur.users[id] = lvl as NotifyLevel;
    }
  }
  if (Array.isArray(b.extra)) {
    const list = b.extra.map((e: any) => String(e).trim().toLowerCase()).filter(Boolean);
    const bad = list.filter((e: string) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (bad.length) return NextResponse.json({ error: `Not an email address: ${bad.join(", ")}` }, { status: 400 });
    cur.extra = Array.from(new Set(list)).slice(0, 20) as string[];
  }
  const ok = await setNotifyPrefs(s.dealershipId, cur);
  if (!ok) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true, prefs: cur });
}
