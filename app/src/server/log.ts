/** Structured JSON logs (one line per event) — readable in Vercel logs and greppable locally. */
type Fields = Record<string, unknown>;

const SECRET_KEYS = /key|secret|token|authorization|signature|password|private/i;

function redact(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== "object") return typeof v === "bigint" ? v.toString() : v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : redact(x, depth + 1)]),
  );
}

function emit(level: "debug" | "info" | "warn" | "error", event: string, fields?: Fields) {
  if (process.env.NODE_ENV === "test" && level !== "error" && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({ level, event, t: new Date().toISOString(), ...(redact(fields ?? {}) as Fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (e: string, f?: Fields) => emit("debug", e, f),
  info: (e: string, f?: Fields) => emit("info", e, f),
  warn: (e: string, f?: Fields) => emit("warn", e, f),
  error: (e: string, f?: Fields) => emit("error", e, f),
};
