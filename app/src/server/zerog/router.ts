import "server-only";
import { env } from "../env";
import { AppError } from "../errors";
import { log } from "../log";

/**
 * 0G Private Computer (Router) client — OpenAI-compatible, https://router-api.0g.ai/v1.
 * Every call yields a Receipt with the router's request id (x_0g_trace.request_id, else the UUID
 * X-Request-ID header), the serving provider, the billed cost and — for TEE providers — whether the
 * router verified the provider's TEE signature.
 */
export type Step = "transcribe" | "think" | "draw" | "speak" | "evolve";

export interface Receipt {
  step: Step;
  model: string;
  requestId: string;
  latencyMs: number;
  /** Billed cost in `costCurrency` units: micro-USD ("usd") or neuron ("0g", 1e18 = 1 0G). */
  cost: string | null;
  costCurrency: string | null;
  provider: string | null;
  /** true/false when the router checked a TEE signature; null when the provider is not a TEE. */
  teeVerified: boolean | null;
}

interface Trace {
  request_id?: string;
  provider?: string;
  provider_identity?: string;
  billing?: { total_cost?: string; currency?: string };
  tee_verified?: boolean;
}

export interface RouterOptions {
  /** `sk-` API key (team) or the user's 0G session JWT (iAI sign-in). */
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Correlates calls with our visit id via X-Client-Request-Id. */
  clientRequestId?: string;
}

export type VideoPoll =
  | { status: "pending" }
  | { status: "failed"; error: string }
  /** `billedRequestId`/`cost`: async jobs are billed under their own id once complete. */
  | { status: "done"; bytes: Uint8Array; billedRequestId: string | null; cost: string | null; costCurrency: string | null };

export class ZeroGRouter {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly o: RouterOptions) {
    this.baseUrl = (o.baseUrl ?? env().ZG_ROUTER_URL).replace(/\/$/, "");
    this.fetchImpl = o.fetch ?? fetch;
  }

  /** Team-key router (pays from the project's 0G balance). */
  static team(clientRequestId?: string, fetchImpl?: typeof fetch) {
    const key = env().ZG_API_KEY;
    if (!key) throw new AppError("NOT_CONFIGURED", "ZG_API_KEY is not set");
    return new ZeroGRouter({ token: key, clientRequestId, fetch: fetchImpl });
  }

  async transcribe(audio: Blob, filename: string): Promise<{ text: string; receipt: Receipt }> {
    const model = env().ZG_MODEL_STT;
    const form = new FormData();
    form.set("model", model);
    form.set("file", audio, filename);
    form.set("response_format", "json");
    const q = env().ZG_VERIFY_TEE ? "?verify_tee=true" : "";
    const { body, receipt } = await this.callJson<{ text?: string }>("transcribe", model, `/audio/transcriptions${q}`, { body: form });
    const text = (body.text ?? "").trim();
    if (!text) throw new AppError("BAD_REQUEST", "We couldn't hear anything in that voice note — try again a little closer to the mic");
    return { text, receipt };
  }

  async chatJson(messages: { role: "system" | "user"; content: string }[]): Promise<{ content: string; receipt: Receipt }> {
    const model = env().ZG_MODEL_CHAT;
    const { body, receipt } = await this.callJson<{ choices?: { message?: { content?: string } }[] }>("think", model, "/chat/completions", {
      json: {
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 800,
        // Thinking is on by default for 0GM-1.0; a 60-second ritual doesn't need it.
        chat_template_kwargs: { enable_thinking: false },
        ...(env().ZG_VERIFY_TEE && { verify_tee: true }),
      },
    });
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new AppError("UPSTREAM_ZEROG", "0GM-1.0 returned an empty response", { requestId: receipt.requestId });
    return { content, receipt };
  }

  /**
   * Seedream (sync). Returns JPEG/PNG bytes. `reference` (a data: URL or public URL of the previous
   * portrait — or several, e.g. every Familiar on a night walk) keeps the creatures visually consistent.
   */
  async image(prompt: string, reference?: string | string[]): Promise<{ bytes: Uint8Array; receipt: Receipt }> {
    const model = env().ZG_MODEL_IMAGE;
    const refs = (Array.isArray(reference) ? reference : reference ? [reference] : []).filter(Boolean);
    const { body, receipt } = await this.callJson<{ data?: { b64_json?: string }[] }>("draw", model, "/images/generations", {
      json: {
        model,
        prompt,
        n: 1,
        size: env().ZG_IMAGE_SIZE,
        response_format: "b64_json",
        ...(refs.length > 0 && { image: refs }),
        ...(env().ZG_VERIFY_TEE && { verify_tee: true }),
      },
      timeoutMs: 120_000,
    });
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new AppError("UPSTREAM_ZEROG", "Seedream returned no image", { requestId: receipt.requestId });
    return { bytes: Uint8Array.from(Buffer.from(b64, "base64")), receipt };
  }

  /** Text-to-speech for the Familiar's reply line. Returns MP3 bytes. */
  async speech(text: string): Promise<{ bytes: Uint8Array; receipt: Receipt }> {
    const model = env().ZG_MODEL_TTS;
    const started = performance.now();
    const res = await this.post("/audio/speech", { json: { model, input: text.slice(0, 600), voice: env().ZG_TTS_VOICE, response_format: "mp3" }, timeoutMs: 60_000 });
    if (!res.ok) throw await this.toError(res, "speak");
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { bytes, receipt: this.receipt("speak", model, res, {}, started) };
  }

  /** Seedance image-to-video job. `firstFrame` is a data: URL or public URL. Returns the job id. */
  async submitVideo(prompt: string, firstFrame: string): Promise<{ jobId: string; receipt: Receipt }> {
    const model = env().ZG_MODEL_VIDEO;
    const { body, receipt } = await this.callJson<{ id?: string }>("evolve", model, "/videos", {
      json: {
        model,
        prompt,
        seconds: 5,
        metadata: {
          resolution: env().ZG_VIDEO_RESOLUTION,
          ratio: "1:1",
          generate_audio: false,
          content: [{ type: "image_url", image_url: { url: firstFrame }, role: "first_frame" }],
        },
      },
    });
    if (!body.id) throw new AppError("UPSTREAM_ZEROG", "Seedance returned no job id");
    return { jobId: body.id, receipt };
  }

  /** Poll a video job by status; download the mp4 once it has completed. */
  async pollVideo(jobId: string): Promise<VideoPoll> {
    const id = encodeURIComponent(jobId);
    const res = await this.raw(`/videos/${id}`, { method: "GET" }, 30_000);
    if (!res.ok) throw await this.toError(res, "evolve");
    const job = (await res.json()) as { status?: string; error?: { message?: string } | string | null; x_0g_trace?: Trace };
    const status = (job.status ?? "").toLowerCase();
    if (["failed", "error", "cancelled", "canceled", "expired"].includes(status)) {
      const err = typeof job.error === "string" ? job.error : (job.error?.message ?? status);
      return { status: "failed", error: err };
    }
    if (!["completed", "succeeded", "success", "done"].includes(status)) return { status: "pending" };
    const content = await this.raw(`/videos/${id}/content`, { method: "GET" }, 120_000);
    if (content.status === 409) return { status: "pending" };
    if (content.status === 424) return { status: "failed", error: "provider failed to generate the clip" };
    if (!content.ok) throw await this.toError(content, "evolve");
    const t = job.x_0g_trace ?? {};
    return {
      status: "done",
      bytes: new Uint8Array(await content.arrayBuffer()),
      billedRequestId: t.request_id ?? null,
      cost: t.billing?.total_cost ?? null,
      costCurrency: t.billing?.currency ?? null,
    };
  }

  /** Account balance for the token's account (the user's, for iAI sessions). */
  async balance(): Promise<{ credit: string; deposit: string; total: string; pending: string; currency: string }> {
    const res = await this.raw("/account/balance", { method: "GET" }, 15_000);
    if (!res.ok) throw await this.toError(res, "balance");
    const b = (await res.json()) as Record<string, string>;
    return {
      credit: b.credit_balance ?? "0",
      deposit: b.deposit_balance ?? "0",
      total: b.total_balance ?? b.balance ?? "0",
      pending: b.pending_charge ?? "0",
      currency: b.currency ?? "0g",
    };
  }

  // ------------------------------------------------------------------------------------------

  private async callJson<T>(
    step: Step,
    model: string,
    path: string,
    req: { json?: unknown; body?: FormData; timeoutMs?: number },
  ): Promise<{ body: T & { x_0g_trace?: Trace; id?: string }; receipt: Receipt }> {
    const started = performance.now();
    const res = await this.post(path, req, step);
    if (!res.ok) throw await this.toError(res, step);
    const body = (await res.json()) as T & { x_0g_trace?: Trace; id?: string };
    return { body, receipt: this.receipt(step, model, res, body.x_0g_trace ?? {}, started) };
  }

  /** POST with one retry when no provider was available (the router already fails over itself). */
  private async post(path: string, req: { json?: unknown; body?: FormData; timeoutMs?: number }, step: string = path): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await this.raw(
          path,
          { method: "POST", body: req.body ?? JSON.stringify(req.json), headers: req.body ? {} : { "content-type": "application/json" } },
          req.timeoutMs ?? 90_000,
        );
      } catch (e) {
        if (attempt < 2) continue;
        throw new AppError("UPSTREAM_ZEROG", `0G Router unreachable during ${step}`, undefined, { cause: e });
      }
      if (attempt < 2 && res.status === 503) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return res;
    }
  }

  private receipt(step: Step, model: string, res: Response, trace: Trace, started: number): Receipt {
    // The router sends two X-Request-Id headers (gateway hex id, then the billing UUID); keep the UUID.
    const headerId = res.headers.get("x-request-id")?.split(",").map((s) => s.trim()).pop();
    const requestId = trace.request_id ?? headerId;
    if (!requestId) throw new AppError("UPSTREAM_ZEROG", `0G Router returned no request id for ${step}`);
    const r: Receipt = {
      step,
      model,
      requestId,
      latencyMs: Math.round(performance.now() - started),
      cost: trace.billing?.total_cost ?? null,
      costCurrency: trace.billing?.currency ?? null,
      provider: trace.provider ?? res.headers.get("x-provider"),
      teeVerified: trace.tee_verified ?? null,
    };
    log.info("zerog", { step, model, requestId, ms: r.latencyMs, cost: r.cost, currency: r.costCurrency, tee: r.teeVerified });
    return r;
  }

  private raw(path: string, init: RequestInit, timeoutMs: number) {
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.o.token}`,
        accept: "application/json",
        ...(this.o.clientRequestId && { "x-client-request-id": this.o.clientRequestId }),
        ...(init.headers as Record<string, string>),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  private async toError(res: Response, step: string): Promise<AppError> {
    let body: { error?: { message?: string; code?: string; type?: string }; request_id?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON */
    }
    const code = body.error?.code ?? body.error?.type ?? `http_${res.status}`;
    const details = { step, status: res.status, code, requestId: body.request_id ?? res.headers.get("x-request-id") };
    if (res.status === 402) return new AppError("PAYMENT_REQUIRED", "Your 0G credits are used up until the 00:00 UTC refresh", details);
    if (res.status === 401) return new AppError("UNAUTHENTICATED", "0G session expired — sign in with 0G again", details);
    if (res.status === 429) return new AppError("RATE_LIMITED", "0G is busy — try again in a few seconds", { ...details, retryAfter: res.headers.get("retry-after") });
    if (res.status === 400) return new AppError("BAD_REQUEST", `0G rejected the ${step} request: ${body.error?.message ?? code}`, details);
    return new AppError("UPSTREAM_ZEROG", `0G ${step} failed: ${body.error?.message ?? code}`, details);
  }
}

/** data: URL for an image, used as a Seedream/Seedance reference without needing public hosting. */
export const toDataUrl = (bytes: Uint8Array, contentType: string) => `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;

/** Exchange a Privy access token (0G's Privy app) for a 0G Router session JWT. */
export async function exchangePrivyToken(privyToken: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${env().ZG_ROUTER_URL.replace(/\/$/, "")}/auth/privy`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ token: privyToken }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new AppError("UNAUTHENTICATED", "0G rejected that sign-in; try again");
  if (!res.ok) throw new AppError("UPSTREAM_ZEROG", `0G sign-in failed (HTTP ${res.status})`);
  const body = (await res.json()) as { token?: string; wallet_address?: string };
  if (!body.token || !body.wallet_address) throw new AppError("UPSTREAM_ZEROG", "0G sign-in returned no session");
  return { zgToken: body.token, walletAddress: body.wallet_address };
}
