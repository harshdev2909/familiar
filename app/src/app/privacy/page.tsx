import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

const POINTS = [
  ["Your voice", "Voice notes are transcribed inside a secure enclave and discarded when the visit ends. We never store audio or transcripts."],
  ["Its memory", "Your Familiar keeps a short summary of who you are (no quotes), encrypted with a key unique to it. Only the encrypted form is stored."],
  ["Portraits and replies", "Visible to you. Other people see only the portrait gallery on your Familiar's page."],
  ["Payments", "Feeding happens in your own wallet on Base. We verify the payment onchain; we never hold your funds or keys."],
  ["Forgetting", "Forget your Familiar any time from its page: memory, portraits, replies, voice and receipts are deleted."],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-3 text-muted-foreground">Familiar hears everything and keeps almost nothing.</p>
      <dl className="mt-10 grid gap-6">
        {POINTS.map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-border bg-card p-5">
            <dt className="font-medium">{t}</dt>
            <dd className="mt-1 leading-relaxed text-muted-foreground">{d}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
