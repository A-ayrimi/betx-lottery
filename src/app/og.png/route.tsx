import { ImageResponse } from "next/og";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#060a09",
          color: "#ffffff",
          padding: 64,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 172,
            height: 172,
            borderRadius: 42,
            backgroundColor: "#d9b45b",
            color: "#060a09",
            fontSize: 92,
            fontWeight: 800,
            letterSpacing: -4,
          }}
        >
          B
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 92, fontWeight: 800, letterSpacing: -3 }}>
          BETX
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 30, color: "#c7f27a" }}>
          Transparent draws. One ticket. One chance.
        </div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 24, color: "#8ea39a" }}>
          SPL-USDC on Solana
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
