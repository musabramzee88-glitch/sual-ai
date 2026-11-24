/** نقطة البدء: كود خادم Node في instrumentation-node.ts (استيراده هنا مشروط حتى لا يُجمَّع لبيئة edge) */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAlerts } = await import("./instrumentation-node");
    await startAlerts();
  }
}
