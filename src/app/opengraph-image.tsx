import { ImageResponse } from "next/og";

/** The card shown when a link to the site is shared (Facebook, Messenger, ...). */
export const alt = "Grænse Pris – find den billigste grænsebutik";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SHOPS = ["Fleggaard", "Calle", "Poetzsch", "Scandinavian Park", "BorderShop"];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, color: "#34d399", fontWeight: 600 }}>Grænse Pris</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>Find den billigste</div>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>grænsebutik</div>
          <div style={{ marginTop: 28, fontSize: 34, color: "#a1a1aa" }}>
            Sammenlign din indkøbsliste – sodavand, øl, vin, slik og spiritus.
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {SHOPS.map((s) => (
            <div
              key={s}
              style={{ display: "flex", padding: "10px 22px", borderRadius: 999, border: "2px solid #3f3f46", fontSize: 28, color: "#d4d4d8" }}
            >
              {s}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
