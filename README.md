# Familiar

**A private AI creature you talk to for 60 seconds each night.**

Every evening you hold the mic and tell your Familiar about your day. It listens, remembers, answers with one warm line (spoken aloud in its own voice), and draws a new portrait of itself shaped by your mood and the things you mentioned. It only changes when you visit. Visit every night and it grows. Stop visiting for a week and it falls asleep.

Your voice note is transcribed inside a trusted execution environment and never stored. The Familiar keeps only an encrypted memory of who you are. Each Familiar is also a real onchain name, like `ember.familiar.eth`, whose avatar and mood update after every visit.

---

## The ritual

| Moment | What happens |
|---|---|
| **Hatch** | Pick a name and tell the egg three things you care about. It hatches into a creature with its own species, color and style, and gets its own name: `<name>.familiar.eth`. |
| **Nightly visit** | Talk for up to 60 seconds. The Familiar transcribes, reflects, updates its memory, replies in one sentence and paints a new portrait. One visit per night (UTC). |
| **Growth** | Every 7th visit it evolves: *hatchling* → *sprite* → *guardian*, with a short evolution clip. Consecutive nights build a streak. |
| **Dormancy** | Each visit keeps it awake for 7 more days. Miss a week and it falls asleep: the portrait greys out and its name stops resolving. |
| **Wake up** | Come back and wake it. Same creature, same memories, same day count. |

Can't talk right now? **Type instead.** A typed note takes the same path as a spoken one, minus the transcription.

### Looking after it
Between visits, the Familiar lives in a little egg-shaped device with an LCD screen, like the handhelds you had as a kid.

| | |
|---|---|
| **Care** | Three meters (Full, Joy, Energy) drift down as hours pass and show as pixel hearts. Press **A · Snack** (5 Sparks, every 2 h), **B · Pet** (free, every 20 min) or **C · Play** (free, every hour). When a meter runs low it tells you: *"I'm hungry!"* |
| **Sparks & levels** | Visits, care, quests and the lantern pay out Sparks and XP. Streaks pay more. Every 25·L·(L−1) XP is a new keeper level. Every grant is a ledger row with a unique reference, so nothing is ever paid twice. |
| **The daily lantern** | One free spin a day for 10–30 Sparks, sometimes an accessory. |
| **Quests & badges** | Daily (talk, spin, spot, gift, care), weekly (three nights in a row) and event quests. Badges for milestones such as a first night, a full week, or evolving. |
| **The bazaar** | Accessories bought with Sparks: diyas, marigold garlands, a festival crown, a paper kandil and more. Whatever it wears goes into that night's portrait prompt, so you see it in the painting. |
| **Explore** | An illustrated map of who's out tonight. Tap a Familiar to **spot** it for your Dex (+Sparks, and a bonus for a new species), send it a **gift** once a day (its keeper gets Sparks), or visit its page. |
| **Dex** | Eight species to find (fox, owl, otter, moth, axolotl, cat, dragonling, bunny), and every Familiar you've met. |
| **Event spotlights** | Real-world events become in-app events with their own quests and bonuses. Diwali (1–10 Nov) brings a festival collection and lights on every screen. ETHGlobal Mumbai doubles visit Sparks. Devcon 8 has its own quest. |
| **Ember's story** | A six-chapter story of how a Familiar grows, told as a trail on the home page and as a storybook at `/story`. |

### From ChatGPT or Claude
Open **ChatGPT & Claude** (`/connect`), make a personal connector link, and add it as a custom connector in ChatGPT (Settings → Apps & Connectors → Developer mode) or Claude (Settings → Connectors → Add custom connector). Then you can just say *"Tell luma about my day: …"*, *"Pet my familiar"* or *"What quests are open?"*. The connector is an MCP server with 13 tools that call the same services as the app. Links are stored hashed, can be revoked at any time, and can't create or revoke other links.

### Paying for a visit
A visit costs a few cents of AI compute. There are two ways to pay:

- **Daily AI credits.** Sign in with a 0G account, and visits spend your own daily compute credits. These refresh at 00:00 UTC and expire if unused, so the Familiar turns allowance that would otherwise be lost into a nightly habit.
- **Feed it $1.** Connect any wallet on Base: every installed browser wallet (MetaMask, Rabby, Phantom, Coinbase, Trust, OKX and others, discovered through EIP-6963), Coinbase Smart Wallet (passkeys, nothing to install), or a mobile wallet over WalletConnect. Tap **Feed** and $1 of USDC is swapped to W0G and deposited for your Familiar, all in a single wallet confirmation.

### Privacy
- Raw audio and transcripts are never stored or returned. They exist only for the length of the request.
- What persists is a ≤120-word memory summary, written without verbatim quotes and encrypted with AES-256-GCM under a key unique to each Familiar. Only the ciphertext is stored, in the database and optionally on 0G Storage.
- All AI runs through 0G Private Computer, and every call yields a request ID and a billed cost.
  - **Transcription** runs on a TEE provider. The router verifies the provider's TEE signature, and every receipt shows `teeVerified: true`.
  - **0GM-1.0** receives the transcript; its receipts carry no TEE flag.
  - **Portrait and voice** providers aren't TEEs. They only ever see the derived scene prompt and the reply line, never the transcript.
- The public view of a Familiar shows its portrait gallery only. Replies, voice and receipts are visible to its owner alone.
- **Forget me** deletes everything held off-chain: the memory, replies, receipts, portraits, voice and clips.

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
Each visit runs four calls on 0G Private Computer, and each produces a **receipt**: model, request ID, latency, cost in USD, and the TEE-verified flag where the provider is a TEE. A typical visit costs about $0.03 and takes 30–45 s, most of it the portrait.

1. **Transcribe.** `whisper-large-v3` turns the voice note into text.
2. **Think.** `0gm-1.0-35b-a3b` reads the decrypted memory and today's transcript. It returns strict JSON: `mood` (one of joyful · calm · tired · anxious · proud · sad · curious), `reply` (≤25 words), `memory_update` (≤120 words) and `image_prompt` (≤40 words). The output is schema-validated and retried once if invalid. The transcript is passed to the model as data, never as instructions.
3. **Draw.** `bytedance/seedream-5.0-flash` paints the scene. Each prompt starts with the Familiar's fixed style seed and growth stage, and yesterday's portrait is passed inline as a reference image so it stays the same creature.
4. **Speak** (alongside the portrait). `minimax-speech-2.8-turbo` voices the reply line. If it fails, the visit still succeeds without audio.
5. **Evolve** (every 7th visit). `bytedance/seedance-2.0-fast` turns the new portrait into a 5-second, 480p clip asynchronously (about $0.22). The receipt is updated with the job's billed request ID once it completes.

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
- **Nonces are safe across server instances.** Each nonce is assigned under a Postgres advisory lock, using the last nonce handed out, so parallel instances never reuse one. Any remaining race is retried.
- **Nothing is spent on a request that can't complete.** Configuration such as media storage is checked before any onchain write or paid inference.
- **Free hatches are capped.** Hatches the team pays for are limited per UTC day (`FREE_HATCHES_PER_DAY`), and `/api/health` and the cron warn when the agent wallet runs low on gas.
- **Configuration is validated once at startup.** A misconfigured server answers `503 NOT_CONFIGURED` and logs which variable is wrong, never its value.

---

## Design

- **Palette: Ivory Linen.** Warm paper neutrals with a single terracotta ember. Every pair passes WCAG AA in light and dark mode.
- **Type:** DM Sans for interface text and DM Mono for numbers, IDs and countdowns.
- **Illustration:** soft watercolor creatures on ivory paper, generated on 0G Seedream with the same fixed style seed the live portraits use.
- **Ember, the mascot:** a fox who carries the product's moments (hungry, listening, thinking, fed, waking, keeping your secrets). Each pose was generated with the original portrait as a reference, so it stays the same character.
- **Hand-drawn marks:** our own vector set, separate from the AI art. An icon family (bowl, moon, heart, mic, quill, brush, lantern, seal, ember), night doodles (stars, crescent, sleep marks), a starry orbit around the device, and dividers.
- **The device:** each Familiar lives in a small 3D ivory handheld (three.js), like a modern Tamagotchi. Its screen shows tonight's portrait.
  - It breathes when idle, swells with your voice and wobbles while thinking.
  - It dims when asleep and shakes when hatching.
  - It falls back to a still portrait without WebGL or with reduced motion.
- **Care meters:** Fed, Awake and Bond, all derived from real state.
- **Cute layer:** pastel accents (blush, mint, butter, lilac, sky, peach) over the ivory base, sticker-style cards, and small squish/wobble/bounce/float-heart motions. All of it switches off with reduced motion.
- **Handmade set:** a second hand-drawn SVG family drawn for the story and the map: a Mumbai skyline with its gateway arch, an auto-rickshaw, a paper kite, clouds, a paw-print trail, a gift box, map pins, speech bubbles, a moon mobile, a tulsi plant, washi tape and bunting. Plus pixel hearts for the LCD and an original star charm for spotting.
- **Festival art:** diyas, rangoli, toran garlands and fairy lights are drawn by hand. The bazaar, lantern and fireworks scenes are generated.

Pages:
- `/` is the landing page: hero, festival banner, event spotlights, Ember's story and how it works.
- `/hatch` covers species, name and the first note (spoken or typed).
- `/f/:name` is the Familiar's home: tonight's visit, the care device, level and Sparks, receipts, feeding, its ENS name and its memories.
- `/explore`, `/dex`, `/quests` and `/shop` are the game.
- `/connect` covers ChatGPT & Claude; `/story` is the storybook.

## Repository

```
contracts/                 Foundry
  src/FamiliarRegistry.sol   ENSv2 subname registry (hatch, recordVisit, wake)
  src/FamiliarFeeder.sol     W0G deposits → Fed events
  src/FamiliarLog.sol        0G Chain day log
  test/                      unit, journey and live-chain fork tests
  script/Deploy.s.sol        deploy scripts  ·  deploy.sh / smoke.sh / balances.sh
  deployments/<chainId>.json deployed addresses

app/                       Next.js 16 app
  src/app/                   pages: landing, /hatch, /f/[name], /explore, /dex, /quests, /shop, /connect, /story (+ api/)
  src/components/            device (three.js), care panel, explore, events, story, hand-drawn art, UI primitives
  public/art/  public/logos/ illustrations and event logos
  src/server/
    familiar/                hatch · visit · wake · pipeline · rules · views
    game/                    Sparks ledger, levels, shop, quests, care, explore/dex/gifts, events
    mcp/                     ChatGPT / Claude connector (MCP tools)
    feed/                    quote → build → confirm
    zerog/                   0G router client, memory encryption + 0G Storage
    uniswap/                 Trading API client
    chain/                   viem clients, ENS, Feeder, day log, generated ABIs
    auth/                    SIWE, 0G sign-in, sessions, personal connector keys
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
| `INSUFFICIENT_SPARKS` | 402 |
| `ALREADY_VISITED_TODAY`, `DORMANT`, `NOT_DORMANT`, `NAME_TAKEN`, `ALREADY_HAS_FAMILIAR`, `ALREADY_SPOTTED`, `ALREADY_GIFTED`, `CONFLICT` | 409 |
| `RATE_LIMITED`, `COOLDOWN` | 429 |
| `UPSTREAM_*` | 502 |
| `NOT_CONFIGURED` | 503 |

Sessions use an HttpOnly cookie, or `Authorization: Bearer fam_…` for a personal connector key. Notes are `multipart/form-data` with either an `audio` file (≤ 4 MB) or a `text` field (≤ 1,000 characters). Response types are in [`app/src/lib/api-types.ts`](app/src/lib/api-types.ts).

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/nonce` → `/api/auth/verify` | Sign in with a wallet (SIWE; smart wallets supported) |
| POST | `/api/auth/iai` | Sign in with 0G (Privy token); visits spend the user's own credits |
| GET / POST | `/api/auth/session`, `/api/me`, `/api/auth/logout` | Session |
| GET | `/api/names/:name` | Validate a name and check availability |
| POST | `/api/hatch` | `name`, `audio`, optional `species` / `color`: registers the name and runs the first visit |
| POST | `/api/familiar/:name/visit` | Nightly visit; returns the portrait, reply, spoken reply (`replyAudioUrl`), mood and receipts |
| POST | `/api/familiar/:name/wake` | Wake a dormant Familiar (costs one visit) |
| DELETE | `/api/familiar/:name` | Forget me: `{ "confirm": "<name>" }` deletes all off-chain data (owner only) |
| POST | `/api/auth/demo` | Sign in to the demo Familiar (when `DEMO_LOGIN_ENABLED`) |
| GET | `/api/visits/:id` | Poll onchain status (renew, records, day log) and the evolution clip |
| GET | `/api/familiar/:name` | Public state (no memory) |
| GET | `/api/familiar/:name/history` | Owner: full history with receipts. Others: gallery only |
| GET | `/api/credits` | 0G credit balance (0G sessions) or prepaid feeds |
| POST | `/api/feed/quote` → `/api/feed/build` → `/api/feed/confirm` | Feed with $1 USDC on Base |
| GET | `/api/ens/:name` | Live ENS resolution: resolver, owner, records, expiry |
| POST | `/api/ens/:name/agent-overreach` | Simulates the agent overstepping (setAddr / unscoped key reverts) |
| POST | `/api/familiar/:name/care` | `{ action: "pet" \| "snack" \| "play" }`: care, with cooldowns |
| POST | `/api/familiar/:name/spin` | The daily lantern |
| POST | `/api/familiar/:name/equip` | `{ slot, itemId \| null }`: wear or remove an accessory |
| GET / POST | `/api/shop`, `/api/shop/buy` | The bazaar; buy with Sparks |
| GET / POST | `/api/quests`, `/api/quests/claim` | Quests, progress and badges; claim a reward |
| GET | `/api/explore` | Who's out tonight (public; spotted/gifted flags when signed in) |
| POST | `/api/familiar/:name/spot`, `/api/familiar/:name/gift` | Spot for your Dex; send a daily gift |
| GET | `/api/dex` | Species collection and every Familiar you've spotted |
| GET | `/api/events` | Event spotlights: live, upcoming, recently ended |
| GET / POST / DELETE | `/api/keys`, `/api/keys/:id` | Personal connector links (cookie session only) |
| POST / GET / DELETE | `/api/mcp`, `/api/mcp/:key` | MCP server (Streamable HTTP) for ChatGPT and Claude |
| GET | `/api/config` | Public client configuration |
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
pnpm test                        # 86 unit tests
pnpm test:integration            # 57 end-to-end tests against anvil forks of Sepolia, Base and 0G
pnpm build
```

**Scripts (live: they spend real money):**
- `scripts/live-e2e.mjs`: runs the full loop against a running server using the real services. It signs in, hatches with a voice note, waits for the onchain writes, feeds $1 through the Uniswap API on Base, then visits using that feed.
- `scripts/seed-demo.mjs`: brings a demo Familiar up to a target day with real visits. Run it against the deployed app, with the name in `DEMO_LABELS`.

The integration suite runs the real route handlers end to end against forks of the live chains, using the deployed contracts. It covers:
- SIWE sign-in and hatch;
- a nightly visit paid by a real USDC → W0G swap in the live pool, plus a refused spoofed payment;
- ENS resolution and the agent's reverted overreach;
- dormancy and wake-up;
- the history privacy rules, and forget then re-adopt;
- demo sign-in and the free-hatch cap;
- concurrent agent nonces;
- 0G sign-in billing;
- cron recovery;
- the game: Sparks, the shop, wearing items, the lantern, quests, care cooldowns, spotting, gifts and the Dex, and connector keys driving the MCP server. The 0G router and the Uniswap API are served by local stand-ins. The swap calldata they return is real and executes against the live pool.

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
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, for portraits, voice and clips (required in production unless `ALLOW_LOCAL_MEDIA`) |
| `CRON_SECRET` | Protects the reconcile cron |
| `ZG_STORAGE_ENABLED` | Also store encrypted memory on 0G Storage |
| `DEMO_LABELS`, `DEMO_LOGIN_ENABLED` | Demo Familiars are free and unlimited, with an optional signature-less demo sign-in |
| `FREE_HATCHES_PER_DAY`, `AGENT_MIN_BALANCE_*` | Abuse cap and gas alerts |
| `ZG_MODEL_*`, `ZG_TTS_*`, `ZG_VIDEO_RESOLUTION`, `FEED_SLIPPAGE_PCT`, `VISITS_PER_DAY`, `*_RPC` | Optional tuning |

| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Reown project id; turns on WalletConnect for mobile wallets |
| `FESTIVAL`, `NEXT_PUBLIC_FESTIVAL`, `EVENTS_TODAY` | Force the festival on or off, or pin the event clock (tests) |
| `BACKEND_URL` | Frontend only: proxy `/api/*` to a separate API server |
| `MEDIA_DIR`, `INTERNAL_CRON` | API server only: media on a mounted volume, and the reconcile job in-process |

See [`app/.env.example`](app/.env.example) for every option.

### Deploying
The app is one Next.js codebase, deployed twice:

- **API on Railway.** Runs `next start` as a long-lived server, with a volume mounted for portraits (`MEDIA_DIR`) and the reconcile job running in-process every 5 minutes (`INTERNAL_CRON=true`). `APP_URL` is the public frontend URL.
- **Frontend on Vercel.** With `BACKEND_URL` set to the Railway URL, every `/api/*` request is rewritten to the API server. The browser only ever talks to one origin, so session cookies, SIWE domains and connector links all keep working.

```bash
# API
railway up --service familiar-api
# Frontend
vercel deploy --prod
```
