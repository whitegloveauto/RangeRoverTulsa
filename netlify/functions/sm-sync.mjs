import { createHash } from "node:crypto";

// Every 10 minutes: ask the portal to pull ShopMonkey RO statuses into dealer orders.
// The work happens in /api/internal/sm-sync; this just knocks on the door with the shared key.
export default async () => {
  const base = (process.env.URL || "https://lrt.whitegloveauto.app").replace(/\/$/, "");
  const secret = process.env.SESSION_SECRET || "";
  if (!base || !secret) return new Response("missing URL or SESSION_SECRET", { status: 500 });
  const key = createHash("sha256").update(`wga-internal:${secret}`).digest("hex");
  const r = await fetch(`${base}/api/internal/sm-sync`, { method: "POST", headers: { "x-internal-key": key } });
  const body = await r.text();
  console.log(`sm-sync ${r.status} ${body.slice(0, 300)}`);
  return new Response(body, { status: r.status });
};

export const config = { schedule: "*/10 * * * *" };
