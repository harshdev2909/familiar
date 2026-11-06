#!/usr/bin/env node
// Seeds the demo Familiar with real history: every day is a real visit through the running server
// (real 0G inference, real ENS + 0G Chain writes). Run it against the deployed app, so portrait URLs
// are public, with the demo label in DEMO_LABELS (free, no daily limit). Costs ~$0.04 per day.
//
//   BASE_URL=https://<app> NAME=ember TARGET_DAY=6 OWNER_PRIVATE_KEY=0x… \
//   AUDIO_FILES=day1.m4a,day2.m4a,… node scripts/seed-demo.mjs
//
// OWNER_PRIVATE_KEY must be the key the name is bonded to (for `ember`, the contracts deployer).
// If the Familiar isn't in the database yet it is adopted from its onchain state via /api/hatch.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const NAME = process.env.NAME ?? "ember";
const TARGET_DAY = Number(process.env.TARGET_DAY ?? 6);
const FILES = (process.env.AUDIO_FILES ?? "").split(",").filter(Boolean);
if (!process.env.OWNER_PRIVATE_KEY || FILES.length === 0) {
  console.error("Set OWNER_PRIVATE_KEY and AUDIO_FILES (comma-separated voice notes, used in order and cycled)");
  process.exit(1);
}
const owner = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = "GET", json, form, cookie } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { ...(json && { "content-type": "application/json" }), ...(cookie && { cookie }) },
    body: form ?? (json ? JSON.stringify(json) : undefined),
  });
  return { status: res.status, body: await res.json(), res };
}

function voice(path, name) {
  const type = /\.(m4a|mp4)$/.test(path) ? "audio/mp4" : path.endsWith(".wav") ? "audio/wav" : "audio/webm";
  const f = new FormData();
  f.set("audio", new File([readFileSync(path)], basename(path), { type }));
  if (name) f.set("name", name);
  return f;
}

async function waitForChain(cookie, id) {
  for (let i = 0; i < 90; i++) {
    const { body } = await api(`/api/visits/${id}`, { cookie });
    if (body.visit?.status === "complete") return body.visit;
    await sleep(4000);
  }
  throw new Error(`visit ${id} did not finalize`);
}

const nonce = await api("/api/auth/nonce", { method: "POST", json: { address: owner.address } });
const signature = await owner.signMessage({ message: nonce.body.message });
const verify = await api("/api/auth/verify", { method: "POST", json: { message: nonce.body.message, signature } });
if (verify.status !== 200) throw new Error(`sign-in failed: ${JSON.stringify(verify.body)}`);
const cookie = verify.res.headers.get("set-cookie").split(";")[0];
console.log(`signed in as ${owner.address}`);

let familiar = (await api(`/api/familiar/${NAME}`)).body.familiar;
let i = 0;
if (!familiar) {
  const r = await api("/api/hatch", { method: "POST", form: voice(FILES[i++ % FILES.length], NAME), cookie });
  if (r.status !== 201) throw new Error(`adopt/hatch failed: ${JSON.stringify(r.body)}`);
  familiar = r.body.familiar;
  console.log(`day ${r.body.visit.day}: ${r.body.visit.mood} — "${r.body.visit.reply}"`);
  await waitForChain(cookie, r.body.visit.id);
}
if (familiar.dormant) {
  const r = await api(`/api/familiar/${NAME}/wake`, { method: "POST", cookie });
  if (r.status !== 200) throw new Error(`wake failed: ${JSON.stringify(r.body)}`);
  familiar = r.body.familiar;
  await waitForChain(cookie, r.body.visit.id);
}
while (familiar.day < TARGET_DAY) {
  const r = await api(`/api/familiar/${NAME}/visit`, { method: "POST", form: voice(FILES[i++ % FILES.length]), cookie });
  if (r.status !== 200) throw new Error(`visit failed (is ${NAME} in DEMO_LABELS?): ${JSON.stringify(r.body)}`);
  familiar = r.body.familiar;
  console.log(`day ${r.body.visit.day}: ${r.body.visit.mood} — "${r.body.visit.reply}"`);
  await waitForChain(cookie, r.body.visit.id);
}
console.log(`✓ ${NAME}.familiar.eth is on day ${familiar.day}`);
