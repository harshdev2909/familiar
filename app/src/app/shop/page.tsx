import type { Metadata } from "next";
import { ShopScreen } from "./ShopScreen";

export const metadata: Metadata = { title: "Shop" };

export default function ShopPage() {
  return <ShopScreen />;
}
