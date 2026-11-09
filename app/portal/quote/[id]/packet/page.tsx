import { redirect } from "next/navigation";

// The separate customer packet was folded into the quote itself — one document for everyone.
export default function PacketPage({ params }: { params: { id: string } }) {
  redirect(`/portal/quote/${params.id}`);
}
