"use client";

import { useEffect, useRef, useState } from "react";

// Photos + request thread on an order. Dealer side: add requests / issue photos.
// WGA side: upload QC photos, reply, mark requests done.
interface Photo { id: string; kind: string; url: string | null; caption: string | null; taken_by: string | null; created_at: string }
interface Msg { id: string; kind: string; body: string; author_kind: string; author_name: string | null; status: string; created_at: string }

export default function OrderActivity({ quoteId, side, canWrite = true }: { quoteId: string; side: "dealer" | "wga"; canWrite?: boolean }) {
  const api = side === "wga" ? "/api/wga/orders/activity" : "/api/orders/activity";
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await fetch(`${api}?quote_id=${quoteId}`);
    if (r.ok) {
      const d = await r.json();
      setPhotos(d.photos || []);
      setMessages(d.messages || []);
    }
    setLoaded(true);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setErr("");
    const body = side === "wga" ? { quote_id: quoteId, action: "reply", body: text } : { quote_id: quoteId, body: text };
    const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Failed");
    setText("");
    load();
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.append("quote_id", quoteId);
    if (side === "wga") Array.from(files).forEach((f) => fd.append("files", f));
    else fd.append("file", files[0]);
    const r = await fetch(api, { method: "POST", body: fd });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Upload failed");
    load();
  }
  async function act(body: any) {
    const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote_id: quoteId, ...body }) });
    if (!r.ok) setErr((await r.json()).error || "Failed");
    load();
  }

  const qc = photos.filter((p) => p.kind === "qc");
  const issues = photos.filter((p) => p.kind !== "qc");
  const when = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="activity">
      {/* ---- QC photos ---- */}
      <div className="act-section">
        <div className="act-head">
          <span className="act-title">Quality check photos</span>
          {side === "wga" && canWrite ? (
            <label className="btn-primary btn-sm" style={{ cursor: "pointer" }}>
              {busy ? "Uploading…" : "+ Add photos"}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} onChange={(e) => upload(e.target.files)} disabled={busy} />
            </label>
          ) : null}
        </div>
        {qc.length === 0 ? <div className="act-empty">{loaded ? (side === "wga" ? "No QC photos yet — shoot the vehicle from every angle when it's done." : "White Glove Auto adds photos of the finished vehicle here.") : "Loading…"}</div> : null}
        <div className="photo-grid">
          {qc.map((p) => (
            <figure key={p.id}>
              {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.url} alt={p.caption || "QC photo"} loading="lazy" /></a> : null}
              <figcaption>{p.caption || when(p.created_at)}{side === "wga" && canWrite ? <button className="link-btn danger" onClick={() => confirm("Delete this photo?") && act({ action: "delete_photo", photo_id: p.id })}>×</button> : null}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      {/* ---- Requests thread ---- */}
      <div className="act-section">
        <div className="act-head">
          <span className="act-title">Requests &amp; notes</span>
          {messages.some((m) => m.kind === "request" && m.status === "open") ? <span className="status-pill new">{messages.filter((m) => m.kind === "request" && m.status === "open").length} open</span> : null}
        </div>
        {messages.length === 0 && issues.length === 0 ? <div className="act-empty">{side === "dealer" ? "Need something changed after submitting? Add it here — White Glove Auto gets an alert." : "No requests from the dealership."}</div> : null}
        <div className="thread">
          {messages.map((m) => (
            <div key={m.id} className={"msg " + m.author_kind + (m.kind === "request" ? " request" : "")}>
              <div className="msg-meta">
                <b>{m.author_name || (m.author_kind === "wga" ? "White Glove Auto" : "Dealership")}</b> · {when(m.created_at)}
                {m.kind === "request" ? <span className={"status-pill " + (m.status === "open" ? "new" : "complete")} style={{ marginLeft: 8 }}>{m.status === "open" ? "Open request" : "Done"}</span> : null}
              </div>
              <div className="msg-body">{m.body}</div>
              {side === "wga" && canWrite && m.kind === "request" ? (
                <div style={{ marginTop: 6 }}>
                  {m.status === "open" ? <button className="link-btn" onClick={() => act({ action: "resolve", message_id: m.id })}>Mark done</button> : <button className="link-btn" onClick={() => act({ action: "reopen", message_id: m.id })}>Reopen</button>}
                </div>
              ) : null}
            </div>
          ))}
          {issues.length ? (
            <div className="photo-grid" style={{ marginTop: 8 }}>
              {issues.map((p) => (
                <figure key={p.id}>
                  {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.url} alt={p.caption || "Photo from dealership"} loading="lazy" /></a> : null}
                  <figcaption>From {p.taken_by || "dealership"} · {when(p.created_at)}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </div>
        {canWrite ? (
          <div className="composer">
            <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={side === "wga" ? "Reply to the dealership…" : "e.g. Customer added the windshield film — please include it. Or: vehicle now available Thursday instead of Monday."} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {side === "dealer" ? (
                <label className="btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                  Attach photo
                  <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => upload(e.target.files)} disabled={busy} />
                </label>
              ) : null}
              <button className="btn-primary btn-sm" onClick={send} disabled={busy || !text.trim()}>{side === "wga" ? "Send reply" : "Send request"}</button>
            </div>
          </div>
        ) : null}
        {err ? <div className="err" style={{ marginTop: 6 }}>{err}</div> : null}
      </div>
    </div>
  );
}
