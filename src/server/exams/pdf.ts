import "server-only";
import { chromium, type Browser } from "playwright-core";
import { env } from "../env";

/**
 * HTML → PDF بمتصفح Chromium محلي (لا خدمة خارجية): خطوط النظام العربية وتشكيلها كما في الطباعة تماماً.
 * متصفح واحد مشترك يُفتح عند أول طلب، وتصدير واحد في كل مرة (ذاكرة محدودة). الصفحة بلا شبكة ولا سكربتات.
 */
let browser: Promise<Browser> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export class PdfUnavailable extends Error {}

async function launch(): Promise<Browser> {
  const args = ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"];
  if (env.CHROMIUM_PATH) return chromium.launch({ executablePath: env.CHROMIUM_PATH, args });
  let last: unknown;
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, args });
    } catch (e) {
      last = e;
    }
  }
  try {
    return await chromium.launch({ args }); // متصفح Playwright إن كان مثبّتاً
  } catch {
    throw new PdfUnavailable(`no Chromium found (${(last as Error)?.message?.split("\n")[0] ?? ""}); set CHROMIUM_PATH`);
  }
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
