import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Familiar — a private creature you talk to each night";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  const fox = await readFile(join(process.cwd(), "public/art/fox.jpg"));
  const src = `data:image/jpeg;base64,${fox.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FAF8F3", padding: 72, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 620 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, fontWeight: 600, color: "#1A1413", letterSpacing: -1 }}>
            <div style={{ width: 30, height: 36, borderRadius: "50% 50% 46% 46% / 58% 58% 42% 42%", border: "3px solid #1A1413", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 11, height: 11, borderRadius: 99, background: "#953E32", marginTop: 6 }} />
            </div>
            familiar
          </div>
          <div style={{ fontSize: 68, fontWeight: 600, color: "#1A1413", lineHeight: 1.04, letterSpacing: -2.5 }}>A private creature you talk to each night.</div>
          <div style={{ fontSize: 28, color: "#6E625D" }}>It remembers. It grows. Skip a week and it falls asleep.</div>
        </div>
        <img src={src} width={420} height={420} style={{ borderRadius: 999, border: "16px solid #953E32" }} alt="" />
      </div>
    ),
    size,
  );
}
