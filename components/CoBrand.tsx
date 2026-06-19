"use client";

// Co-brand lockup: Land Rover badge (left) · divider · White Glove Auto (right).
// Used in the app header (compact) and the login screen (large).

export default function CoBrand({
  size = "header",
}: {
  size?: "header" | "login";
}) {
  const lrHeight = size === "login" ? 56 : 30;
  const wgaHeight = size === "login" ? 30 : 16;
  const gap = size === "login" ? 28 : 16;

  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/landrover.png"
        alt="Land Rover"
        style={{ height: lrHeight, width: "auto", display: "block" }}
      />
      <div
        style={{
          width: 1,
          height: lrHeight * 0.7,
          background: "var(--stroke)",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/wga-white.png"
        alt="White Glove Auto"
        style={{ height: wgaHeight, width: "auto", display: "block" }}
      />
    </div>
  );
}
