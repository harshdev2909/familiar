// Deterministic, non-secret defaults for every test. Integration globalSetup overrides RPCs/keys.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123456789";
process.env.MEMORY_MASTER_KEY ??= "0x" + "11".repeat(32);
process.env.AGENT_PRIVATE_KEY ??= "0x" + "22".repeat(32);
process.env.DATABASE_URL = "pglite:memory";
process.env.APP_URL ??= "http://localhost:3000";
process.env.ZG_API_KEY ??= "sk-test";
process.env.UNISWAP_API_KEY ??= "uni-test";
