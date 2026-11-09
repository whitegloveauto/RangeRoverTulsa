"use client";

import { useEffect, useState } from "react";
import CoBrand from "@/components/CoBrand";
import ResetForm from "@/components/ResetForm";

export default function WelcomePage() {
  const [tenant, setTenant] = useState<any>(null);
  useEffect(() => {
    fetch("/api/tenant").then((r) => (r.ok ? r.json() : null)).then(setTenant).catch(() => {});
  }, []);
  return (
    <div className="frame">
      <main>
        <div className="login-stage">
          <div style={{ marginBottom: 32 }}>
            <CoBrand size="login" logoUrl={tenant?.brand?.logo_url} brandName={tenant?.brand?.name} />
          </div>
          <ResetForm api="/api/auth/reset" signInHref="/" welcome />
        </div>
      </main>
    </div>
  );
}
