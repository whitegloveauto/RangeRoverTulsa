"use client";

import { useEffect, useState } from "react";
import WgaHeader from "@/components/WgaHeader";
import StatementView from "@/components/StatementView";
import { useWgaSession } from "@/lib/useDealerSession";
import { hasPerm } from "@/lib/perms";

// Monthly billing statement per dealership (net terms), for invoicing.
export default function WgaStatementsPage() {
  const { session, ready } = useWgaSession();
  const [ctx, setCtx] = useState<{ dealerships: any[]; selected: any } | null>(null);
  const [dealer, setDealer] = useState("");

  useEffect(() => {
    if (!ready) return;
    fetch("/api/wga/context")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setCtx(d);
        if (d?.selected?.id) setDealer(d.selected.id);
      })
      .catch(() => {});
  }, [ready]);

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;
  if (!hasPerm(session.user, "orders")) {
    return <div className="frame"><WgaHeader userName={session.user.name} role={session.user.role} perms={session.user.perms} /><main><div className="stage"><div className="notice warn">You don&apos;t have access to this area. Ask an admin on the Team page.</div></div></main></div>;
  }

  return (
    <div className="frame stmt-page">
      <WgaHeader userName={session.user.name} role={session.user.role} perms={session.user.perms} />
      <main>
        <div className="stage" style={{ maxWidth: 1180 }}>
          <div className="stage-head no-print">
            <div className="stage-eyebrow">STATEMENTS</div>
            <div className="stage-title">Billing statements.</div>
            <div className="stage-sub">Everything completed for a dealership in each pay period — weekly, every 2 weeks or monthly, whatever their terms are — at White Glove&apos;s price. Download the CSV for QuickBooks or print it as the statement.</div>
          </div>
          {ctx && ctx.dealerships.length > 1 ? (
            <div className="tabs" style={{ flexWrap: "wrap" }}>
              {ctx.dealerships.map((d) => (
                <button key={d.id} className={dealer === d.id ? "active" : ""} onClick={() => setDealer(d.id)}>{d.short_name || d.name}</button>
              ))}
            </div>
          ) : null}
          {dealer ? <StatementView key={dealer} endpoint="/api/wga/statements" query={`dealership=${dealer}`} audience="wga" /> : <div className="loading-text">Loading…</div>}
        </div>
      </main>
    </div>
  );
}
