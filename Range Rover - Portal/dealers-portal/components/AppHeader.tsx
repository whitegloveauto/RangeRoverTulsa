"use client";

import { useRouter } from "next/navigation";

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
      <div className="brand">
        <span>RANGE ROVER</span>
        <span className="dot" />
        <span className="secondary">WHITE GLOVE AUTO</span>
      </div>
      <div className="session">
        <span className="pill">{dealershipName.toUpperCase()}</span>
        <button className="signout" onClick={signOut}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
