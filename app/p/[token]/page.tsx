import { loadPacket } from "@/lib/packet";
import CustomerPacket, { PACKET_CSS } from "@/components/CustomerPacket";

export const dynamic = "force-dynamic";

// Public, unguessable link a dealer texts or emails to the customer. No login.
export default async function PublicPacketPage({ params }: { params: { token: string } }) {
  const data = await loadPacket({ token: params.token });
  if (!data) {
    return (
      <div className="frame"><main><div className="login-stage"><h1 className="login-title">This link has expired.</h1><p className="login-sub">Ask your dealership advisor for a fresh copy of your protection proposal.</p></div></main></div>
    );
  }
  return (
    <div className="frame">
      <style>{PACKET_CSS}</style>
      <main style={{ padding: "24px 12px 48px" }}>
        <CustomerPacket data={data} />
        <p className="no-print" style={{ textAlign: "center", fontSize: 11, color: "var(--text-3)", marginTop: 18 }}>
          Use your browser&apos;s Share or Print to save this as a PDF.
        </p>
      </main>
    </div>
  );
}

export async function generateMetadata({ params }: { params: { token: string } }) {
  const data = await loadPacket({ token: params.token });
  if (!data) return { title: "Protection proposal" };
  return { title: `${data.quote.vehicle_year} ${data.quote.vehicle_model} — Protection proposal`, description: `XPEL protection proposal from ${data.dealership.name}, installed by White Glove Auto.` };
}
