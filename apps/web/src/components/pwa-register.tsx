"use client";

import { useEffect } from "react";

/** Registers the installability service worker and keeps theme-color in sync. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore registration failures in unsupported contexts */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const sync = () => {
      const dark = document.documentElement.classList.contains("dark");
      meta.setAttribute("content", dark ? "#08161d" : "#0B1F2A");
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return null;
}
