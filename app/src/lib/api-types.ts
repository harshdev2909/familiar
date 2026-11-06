/**
 * Response types for the Familiar API, for the frontend. Type-only re-exports: importing this file
 * from a Client Component pulls in no server code.
 */
export type { FamiliarView, VisitView, ReceiptView } from "@/server/familiar/views";
export type { FeedQuoteView, FeedBuild, WalletCall } from "@/server/feed/service";
export type { LiveEns } from "@/server/chain/ens";
export type { ErrorCode } from "@/server/errors";

import type { FamiliarView, VisitView } from "@/server/familiar/views";
import type { ErrorCode } from "@/server/errors";

export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown; requestId?: string };
}

export interface SessionInfo {
  address: `0x${string}`;
  method: "wallet" | "iai";
}

export interface VisitResult {
  familiar: FamiliarView;
  visit: VisitView;
  memory: { root: `0x${string}`; onZeroGStorage: boolean };
}

export interface HatchResult extends VisitResult {
  hatchTx: `0x${string}` | null;
}

export interface FeedConfirmResult {
  status: "pending" | "confirmed";
  txHash: `0x${string}`;
  credited?: { label: string; visits: number; amountW0g: string; logIndex: number }[];
  feedCredits?: number;
  basescan?: string;
}

export interface CreditsResult {
  method: "wallet" | "iai";
  iai: null | { credit: string; deposit: string; total: string; pending: string; currency: string; refreshAt: string };
  feedCredits: number;
  refreshAt?: string;
}

export interface AgentOverreachResult {
  resolver: `0x${string}`;
  agent: `0x${string}`;
  attempts: { call: string; reverted: boolean; error?: string }[];
}
