/** Server start-up hooks. The Node-only work lives in instrumentation-node.ts so the Edge build never sees it. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { start } = await import("./instrumentation-node");
    await start();
  }
}
