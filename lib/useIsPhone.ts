"use client";

import { useEffect, useState } from "react";

// true at phone widths (matches the 720px breakpoint in globals.css). Lets pages render
// cards OR a table instead of both (the hidden one would still fetch and render).
export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}
