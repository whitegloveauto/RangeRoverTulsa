// dealer-order-sm — creates a ShopMonkey ticket for a submitted dealer order.
// Auth: x-internal-token header must match dealer_program_settings.sm_internal_token.
// Modes:
//   POST { probe: "services", orderNumber } → raw GET /order/:id/service of that RO (field discovery)
//   POST { probe: "customer", name }        → customer search result
//   POST { probe: "raw", method, path, body } → forwards one call to the ShopMonkey API
//   POST { quote_id }                        → create customer/vehicle/order (+ service lines) and write back to dealer_quotes
//                                              Packages with a White Glove "build" get their labor/material lines.

const SM_BASE = "https://api.shopmonkey.cloud/v3";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SM_API_KEY = Deno.env.get("SHOPMONKEY_API_KEY") ?? "";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { "content-type": "application/json" } });

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${path} → ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

async function smToken(): Promise<string> {
  try {
    const r = await fetch(`${SM_BASE}/auth/apikey/86400`, { headers: { Authorization: `Bearer ${SM_API_KEY}` } });
    if (r.ok) {
      const j = await r.json();
      const t = j?.data?.token ?? j?.token;
      if (t) return t;
    }
  } catch (_) {}
  return SM_API_KEY;
}

let lastCall = 0;
async function sm(method: string, path: string, token: string, body?: unknown) {
  const gap = 260 - (Date.now() - lastCall);
  if (gap > 0) await new Promise((r) => setTimeout(r, gap));
  lastCall = Date.now();
  const r = await fetch(`${SM_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data };
}

const cents = (n: number) => Math.round(Number(n || 0) * 100);

// ---- per-package ticket builds ---------------------------------------------------------------
type RLine = { kind: "labor" | "material"; name: string; qty: number; price: number | null; cost?: number | null; part_number?: string | null; balance?: boolean };
type Recipe = { lines: RLine[] };

async function loadRecipes(): Promise<Record<string, Recipe>> {
  try {
    const [row] = await sb("dealer_program_settings?key=eq.sm-recipes&select=value");
    const v = typeof row?.value === "string" ? JSON.parse(row.value) : row?.value;
    return v && typeof v === "object" ? v : {};
  } catch (_) {
    return {};
  }
}

// A build is only used when it is complete: named lines with a quantity and exactly one balance line.
function usableRecipe(r: any): Recipe | null {
  const lines: RLine[] = Array.isArray(r?.lines) ? r.lines.filter((x: any) => x && (x.kind === "labor" || x.kind === "material") && String(x.name || "").trim() && Number(x.qty) > 0) : [];
  if (!lines.length || lines.length !== (r.lines || []).length) return null;
  return lines.filter((x) => x.balance).length === 1 ? { lines } : null;
}

// Finish the prices on recipe-built services so each one totals the dealer cost:
// explicit labor rates → the balance line → read the RO back → discount away anything over.
async function finishRecipes(orderId: string, orderNumber: string, quoteId: string, token: string, plan: { l: any; r: Recipe | null }[], sent: any[], created: any[]) {
  const problems: string[] = [];
  const targets = new Map<string, { name: string; T: number }>();
  const used = new Set<string>();
  for (let i = 0; i < plan.length; i++) {
    const { l, r } = plan[i];
    if (!r) continue;
    const name = sent[i].name;
    const svc = (created[i]?.name === name && !used.has(created[i]?.id) ? created[i] : null) || created.find((s: any) => s?.name === name && !used.has(s.id));
    if (!svc?.id) { problems.push(`"${name}" was not found on the RO after it was created.`); continue; }
    used.add(svc.id);
    const T = cents(l.cost);
    targets.set(String(svc.id), { name, T });
    try {
      const labors: any[] = [...(svc.labors || [])];
      const parts: any[] = [...(svc.parts || [])];
      const take = (pool: any[], nm: string) => { const k = pool.findIndex((x) => x && x.name === nm); return k === -1 ? null : pool.splice(k, 1)[0]; };
      let fixed = 0;
      let bal: { kind: "labor" | "material"; id: string; qty: number } | null = null;
      for (const x of r.lines) {
        const row = take(x.kind === "labor" ? labors : parts, x.name);
        if (!row?.id) { problems.push(`"${name}": line "${x.name}" is missing on the RO.`); continue; }
        if (x.balance) { bal = { kind: x.kind, id: String(row.id), qty: Number(x.qty) }; continue; }
        if (x.kind === "labor") {
          let rate = Number(row.rateCents || 0);
          if (x.price !== null && x.price !== undefined && cents(x.price) !== rate) {
            const u = await sm("PUT", `/order/${orderId}/service/${svc.id}/labor/${row.id}`, token, { rateCents: cents(x.price) });
            if (u.ok) rate = cents(x.price);
            else problems.push(`"${name}": could not set the rate on "${x.name}" (${u.status}).`);
          }
          fixed += Math.round(rate * Number(x.qty));
        } else fixed += Math.round(cents(x.price ?? 0) * Number(x.qty));
      }
      if (bal) {
        const rem = T - fixed;
        const unit = rem > 0 ? Math.ceil(rem / bal.qty) : 0;
        if (bal.kind === "labor") {
          const u = await sm("PUT", `/order/${orderId}/service/${svc.id}/labor/${bal.id}`, token, { rateCents: unit });
          if (!u.ok) problems.push(`"${name}": could not price the labor line that absorbs the difference (${u.status}).`);
        } else if (unit > 0) {
          const u = await sm("PUT", `/order/${orderId}/service/${svc.id}/part/${bal.id}`, token, { retailCostCents: unit });
          if (!u.ok) problems.push(`"${name}": could not price the material line that absorbs the difference (${u.status}).`);
        }
      }
    } catch (e) {
      problems.push(`"${name}": ${String((e as any)?.message ?? e).slice(0, 160)}`);
    }
  }

  // Read the RO back and make every built service equal the dealer cost, to the cent.
  const back = await sm("GET", `/order/${orderId}/service`, token);
  const now: any[] = back.data?.data ?? [];
  const checked: any[] = [];
  for (const [id, t] of targets) {
    const s = now.find((x: any) => String(x.id) === id);
    if (!s) { problems.push(`"${t.name}" could not be read back from the RO.`); continue; }
    const diff = Number(s.totalCents || 0) - t.T;
    checked.push({ service: t.name, target: t.T, built: Number(s.totalCents || 0), discount: diff > 0 ? diff : 0 });
    if (diff > 0) {
      const u = await sm("PUT", `/order/${orderId}/service/${id}`, token, { discountValueType: "FixedCents", discountCents: Number(s.discountCents || 0) + diff });
      if (!u.ok) problems.push(`"${t.name}" is $${(diff / 100).toFixed(2)} over the dealer price and the discount could not be applied (${u.status}).`);
    } else if (diff < 0) problems.push(`"${t.name}" totals $${(Number(s.totalCents || 0) / 100).toFixed(2)} on the RO but the dealer price is $${(t.T / 100).toFixed(2)}.`);
  }
  if (problems.length && quoteId) {
    await sb("dealer_order_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ quote_id: quoteId, event_type: "shopmonkey_check", actor_name: "ShopMonkey sync", detail: `RO ${orderNumber || orderId} needs a look: ${problems.join(" ").slice(0, 900)}` }) }).catch(() => {});
  }
  return { problems, checked };
}

// Step 4 of a ticket: one ShopMonkey service per ordered package.
//  • Package has a White Glove "build" (dealer_program_settings key "sm-recipes"): its labor and
//    material lines go on the service, and one line absorbs the difference so the service totals
//    the dealer cost for this model.
//  • No build: one part line at the dealer cost.
// Verified against the live account: POST ignores a labor line's rateCents (the shop default is
// applied) but PUT …/labor/:id { rateCents } sets it; part lines keep retailCostCents; a part added
// later with POST …/part gets taxed, so every part is created here and only ever updated.
// wait=false: return as soon as the lines are on the RO and finish their prices in the background
// (keeps "Submit order" fast); wait=true: finish first and report the result.
async function addServices(orderId: string, orderNumber: string, quoteId: string, quoteNumber: string, dealerName: string, lines: any[], token: string, wait: boolean, recipesOverride?: Record<string, any>) {
  const recipes = recipesOverride ?? (await loadRecipes());
  const plan = lines.map((l) => ({ l, r: usableRecipe(recipes[l.item_id]) }));
  const svcBody = plan.map(({ l, r }) => {
    const base = {
      name: `${l.service} — ${l.name}`.replace(/\s+/g, " "),
      note: `Dealer order ${quoteNumber} · ${dealerName} · dealer retail $${Number(l.retail).toLocaleString("en-US")}`,
    };
    if (!r) return { ...base, parts: [{ name: `${l.name} (${l.service})`, quantity: 1, retailCostCents: cents(l.cost), wholesaleCostCents: 0, taxable: false }] };
    return {
      ...base,
      lumpSum: true,
      labors: r.lines.filter((x) => x.kind === "labor").map((x) => ({ name: x.name, hours: x.qty, taxable: false })),
      parts: r.lines.filter((x) => x.kind === "material").map((x) => ({
        name: x.name, quantity: x.qty, retailCostCents: x.balance ? 0 : cents(x.price ?? 0), wholesaleCostCents: cents(x.cost ?? 0),
        ...(x.part_number ? { partNumber: x.part_number } : {}), taxable: false,
      })),
    };
  });
  const sc = svcBody.length ? await sm("POST", `/order/${orderId}/service`, token, svcBody) : { ok: true, status: 204, data: null as any };
  const out: any = { status: sc.status, count: svcBody.length, built: plan.filter((p) => p.r).length, err: sc.ok ? undefined : String(JSON.stringify(sc.data)).slice(0, 300) };
  const created: any[] = sc.data?.data?.services ?? (Array.isArray(sc.data?.data) ? sc.data.data : []);
  out.ids = created.map((c: any) => c?.id);
  if (sc.ok && out.built) {
    const work = finishRecipes(orderId, orderNumber, quoteId, token, plan, svcBody, created);
    const rt = (globalThis as any).EdgeRuntime;
    if (wait) out.finish = await work;
    else if (rt?.waitUntil) rt.waitUntil(work.catch((e) => console.error("finishRecipes", e)));
    else out.finish = await work.catch((e) => ({ problems: [String(e)] }));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch {}

  // --- auth
  const [tokRow] = await sb("dealer_program_settings?key=eq.sm_internal_token&select=value");
  if (!tokRow || req.headers.get("x-internal-token") !== tokRow.value) return json({ error: "unauthorized" }, 401);
  if (!SM_API_KEY) return json({ error: "SHOPMONKEY_API_KEY not set" }, 500);
  const token = await smToken();

  // --- probes (read-only)
  if (body.probe === "services") {
    const w = encodeURIComponent(JSON.stringify({ number: String(body.orderNumber || "").replace(/\D/g, "") }));
    const o = await sm("GET", `/order?limit=1&where=${w}`, token);
    const ord = o.data?.data?.[0];
    if (!ord) return json({ found: false, o });
    const svc = await sm("GET", `/order/${ord.id}/service`, token);
    return json({ order: ord, services: svc });
  }
  if (body.probe === "customer") {
    const r = await sm("POST", "/customer/search", token, { limit: 5, where: { normalizedName: { contains: String(body.name || "").toLowerCase() } } });
    return json(r);
  }
  if (body.probe === "build_test") {
    // Runs step 4 on an existing RO (a test ticket) with the given lines + builds, waits for the prices
    // to be finished, and returns the services as ShopMonkey has them. Clean up with a raw DELETE.
    const w = encodeURIComponent(JSON.stringify({ number: String(body.orderNumber || "").replace(/\D/g, "") }));
    const o = await sm("GET", `/order?limit=1&where=${w}`, token);
    const ord = o.data?.data?.[0];
    if (!ord) return json({ found: false });
    const res = await addServices(String(ord.id), String(ord.number ?? ""), "", "BUILD-TEST", "Build test", body.lines || [], token, true, body.recipes || undefined);
    const after = await sm("GET", `/order/${ord.id}/service`, token);
    const mine = (after.data?.data ?? []).filter((x: any) => (res.ids || []).includes(x.id));
    return json({
      orderId: ord.id, result: res,
      services: mine.map((x: any) => ({
        id: x.id, name: x.name, totalCents: x.totalCents, discountCents: x.discountCents, lumpSum: x.lumpSum, taxCents: x.taxCents,
        labors: (x.labors || []).map((l: any) => ({ name: l.name, hours: l.hours, rateCents: l.rateCents })),
        parts: (x.parts || []).map((p: any) => ({ name: p.name, quantity: p.quantity, retailCostCents: p.retailCostCents, wholesaleCostCents: p.wholesaleCostCents, partNumber: p.partNumber })),
      })),
    });
  }
  if (body.probe === "raw") {
    const r = await sm(body.method || "GET", body.path, token, body.body);
    return json(r);
  }

  // --- real run
  const quoteId = String(body.quote_id || "");
  if (!quoteId) return json({ error: "quote_id required" }, 400);
  const [q] = await sb(`dealer_quotes?id=eq.${quoteId}&select=*,dealer_dealerships(name,location,brand)`);
  if (!q) return json({ error: "quote not found" }, 404);
  if (q.sm_order_id) return json({ ok: true, already: true, sm_order_id: q.sm_order_id, sm_order_number: q.sm_order_number });

  const dealerName: string = q.dealer_dealerships?.name || "Dealership";
  const lines: any[] = Array.isArray(q.line_items) ? q.line_items : [];
  const steps: any = {};
  try {
    // 1. customer (the dealership is the paying customer)
    let customerId: string | null = null;
    const search = await sm("POST", "/customer/search", token, { limit: 5, where: { normalizedName: { contains: dealerName.toLowerCase() } } });
    const found = (search.data?.data ?? search.data ?? []) as any[];
    const match = Array.isArray(found) ? found.find((c: any) => String(c.companyName || c.name || "").toLowerCase() === dealerName.toLowerCase()) || found[0] : null;
    if (match?.id) customerId = match.id;
    else {
      const cr = await sm("POST", "/customer", token, { customerType: "Fleet", companyName: dealerName });
      customerId = cr.data?.data?.id ?? cr.data?.id ?? null;
      steps.customerCreate = { status: cr.status, id: customerId };
    }
    steps.customerId = customerId;

    // 2. vehicle (by VIN if present, else create)
    let vehicleId: string | null = null;
    const vin = (q.vehicle_vin || "").trim();
    if (vin.length >= 11) {
      const vr = await sm("GET", `/vehicle/vin/${encodeURIComponent(vin)}`, token);
      const v = vr.data?.data ?? vr.data;
      if (vr.ok && v?.id) vehicleId = v.id;
    }
    if (!vehicleId) {
      const vc = await sm("POST", "/vehicle", token, {
        customerId, size: "LightDuty", year: Number(q.vehicle_year), make: q.dealer_dealerships?.brand || "Land Rover", model: q.vehicle_model, submodel: q.vehicle_trim,
        vin: vin || undefined, note: `Trim: ${q.vehicle_trim}${q.stock_number ? ` · Stock ${q.stock_number}` : ""}`,
      });
      vehicleId = vc.data?.data?.id ?? vc.data?.id ?? null;
      steps.vehicleCreate = { status: vc.status, id: vehicleId, err: vc.ok ? undefined : vc.data };
    }
    steps.vehicleId = vehicleId;

    // 3. order
    const summary = lines.map((l) => `• ${l.service}: ${l.name} — $${Number(l.cost).toLocaleString("en-US")}`).join("\n");
    const complaint =
      `DEALER ORDER ${q.quote_number} — ${dealerName}\n${q.vehicle_year} ${q.vehicle_model} ${q.vehicle_trim}` +
      `${q.stock_number ? `\nStock # ${q.stock_number}` : ""}${vin ? `\nVIN ${vin}` : ""}` +
      `${q.customer_name ? `\nEnd customer: ${q.customer_name}${q.customer_phone ? " " + q.customer_phone : ""}` : ""}` +
      `${q.available_from || q.needed_by ? `\nAVAILABLE FROM: ${q.available_from || "any time"}   NEEDED BACK BY: ${q.needed_by || "no deadline"}${q.urgency === "urgent" ? "   ** URGENT **" : q.urgency === "soon" ? "   (tight)" : ""}` : ""}` +
      `\n\nServices (WGA bills dealer):\n${summary}\nTotal to dealer: $${Number(q.cost_total).toLocaleString("en-US")}` +
      `${q.notes ? `\n\nDealer notes: ${q.notes}` : ""}\n\nPlaced by ${q.dealer_user_name || "dealer portal"}`;
    const oc = await sm("POST", "/order", token, {
      customerId, vehicleId,
      name: `${dealerName} · ${q.vehicle_year} ${q.vehicle_model} ${q.vehicle_trim}`,
      complaint,
    });
    const order = oc.data?.data ?? oc.data;
    if (!oc.ok || !order?.id) throw new Error(`order create ${oc.status}: ${JSON.stringify(oc.data).slice(0, 300)}`);
    steps.order = { id: order.id, number: order.number };

    // 4. services — one per line item (see addServices)
    steps.services = await addServices(String(order.id), String(order.number ?? ""), quoteId, String(q.quote_number), dealerName, lines, token, false);

    await sb(`dealer_quotes?id=eq.${quoteId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ sm_order_id: String(order.id), sm_order_number: String(order.number ?? ""), sm_synced_at: new Date().toISOString(), sm_sync_error: null, status: q.status === "new" ? "in_shopmonkey" : q.status, status_updated_at: new Date().toISOString() }),
    });
    await sb("dealer_order_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ quote_id: quoteId, event_type: "shopmonkey_created", from_status: q.status, to_status: "in_shopmonkey", actor_name: "ShopMonkey sync", detail: `RO ${order.number ?? order.id} created` }) });
    return json({ ok: true, sm_order_id: order.id, sm_order_number: order.number, steps });
  } catch (e) {
    const msg = String((e as any)?.message ?? e).slice(0, 500);
    await sb(`dealer_quotes?id=eq.${quoteId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sm_sync_error: msg }) }).catch(() => {});
    return json({ ok: false, error: msg, steps }, 500);
  }
});
