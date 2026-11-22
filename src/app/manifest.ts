import type { MetadataRoute } from "next";

/** تثبيت التطبيق على الهاتف (أيقونة على الشاشة الرئيسية وفتح بملء الشاشة). لا يعمل دون اتصال، ولا يخزّن بيانات. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "سُؤال AI",
    short_name: "سُؤال",
    description: "منصة امتحانات للمدرسين العراقيين",
    start_url: "/exams",
    scope: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#f8f5ee",
    theme_color: "#0b6e6a",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
