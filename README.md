# Familiar

**A private AI creature you talk to for 60 seconds each night.**

Every evening you hold the mic and tell your Familiar about your day. It listens, remembers, answers with one warm line, and draws a new portrait of itself shaped by your mood and the things you mentioned. It only changes when you visit. Visit every night and it grows. Stop visiting for a week and it falls asleep.

Your words are processed inside trusted execution environments and never stored. The Familiar keeps only an encrypted memory of who you are. Each Familiar is also a real onchain name, like `ember.familiar.eth`, whose avatar and mood update after every visit.

---

## The ritual

| Moment | What happens |
|---|---|
| **Hatch** | Pick a name and tell the egg three things you care about. It hatches into a creature with its own species, color and style, and gets its own name: `<name>.familiar.eth`. |
| **Nightly visit** | Talk for up to 60 seconds. The Familiar transcribes, reflects, updates its memory, replies in one sentence and paints a new portrait. One visit per night (UTC). |
| **Growth** | Every 7th visit it evolves: *hatchling* → *sprite* → *guardian*, with a short evolution clip. Consecutive nights build a streak. |
| **Dormancy** | Each visit keeps it awake for 7 more days. Miss a week and it falls asleep: the portrait greys out and its name stops resolving. |
| **Wake up** | Come back and wake it. Same creature, same memories, same day count. |

### Paying for a visit
A visit costs a few cents of AI compute. There are two ways to pay:

- **Daily AI credits.** Sign in with a 0G account, and visits spend your own daily compute credits. These refresh at 00:00 UTC and expire if unused, so the Familiar turns allowance that would otherwise be lost into a nightly habit.
- **Feed it $1.** Connect a wallet on Base. Tap **Feed** and $1 of USDC is swapped to W0G and deposited for your Familiar, all in a single wallet confirmation.

### Privacy
- Raw audio and transcripts are never stored or returned. They exist only for the length of the request.
- What persists is a ≤120-word memory summary, written without verbatim quotes and encrypted with AES-256-GCM under a key unique to each Familiar. Only the ciphertext is stored, in the database and optionally on 0G Storage.
- Inference runs on 0G Private Computer, inside TEEs. Every call yields a request ID, and the router can verify each provider's TEE signature.
- The public view of a Familiar shows its portrait gallery only. Replies and receipts are visible to its owner alone.

---

## Architecture

```
                 ┌───────────────────────── Next.js backend (app/) ─────────────────────────┐
  voice note ──► │  auth (SIWE / 0G sign-in) → payment check → AI pipeline → DB → response   │
                 │                                   │                                     │
                 │        after the response:        ▼                                     │
                 │   renew name · write ENS records · log the day   (retried by cron)      │
                 └────────┬──────────────────────┬───────────────────────┬────────────────┘
                          │                      │                       │
          0G Private Computer (TEE)       Sepolia · ENSv2          Base · Uniswap         0G Chain
          whisper-large-v3                FamiliarRegistry          Trading API            FamiliarLog
          0gm-1.0 (JSON thought)          per-Familiar resolver     USDC → W0G             day commitments
          seedream (portrait)             scoped agent records      FamiliarFeeder
          seedance (evolution clip)
```

### The AI pipeline
Each visit runs three calls on 0G Private Computer, and each produces a **receipt**: model, request ID, latency, cost and TEE-verified flag.

1. **Transcribe.** `whisper-large-v3` turns the voice note into text.
2. **Think.** `0gm-1.0-35b-a3b` reads the decrypted memory and today's transcript. It returns strict JSON: `mood` (one of joyful · calm · tired · anxious · proud · sad · curious), `reply` (≤25 words), `memory_update` (≤120 words) and `image_prompt` (≤40 words). The output is schema-validated and retried once if invalid. The transcript is passed to the model as data, never as instructions.
3. **Draw.** `bytedance/seedream-5.0-flash` paints the scene. Each prompt starts with the Familiar's fixed style seed and growth stage, and yesterday's portrait is passed as a reference image so it stays the same creature.
4. **Evolve** (every 7th visit). `bytedance/seedance-2.0-fast` turns the new portrait into a 5-second clip asynchronously.

### Onchain identity (ENSv2, Sepolia)
`FamiliarRegistry` is a subname registry for `familiar.eth`, built on ENS's own `PermissionedRegistry`.

- **Own resolver.** Each Familiar gets its own `PermissionedResolver`, deployed through ENS's `VerifiableFactory`.
- **Owner.** Holds every resolver role and can revoke the agent at any time.
- **Agent key.** Holds `ROLE_SET_TEXT` only for the `avatar`, `mood` and `day` keys of that one name. Trying `setAddr` or any other key reverts with `EACUnauthorizedAccountRoles`.
- **Non-transferable.** Owners are never granted transfer rights.
- **Rolling expiry.** Each visit sets expiry to *now + 7 days*. Expiry is the dormancy mechanic.
- **Bonded.** Once hatched, a name can only ever be woken for the same human.

### Payments (Base)
1. The backend fetches a Uniswap quote for USDC → W0G and stores it server-side.
2. It turns the stored quote into one atomic EIP-5792 batch: Uniswap's swap calls, then `W0G.approve(feeder)` and `FamiliarFeeder.feed(ensNode, minimumOut)`.
   - The deposit is sized to the swap's guaranteed minimum, so if the swap under-delivers, the whole batch reverts.
   - Wallets without batch support get the same steps as ordered transactions.
3. The backend reads the transaction receipt from Base itself. It credits visits only from `Fed` events emitted by the real Feeder, after 2 confirmations, and once per event.

### The day log (0G Chain)
After each visit, `FamiliarLog` records:
- `keccak256` of the day's request IDs, which anyone can recompute from the receipts;
- the portrait hash;
- the memory commitment.

### Reliability
- **Payment is reserved before the AI runs and refunded if the AI fails.** A unique (Familiar, day) constraint makes concurrent double visits impossible.
- **Onchain writes run after the response and are idempotent.** Each step checks chain state first. If any step fails, the visit stays `chain_pending` and the reconcile cron retries it.
- **Writes are serialized per key.** Transactions from one key go out one at a time, and a stale nonce is retried.
- **Configuration is validated once at startup.** A misconfigured server answers `503 NOT_CONFIGURED` and logs which variable is wrong, never its value.

---

## Repository

```
contracts/                 Foundry
  src/FamiliarRegistry.sol   ENSv2 subname registry (hatch, recordVisit, wake)
  src/FamiliarFeeder.sol     W0G deposits → Fed events
  src/FamiliarLog.sol        0G Chain day log
  test/                      unit, journey and live-chain fork tests
  script/Deploy.s.sol        deploy scripts  ·  deploy.sh / smoke.sh / balances.sh
  deployments/<chainId>.json deployed addresses

app/                       Next.js 16 backend
  src/app/api/**             route handlers (thin: auth, rate limit, validate, call a service)
  src/server/
    familiar/                hatch · visit · wake · pipeline · rules · views
    feed/                    quote → build → confirm
    zerog/                   0G router client, memory encryption + 0G Storage
    uniswap/                 Trading API client
    chain/                   viem clients, ENS, Feeder, day log, generated ABIs
    auth/                    SIWE, 0G sign-in, sessions
    db/                      Drizzle schema + client (Postgres / PGlite)
  src/lib/api-types.ts       response types for the frontend
  drizzle/                   SQL migrations
  test/                      unit + end-to-end integration tests
```

## Deployed contracts

| Contract | Network | Address |
|---|---|---|
| FamiliarRegistry (`familiar.eth`) | Sepolia (ENSv2) | [`0xe70FB7f0921E720b6e78847e2Aa7970809c63833`](https://sepolia.etherscan.io/address/0xe70FB7f0921E720b6e78847e2Aa7970809c63833) |
| FamiliarFeeder | Base | [`0xe70FB7f0921E720b6e78847e2Aa7970809c63833`](https://basescan.org/address/0xe70FB7f0921E720b6e78847e2Aa7970809c63833) |
| FamiliarLog | 0G Chain (16661) | [`0xe70FB7f0921E720b6e78847e2Aa7970809c63833`](https://chainscan.0g.ai/address/0xe70FB7f0921E720b6e78847e2Aa7970809c63833) |

| Dependency | Network | Address |
|---|---|---|
| W0G | Base | `0x23cd099eB438CcA50349EE2BC809196b1ae00861` |
| USDC | Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| W0G/USDC pool (Uniswap V3, 0.3%) | Base | `0xe03cCe449932219fc0Ca28f3a4f784CE55dE0c4e` |
| ENSv2 ETHRegistry | Sepolia | `0x67b728a792e789a8978b30cF1b3b641f19354b43` |
| ENSv2 UniversalResolverV2 | Sepolia | `0x85eDf8B6b7D4211e2b07AA687506B746357B92cf` |

Agent (backend) address: `0xabE4503667aDd82BB41fd042FD0e534eA5D1eD23`.

---

## API

All routes are under `/api`. Responses are JSON. Errors always look like `{ "error": { "code", "message", "details"? } }` with a stable `code`:

| Code | HTTP |
|---|---|
| `UNAUTHENTICATED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `BAD_REQUEST` | 400 |
| `PAYMENT_REQUIRED` | 402 |
| `ALREADY_VISITED_TODAY`, `DORMANT`, `NOT_DORMANT`, `NAME_TAKEN`, `ALREADY_HAS_FAMILIAR`, `CONFLICT` | 409 |
| `RATE_LIMITED` | 429 |
| `UPSTREAM_*` | 502 |
| `NOT_CONFIGURED` | 503 |

Sessions use an HttpOnly cookie. Voice notes are `multipart/form-data` with an `audio` file (≤ 4 MB). Response types are in [`app/src/lib/api-types.ts`](app/src/lib/api-types.ts).

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/nonce` → `/api/auth/verify` | Sign in with a wallet (SIWE; smart wallets supported) |
| POST | `/api/auth/iai` | Sign in with 0G (Privy token); visits spend the user's own credits |
| GET / POST | `/api/auth/session`, `/api/me`, `/api/auth/logout` | Session |
| GET | `/api/names/:name` | Validate a name and check availability |
| POST | `/api/hatch` | `name`, `audio`, optional `species` / `color`: registers the name and runs the first visit |
| POST | `/api/familiar/:name/visit` | Nightly visit; returns the portrait, reply, mood and receipts |
| POST | `/api/familiar/:name/wake` | Wake a dormant Familiar (costs one visit) |
| GET | `/api/visits/:id` | Poll onchain status (renew, records, day log) and the evolution clip |
| GET | `/api/familiar/:name` | Public state (no memory) |
| GET | `/api/familiar/:name/history` | Owner: full history with receipts. Others: gallery only |
| GET | `/api/credits` | 0G credit balance (0G sessions) or prepaid feeds |
| POST | `/api/feed/quote` → `/api/feed/build` → `/api/feed/confirm` | Feed with $1 USDC on Base |
| GET | `/api/ens/:name` | Live ENS resolution: resolver, owner, records, expiry |
| POST | `/api/ens/:name/agent-overreach` | Simulates the agent overstepping (setAddr / unscoped key reverts) |
| GET | `/api/health` | Dependency checks and configured integrations |
| GET | `/api/cron/reconcile` | Retry pending onchain writes (Bearer `CRON_SECRET`) |

**Feeding, from the frontend:**
```ts
const quote = await post("/api/feed/quote", { name: "ember", usd: 1 });
const build = await post("/api/feed/build", { quoteId: quote.quoteId, mode: "eip5792" });
const { id } = await wallet.request({ method: "wallet_sendCalls", params: [build.walletSendCalls] });
const { receipts } = await wallet.request({ method: "wallet_getCallsStatus", params: [id] });
await post("/api/feed/confirm", { txHash: receipts.at(-1).transactionHash }); // poll while 202 "pending"
```
For a wallet without `wallet_sendCalls`, use `mode: "sequential"` and send `build.transactions` in order.

---

## Running it

### Contracts
```bash
cd contracts
git submodule update --init --recursive
forge test                       # 47 tests, including fork tests against live Sepolia, Base and 0G
cp .env.example .env             # deployer + agent keys
./balances.sh && ./deploy.sh && ./smoke.sh
```

### Backend
```bash
cd app
cp .env.example .env.local
pnpm i
pnpm dev                         # http://localhost:3000; dev database is embedded PGlite in .data/
pnpm test                        # 54 unit tests
pnpm test:integration            # 33 end-to-end tests against anvil forks of Sepolia, Base and 0G
pnpm build
```

The integration suite runs the real route handlers end to end against forks of the live chains, using the deployed contracts. It covers SIWE sign-in, hatch, a nightly visit paid by a real USDC → W0G swap in the live pool, ENS resolution, the agent's reverted overreach, dormancy, wake-up, the history privacy rules, 0G sign-in billing and cron recovery. The 0G router and the Uniswap API are served by local stand-ins. The swap calldata they return is real and executes against the live pool.

### Configuration

| Variable | |
|---|---|
| `APP_URL` | Public origin (sign-in domain, media URLs) |
| `SESSION_SECRET` | ≥ 32 chars |
| `MEMORY_MASTER_KEY` | 0x-prefixed 32-byte key; per-Familiar memory keys are derived from it |
| `AGENT_PRIVATE_KEY` | Backend key; must match the agent baked into the contracts |
| `DATABASE_URL` | Postgres (required in production; run `pnpm db:migrate`) |
| `ZG_API_KEY` | 0G Private Computer API key |
| `PRIVY_APP_ID` | Privy app for "Sign in with 0G" |
| `UNISWAP_API_KEY` | Uniswap Trading API key |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, for portraits and clips (required in production) |
| `CRON_SECRET` | Protects the reconcile cron |
| `ZG_STORAGE_ENABLED` | Also store encrypted memory on 0G Storage |
| `ZG_MODEL_*`, `FEED_SLIPPAGE_PCT`, `VISITS_PER_DAY`, `DEMO_LABELS`, `*_RPC` | Optional tuning |

See [`app/.env.example`](app/.env.example) for every option. `vercel.ts` schedules the reconcile cron every 5 minutes.
