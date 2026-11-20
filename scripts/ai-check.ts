/**
 * يتحقق من مفتاح Gemini ويعرض النماذج المتاحة له، ثم يجرّب طلباً صغيراً بالنموذج المضبوط (GEMINI_MODEL).
 *   npm run ai:check
 * لا يطبع المفتاح.
 */
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
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
  const models = await listGeminiModels();
  const flash = models.filter((m) => /flash/i.test(m.name));
  console.log(`✓ المفتاح يعمل. نماذج Flash المتاحة (${flash.length}):`);
  for (const m of flash) console.log(`   ${m.name}`);
  const r = await geminiJson<{ answer: string }>({ prompt: "أجب بكلمة واحدة: ما عاصمة العراق؟", schema: { type: "OBJECT", properties: { answer: { type: "STRING" } }, required: ["answer"] } });
  console.log(`✓ النموذج ${env.GEMINI_MODEL} يجيب: ${r.answer}`);
}

main().catch((e) => { console.error(`✗ ${(e as Error).message}`); process.exit(1); });
