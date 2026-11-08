import { supabaseAdmin } from "@/lib/supabase";

// Small JSON settings stored in dealer_program_settings (key → value text).
// Used for things that don't deserve their own column, e.g. per-dealership email preferences.
export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabaseAdmin.from("dealer_program_settings").select("value").eq("key", key).maybeSingle();
  if (!data || data.value === null || data.value === undefined) return fallback;
  try {
    const v = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export async function kvSet(key: string, value: unknown): Promise<boolean> {
  const { error } = await supabaseAdmin.from("dealer_program_settings").upsert({ key, value: JSON.stringify(value) }, { onConflict: "key" });
  if (error) console.error("kvSet", key, error.message);
  return !error;
}
