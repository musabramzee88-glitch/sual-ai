import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { dirOf } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/server";
import { headers } from "next/headers";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "سُؤال AI — امتحانات المدرس العراقي", template: "%s · سُؤال AI" },
  description: "منصة لإنشاء امتحانات مدرسية احترافية من المناهج العراقية باستخدام الذكاء الاصطناعي.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f5ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1820" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // قراءة الترويسة تجعل كل الصفحات ديناميكية فيحمل كل سكربت رمز nonce هذا الطلب (الصفحات المولّدة مسبقاً لا رمز فيها فتُحجب)
  await headers();
  return (
    <html lang={locale} dir={dirOf(locale)} className={plex.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
