import { supabaseAdmin } from "@/lib/supabase";

// Shared loader for an order's photos + message thread (used by both the dealer and WGA APIs).
const BUCKET = "dealer-orders";

export async function loadActivity(quoteId: string) {
  const [{ data: photos }, { data: messages }] = await Promise.all([
    supabaseAdmin.from("dealer_order_photos").select("id, kind, path, caption, taken_by, created_at").eq("quote_id", quoteId).order("created_at"),
    supabaseAdmin.from("dealer_order_messages").select("id, kind, body, author_kind, author_name, status, created_at, resolved_at").eq("quote_id", quoteId).order("created_at"),
  ]);
  const signed = await Promise.all(
    (photos || []).map(async (p) => {
      const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(p.path, 60 * 60);
      return { ...p, url: data?.signedUrl || null };
    })
  );
  return { photos: signed, messages: messages || [], openRequests: (messages || []).filter((m) => m.kind === "request" && m.status === "open").length };
}

export async function uploadOrderPhoto(quoteId: string, file: File, kind: "qc" | "issue", takenBy: string, caption?: string) {
  if (!/^image\/(png|jpe?g|webp|heic|heif)$/.test(file.type)) throw new Error("Use a photo (JPG, PNG, WebP or HEIC).");
  if (file.size > 15 * 1024 * 1024) throw new Error("Photo must be under 15 MB.");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type.includes("heic") || file.type.includes("heif") ? "heic" : "jpg";
  const path = `${quoteId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) throw new Error("Upload failed: " + error.message);
  const { error: dbErr } = await supabaseAdmin.from("dealer_order_photos").insert({ quote_id: quoteId, kind, path, caption: caption || null, taken_by: takenBy });
  if (dbErr) throw new Error("Could not save photo.");
  return path;
}

export async function deleteOrderPhoto(id: string) {
  const { data } = await supabaseAdmin.from("dealer_order_photos").select("path").eq("id", id).maybeSingle();
  if (data) await supabaseAdmin.storage.from(BUCKET).remove([data.path]);
  await supabaseAdmin.from("dealer_order_photos").delete().eq("id", id);
}
