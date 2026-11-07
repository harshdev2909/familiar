import type {
  AgentOverreachResult,
  ApiKeyView,
  CareAction,
  CareResult,
  CreatedApiKey,
  DexResult,
  EventView,
  ExploreResult,
  GiftResult,
  SpotResult,
  CreditsResult,
  DiaryResult,
  DiaryView,
  FamiliarView,
  MeetCode,
  MeetResult,
  PushSubscriptionInput,
  TradeView,
  TradesResult,
  WalkView,
  FeedBuild,
  FeedConfirmResult,
  FeedQuoteView,
  HatchResult,
  LiveEns,
  QuestsResult,
  ShopResult,
  Slot,
  SessionInfo,
  VisitResult,
  VisitView,
} from "./api-types";

/** Mirrors the backend's `{ error: { code, message, details } }` envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ status: number; body: T }> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      credentials: "same-origin",
      headers: { ...(json !== undefined && { "content-type": "application/json" }), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "You're offline — check your connection and try again");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) {
    const e = (body as { error?: { code?: string; message?: string; details?: unknown } }).error;
    throw new ApiError(res.status, e?.code ?? "INTERNAL", e?.message ?? "Something went wrong", e?.details);
  }
  return { status: res.status, body: body as T };
}

const get = async <T>(path: string) => (await request<T>(path)).body;
const post = async <T>(path: string, json?: unknown) => (await request<T>(path, { method: "POST", json: json ?? {} })).body;
const del = async <T>(path: string, json?: unknown) => (await request<T>(path, { method: "DELETE", json })).body;
const enc = encodeURIComponent;
const postForm = async <T>(path: string, form: FormData) => (await request<T>(path, { method: "POST", body: form })).body;

export const api = {
  session: () => get<{ session: SessionInfo | null }>("/api/auth/session"),
  config: () => get<{ demo: string | null; zeroG: boolean }>("/api/config"),
  me: () => get<{ session: SessionInfo; familiar: FamiliarView | null }>("/api/me"),
  nonce: (address: string) => post<{ message: string }>("/api/auth/nonce", { address, chainId: 8453 }),
  verify: (message: string, signature: string) => post<{ session: SessionInfo; familiar: FamiliarView | null }>("/api/auth/verify", { message, signature }),
  signInZeroG: (privyToken: string) => post<{ session: SessionInfo; familiar: FamiliarView | null }>("/api/auth/iai", { privyToken }),
  demo: () => post<{ session: SessionInfo; familiar: FamiliarView | null; demo: string }>("/api/auth/demo"),
  logout: () => post<{ ok: true }>("/api/auth/logout"),

  checkName: (name: string) => get<{ label: string; available: boolean }>(`/api/names/${encodeURIComponent(name)}`),
  familiar: (name: string) => get<{ familiar: FamiliarView }>(`/api/familiar/${encodeURIComponent(name)}`),
  history: (name: string, limit = 30) =>
    get<{ owner: true; visits: VisitView[] } | { owner: false; visits: { day: number; date: string; mood: string | null; imageUrl: string | null; videoUrl: string | null }[] }>(
      `/api/familiar/${encodeURIComponent(name)}/history?limit=${limit}`,
    ),
  hatch: (form: FormData) => postForm<HatchResult>("/api/hatch", form),
  visit: (name: string, form: FormData) => postForm<VisitResult>(`/api/familiar/${encodeURIComponent(name)}/visit`, form),
  wake: (name: string) => post<VisitResult>(`/api/familiar/${encodeURIComponent(name)}/wake`),
  pollVisit: (id: string) => get<{ visit: VisitView; familiar: FamiliarView }>(`/api/visits/${id}`),
  forget: async (name: string) =>
    (await request<{ forgotten: string; visits: number }>(`/api/familiar/${encodeURIComponent(name)}`, { method: "DELETE", json: { confirm: name } })).body,
  credits: () => get<CreditsResult>("/api/credits"),

  feedQuote: (name: string, usd = 1) => post<FeedQuoteView>("/api/feed/quote", { name, usd }),
  feedBuild: (quoteId: string, mode: "eip5792" | "sequential") => post<FeedBuild>("/api/feed/build", { quoteId, mode }),
  feedConfirm: async (txHash: string) => (await request<FeedConfirmResult>("/api/feed/confirm", { method: "POST", json: { txHash } })).body,

  shop: () => get<ShopResult>("/api/shop"),
  buy: (itemId: string) => post<{ item: string; sparks: number }>("/api/shop/buy", { itemId }),
  equip: (name: string, slot: Slot, itemId: string | null) => post<{ equipped: Record<string, string> }>(`/api/familiar/${encodeURIComponent(name)}/equip`, { slot, itemId }),
  spin: (name: string) => post<{ sparks: number; item: { id: string; name: string; art: string } | null }>(`/api/familiar/${encodeURIComponent(name)}/spin`),
  quests: () => get<QuestsResult>("/api/quests"),
  claim: (questId: string) => post<{ claimed: string; reward: number; sparks: number }>("/api/quests/claim", { questId }),

  care: (name: string, action: CareAction) => post<CareResult>(`/api/familiar/${encodeURIComponent(name)}/care`, { action }),
  explore: () => get<ExploreResult>("/api/explore"),
  spot: (name: string) => post<SpotResult>(`/api/familiar/${encodeURIComponent(name)}/spot`),
  gift: (name: string) => post<GiftResult>(`/api/familiar/${encodeURIComponent(name)}/gift`),
  dex: () => get<DexResult>("/api/dex"),
  events: () => get<{ events: EventView[] }>("/api/events"),

  keys: () => get<{ keys: ApiKeyView[] }>("/api/keys"),
  createKey: (label: string) => post<CreatedApiKey>("/api/keys", { label }),
  revokeKey: (id: string) => del<{ revoked: string }>(`/api/keys/${encodeURIComponent(id)}`),

  ens: (name: string) => get<{ ens: LiveEns }>(`/api/ens/${encodeURIComponent(name)}`),
  overreach: (name: string) => post<AgentOverreachResult>(`/api/ens/${encodeURIComponent(name)}/agent-overreach`),

  /* Round 4 */
  meetCode: (name: string) => get<MeetCode>(`/api/familiar/${enc(name)}/meet-code`),
  meet: (name: string, code: string) => post<MeetResult>(`/api/familiar/${enc(name)}/meet`, { code }),

  startWalk: () => post<{ walk: WalkView }>("/api/walks"),
  walk: (id: string) => get<{ walk: WalkView }>(`/api/walks/${enc(id)}`),
  joinWalk: (id: string) => post<{ walk: WalkView }>(`/api/walks/${enc(id)}/join`),
  beginWalk: (id: string) => post<{ walk: WalkView }>(`/api/walks/${enc(id)}/start`),
  walks: (name: string) => get<{ walks: WalkView[] }>(`/api/familiar/${enc(name)}/walks`),

  trades: () => get<TradesResult>("/api/trades"),
  proposeTrade: (to: string, give: string, want: string) => post<{ trade: TradeView }>("/api/trades", { to, give, want }),
  acceptTrade: (id: string) => post<{ trade: TradeView }>(`/api/trades/${enc(id)}/accept`),
  declineTrade: (id: string) => post<{ trade: TradeView }>(`/api/trades/${enc(id)}/decline`),
  cancelTrade: (id: string) => post<{ trade: TradeView }>(`/api/trades/${enc(id)}/cancel`),

  diary: (name: string, week?: string) => get<DiaryResult>(`/api/familiar/${enc(name)}/diary${week ? `?week=${enc(week)}` : ""}`),
  writeDiary: (name: string, week?: string) => post<{ diary: DiaryView }>(`/api/familiar/${enc(name)}/diary`, week ? { week } : {}),

  pushKey: () => get<{ key: string | null }>("/api/push/key"),
  pushSubscribe: (sub: PushSubscriptionInput) => post<{ ok: true }>("/api/push/subscribe", sub),
  pushUnsubscribe: (endpoint: string) => del<{ ok: true }>("/api/push/subscribe", { endpoint }),
  pushTest: () => post<{ sent: number }>("/api/push/test"),
};

/** A visit's input: a voice note, or (round 3) typed text, 1–1000 characters. */
export type VisitInput = { audio: { blob: Blob; filename: string } } | { text: string };

/** Put a voice note or typed text on a visit/hatch form. */
export function setVisitInput(form: FormData, input: VisitInput) {
  if ("text" in input) form.set("text", input.text.trim());
  else form.set("audio", new File([input.audio.blob], input.audio.filename, { type: input.audio.blob.type }));
  return form;
}

/** `familiar.care`, when the backend sends it. */
export const careOf = (f: FamiliarView | null | undefined): import("./api-types").CareView | null =>
  (f as (FamiliarView & { care?: import("./api-types").CareView }) | null | undefined)?.care ?? null;

export const isApiError = (e: unknown, code?: string): e is ApiError => e instanceof ApiError && (!code || e.code === code);
