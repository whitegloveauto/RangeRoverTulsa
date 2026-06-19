"use client";

import { useRouter } from "next/navigation";
import CoBrand from "./CoBrand";

export default function AppHeader({
  dealershipName,
}: {
  dealershipName: string;
}) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <header className="app">
      <CoBrand size="header" />
      <div className="session">
        <span className="pill">{dealershipName.toUpperCase()}</span>
        <button className="signout" onClick={signOut}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
