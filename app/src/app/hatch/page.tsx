import type { Metadata } from "next";
import { HatchFlow } from "./HatchFlow";

export const metadata: Metadata = { title: "Hatch your Familiar" };

export default function HatchPage() {
  return <HatchFlow />;
}
