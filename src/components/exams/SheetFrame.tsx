"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/** عرض الورقة بالبكسل (96dpi) */
const WIDTH = { A4: { PORTRAIT: 794, LANDSCAPE: 1123 }, A3: { PORTRAIT: 1123, LANDSCAPE: 1587 } } as const;
const HEIGHT = { A4: { PORTRAIT: 1123, LANDSCAPE: 794 }, A3: { PORTRAIT: 1587, LANDSCAPE: 1123 } } as const;

export type SheetFrameHandle = { print: () => void };

/**
 * معاينة ورقة الامتحان بعرضها الحقيقي مصغّرة لتلائم الحاوية (لا قص ولا التفاف مختلف عن الطباعة).
 * الإطار معزول (بلا سكربتات)؛ allow-same-origin لقياس الارتفاع والطباعة منه.
 */
export const SheetFrame = forwardRef<SheetFrameHandle, { html: string; title: string; pageSize?: "A4" | "A3"; orientation?: "PORTRAIT" | "LANDSCAPE"; maxHeight?: number }>(
  function SheetFrame({ html, title, pageSize = "A4", orientation = "PORTRAIT", maxHeight }, ref) {
    const box = useRef<HTMLDivElement>(null);
    const frame = useRef<HTMLIFrameElement>(null);
    const w = WIDTH[pageSize][orientation];
    const [scale, setScale] = useState(1);
    const [height, setHeight] = useState<number>(HEIGHT[pageSize][orientation]);
    useImperativeHandle(ref, () => ({ print: () => frame.current?.contentWindow?.print() }), []);
    useEffect(() => {
      const el = box.current;
      if (!el) return;
      const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / w)));
      ro.observe(el);
      return () => ro.disconnect();
    }, [w]);
    const measure = () => {
      const h = frame.current?.contentDocument?.documentElement.scrollHeight;
      if (h) setHeight(Math.max(HEIGHT[pageSize][orientation], h + 4));
    };
    return (
      <div ref={box} dir="ltr" className="w-full overflow-hidden" style={{ height: (maxHeight ? Math.min(maxHeight, height) : height) * scale }}>
        <iframe
          ref={frame} title={title} srcDoc={html} sandbox="allow-same-origin allow-modals" onLoad={measure}
          className="mx-auto block bg-white shadow"
          style={{ width: w, height, transform: `scale(${scale})`, transformOrigin: "top left", direction: "ltr" }}
        />
      </div>
    );
  },
);
