/**
 * يتحقق من مفتاح Gemini، ويجرّب بسرعة عدة نماذج Flash (محاولة واحدة لكل منها، 40 ث حداً)،
 * ويعرض أيها يجيب على مفتاحك المجاني ليُوضع اسمه في GEMINI_MODEL.
 *   npm run ai:check
 * لا يطبع المفتاح.
 */
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* لا .env */ }
}

async function main() {
  loadEnv();
  const { env } = await import("../src/server/env");
  const { geminiJson, listGeminiModels } = await import("../src/server/ai/gemini");
  if (!env.GEMINI_API_KEY) { console.log("✗ GEMINI_API_KEY غير معرّف في .env"); process.exitCode = 1; return; }
  const models = (await listGeminiModels()).map((m) => m.name);
  console.log(`✓ المفتاح يعمل (${models.length} نموذجاً متاحاً). أجرّب نماذج Flash النصية…`);
  // نماذج نصية/رؤية عامة فقط (لا صوت ولا توليد صور)
  const flash = models.filter((n) => /flash/i.test(n) && !/tts|image|omni/i.test(n));
  const order = [env.GEMINI_MODEL, ...flash.filter((n) => n !== env.GEMINI_MODEL)];
  const working: string[] = [];
  for (const m of order) {
    const t0 = Date.now();
    try {
      const r = await geminiJson<{ answer: string }>({ model: m, attempts: 1, timeoutMs: 40_000, prompt: "أجب بكلمة واحدة: ما عاصمة العراق؟", schema: { type: "OBJECT", properties: { answer: { type: "STRING" } }, required: ["answer"] } });
      working.push(m);
      console.log(`  ✓ ${m} — «${r.answer}» (${((Date.now() - t0) / 1000).toFixed(1)} ث)`);
    } catch (e) {
      const msg = (e as Error).name === "TimeoutError" ? "لم يجب خلال 40 ث" : (e as Error).message.replace(/\s+/g, " ").slice(0, 110);
      console.log(`  ✗ ${m} — ${msg}`);
    }
  }
  if (working.length === 0) { console.log("\nلا نموذج يجيب الآن (غالباً حدود المستوى المجاني). أعد المحاولة بعد دقائق."); process.exitCode = 1; return; }
  if (working.includes(env.GEMINI_MODEL)) console.log(`\n✓ النموذج المضبوط ${env.GEMINI_MODEL} يعمل. لا تغيير مطلوب.`);
  else console.log(`\n→ النموذج المضبوط (${env.GEMINI_MODEL}) لا يجيب. أضف إلى .env السطر:\nGEMINI_MODEL=${working[0]}`);
}

main().catch((e) => { console.error(`✗ ${(e as Error).message}`); process.exit(1); });
