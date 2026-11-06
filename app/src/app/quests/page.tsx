import type { Metadata } from "next";
import { QuestsScreen } from "./QuestsScreen";

export const metadata: Metadata = { title: "Quests" };

export default function QuestsPage() {
  return <QuestsScreen />;
}
