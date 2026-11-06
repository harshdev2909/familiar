import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The egg mark on Linen, for home screens. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAF8F3" }}>
        <div style={{ width: 96, height: 116, borderRadius: "50% 50% 46% 46% / 58% 58% 42% 42%", border: "7px solid #1A1413", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 30, height: 30, borderRadius: 99, background: "#953E32", marginTop: 22 }} />
        </div>
      </div>
    ),
    size,
  );
}
