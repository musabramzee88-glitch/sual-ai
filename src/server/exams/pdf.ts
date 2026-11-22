import "server-only";
import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
import { env } from "../env";

/**
 * HTML → PDF بمتصفح Chromium محلي (لا خدمة خارجية): خطوط النظام العربية وتشكيلها كما في الطباعة تماماً.
 * متصفح واحد مشترك يُفتح عند أول طلب، وتصدير واحد في كل مرة (ذاكرة محدودة). الصفحة بلا شبكة ولا سكربتات.
 */
let browser: Promise<Browser> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export class PdfUnavailable extends Error {}

/** مواضع Edge/Chrome/Chromium الشائعة (ويندوز ثم ماك ثم لينكس) إن وُجدت فعلاً على القرص */
function installedBrowsers(): string[] {
  const e = process.env;
  const win = [
    `${e["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${e.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${e.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${e["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    `${e.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  const other = [
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/microsoft-edge", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ];
  return [...win, ...other].filter((p) => !p.includes("undefined") && existsSync(p));
}

async function launch(): Promise<Browser> {
  const args = ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"];
  const tried: string[] = [];
  const attempt = async (label: string, opts: Parameters<typeof chromium.launch>[0]) => {
    try {
      return await chromium.launch({ ...opts, args });
    } catch (e) {
      tried.push(`${label}: ${(e as Error).message.split("\n")[0]}`);
      return null;
    }
  };
  // مسار صريح من .env يتقدّم؛ إن كان خاطئاً يُقال ذلك صراحة بدل خطأ عام
  if (env.CHROMIUM_PATH) {
    if (!existsSync(env.CHROMIUM_PATH)) throw new PdfUnavailable(`CHROMIUM_PATH points to a missing file: ${env.CHROMIUM_PATH}`);
    const b = await attempt("CHROMIUM_PATH", { executablePath: env.CHROMIUM_PATH });
    if (b) return b;
  }
  for (const exe of installedBrowsers()) {
    const b = await attempt(exe, { executablePath: exe });
    if (b) return b;
  }
  for (const channel of ["msedge", "chrome"] as const) {
    const b = await attempt(channel, { channel });
    if (b) return b;
  }
  const b = await attempt("playwright", {}); // متصفح Playwright إن كان مثبّتاً
  if (b) return b;
  console.error(`[pdf] could not start a browser. Tried:\n  ${tried.join("\n  ")}`);
  throw new PdfUnavailable(`no usable Chromium/Edge/Chrome (${tried.length} attempts); set CHROMIUM_PATH`);
}

async function getBrowser() {
  if (browser) {
    const b = await browser.catch(() => null);
    if (b?.isConnected()) return b;
  }
  browser = launch();
  browser.catch(() => (browser = null));
  return browser;
}

export type PdfOptions = { pageNumbers: boolean; lang: "ar" | "en" };

export async function htmlToPdf(html: string, opts: PdfOptions): Promise<Buffer> {
  const run = async () => {
    const b = await getBrowser();
    const ctx = await b.newContext({ javaScriptEnabled: false, offline: true });
    try {
      const page = await ctx.newPage();
      await page.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
      await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
      await page.evaluate("document.fonts && document.fonts.ready").catch(() => {});
      const footer = opts.pageNumbers
        ? `<div style="width:100%;font-size:9pt;text-align:center;font-family:Arial,sans-serif;color:#333">${opts.lang === "ar" ? "صفحة" : "Page"} <span class="pageNumber"></span> / <span class="totalPages"></span></div>`
        : "<div></div>";
      return await page.pdf({
        preferCSSPageSize: true, printBackground: true,
        displayHeaderFooter: opts.pageNumbers, headerTemplate: "<div></div>", footerTemplate: footer,
      });
    } finally {
      await ctx.close().catch(() => {});
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
