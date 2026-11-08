"use client";

import WgaTheme from "@/components/WgaTheme";
import ResetForm from "@/components/ResetForm";

export default function WgaResetPage() {
  return (
    <div className="frame">
      <WgaTheme />
      <main>
        <div className="login-stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wga-white.png" alt="White Glove Auto" style={{ height: 34, width: "auto", marginBottom: 36 }} />
          <div className="login-eyebrow">DEALER PROGRAM · WHITE GLOVE AUTO</div>
          <ResetForm api="/api/wga/auth/reset" signInHref="/wga" />
        </div>
      </main>
    </div>
  );
}
