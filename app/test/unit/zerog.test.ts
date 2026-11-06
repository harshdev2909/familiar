import { describe, expect, it, vi } from "vitest";
import { ZeroGRouter, exchangePrivyToken } from "@/server/zerog/router";

const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
const err = (status: number, code: string) => new Response(JSON.stringify({ error: { code, message: code }, request_id: "rid-err" }), { status });

describe("ZeroGRouter", () => {
  it("captures request id, provider, cost and TEE verification from x_0g_trace", async () => {
    const f = vi.fn(async () =>
      ok(
        { choices: [{ message: { content: "{}" } }], x_0g_trace: { request_id: "req-abc", provider: "0xProv", billing: { total_cost: "12345" }, tee_verified: true } },
        { "x-request-id": "gw-1, req-abc" },
      ),
    );
    const r = new ZeroGRouter({ token: "sk-1", fetch: f as never, clientRequestId: "visit-1" });
    const { receipt } = await r.chatJson([{ role: "user", content: "hi" }]);
    expect(receipt).toMatchObject({ step: "think", model: "0gm-1.0-35b-a3b", requestId: "req-abc", cost: "12345", provider: "0xProv", teeVerified: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://router-api.0g.ai/v1/chat/completions");
    const h = init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer sk-1");
    expect(h["x-client-request-id"]).toBe("visit-1");
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.verify_tee).toBe(true);
  });

  it("falls back to the X-Request-ID header when there is no trace", async () => {
    const f = vi.fn(async () => ok({ text: "hello there" }, { "x-request-id": "hdr-7" }));
    const { text, receipt } = await new ZeroGRouter({ token: "t", fetch: f as never }).transcribe(new Blob(["x"], { type: "audio/webm" }), "a.webm");
    expect(text).toBe("hello there");
    expect(receipt.requestId).toBe("hdr-7");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/audio/transcriptions?verify_tee=true");
    expect((init.body as FormData).get("model")).toBe("whisper-large-v3");
  });

  it("decodes Seedream b64 images and passes a reference image", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const f = vi.fn(async () => ok({ data: [{ b64_json: png.toString("base64") }], x_0g_trace: { request_id: "img-1" } }));
    const { bytes, receipt } = await new ZeroGRouter({ token: "t", fetch: f as never }).image("a fox", "https://x/prev.png");
    expect(Buffer.from(bytes)).toEqual(png);
    expect(receipt.step).toBe("draw");
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ model: "bytedance/seedream-5.0-flash", response_format: "b64_json", n: 1, image: ["https://x/prev.png"] });
  });

  it("maps 402 to PAYMENT_REQUIRED (credits used up) without retrying", async () => {
    const f = vi.fn(async () => err(402, "insufficient_balance"));
    const e = await new ZeroGRouter({ token: "t", fetch: f as never }).chatJson([]).catch((x) => x);
    expect(e.code).toBe("PAYMENT_REQUIRED");
    expect(e.details.requestId).toBe("rid-err");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries once on 503 no_available_provider", async () => {
    const f = vi.fn().mockResolvedValueOnce(err(503, "no_available_provider")).mockResolvedValueOnce(ok({ text: "ok words" }, { "x-request-id": "r2" }));
    const { receipt } = await new ZeroGRouter({ token: "t", fetch: f as never }).transcribe(new Blob(["x"]), "a.webm");
    expect(receipt.requestId).toBe("r2");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty transcription with a friendly message", async () => {
    const f = vi.fn(async () => ok({ text: "  " }, { "x-request-id": "r" }));
    await expect(new ZeroGRouter({ token: "t", fetch: f as never }).transcribe(new Blob(["x"]), "a.webm")).rejects.toThrow(/couldn't hear/);
  });

  it("requires a request id on every successful call", async () => {
    const f = vi.fn(async () => ok({ text: "words" }));
    await expect(new ZeroGRouter({ token: "t", fetch: f as never }).transcribe(new Blob(["x"]), "a.webm")).rejects.toThrow(/request id/);
  });

  it("exchanges a Privy token for a 0G session", async () => {
    const f = vi.fn(async () => ok({ token: "zg-jwt", wallet_address: "0x04b4534A84C25992A958B60e96995269Cd744258" }));
    const r = await exchangePrivyToken("privy-token", f as never);
    expect(r).toEqual({ zgToken: "zg-jwt", walletAddress: "0x04b4534A84C25992A958B60e96995269Cd744258" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://router-api.0g.ai/v1/auth/privy");
    expect(JSON.parse(init.body as string)).toEqual({ token: "privy-token" });
  });
});

describe("ZeroGRouter: speech and video", () => {
  it("speech returns MP3 bytes with the UUID request id from the duplicated header", async () => {
    const mp3 = Buffer.from("ID3fakeaudio");
    const f = vi.fn(async () => new Response(mp3, { status: 200, headers: { "content-type": "audio/mpeg", "x-request-id": "4c02d726dd3e758e, f960ca95-09f1-44b3-a115-f74b9c8a3078" } }));
    const { bytes, receipt } = await new ZeroGRouter({ token: "t", fetch: f as never }).speech("hello");
    expect(Buffer.from(bytes)).toEqual(mp3);
    expect(receipt).toMatchObject({ step: "speak", model: "minimax-speech-2.8-turbo", requestId: "f960ca95-09f1-44b3-a115-f74b9c8a3078", teeVerified: null });
  });

  it("polls video through queued → in_progress → completed and records the billed async id", async () => {
    const r = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    const f = vi
      .fn()
      .mockResolvedValueOnce(r({ status: "queued" }))
      .mockResolvedValueOnce(r({ status: "in_progress", progress: 50 }))
      .mockResolvedValueOnce(r({ status: "completed", x_0g_trace: { request_id: "async-abc", billing: { total_cost: "217280", currency: "usd" } } }))
      .mockResolvedValueOnce(new Response(Buffer.from("mp4bytes"), { status: 200, headers: { "content-type": "video/mp4" } }));
    const router = new ZeroGRouter({ token: "t", fetch: f as never });
    expect(await router.pollVideo("job1")).toEqual({ status: "pending" });
    expect(await router.pollVideo("job1")).toEqual({ status: "pending" });
    const done = await router.pollVideo("job1");
    expect(done).toMatchObject({ status: "done", billedRequestId: "async-abc", cost: "217280", costCurrency: "usd" });
    expect((f.mock.calls[3] as unknown as [string])[0]).toContain("/videos/job1/content");
  });

  it("reports failed jobs", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: "failed", error: { message: "content policy" } }), { status: 200 }));
    expect(await new ZeroGRouter({ token: "t", fetch: f as never }).pollVideo("j")).toEqual({ status: "failed", error: "content policy" });
  });
});
