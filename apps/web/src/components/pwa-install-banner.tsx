"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { INSTALL_DISMISS_KEY, isIosSafari, isStandaloneDisplay } from "@/lib/pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Lightweight Add to Home Screen prompt — Chromium via beforeinstallprompt,
 * iOS Safari via Share → Add to Home Screen tip.
 */
export function PwaInstallBanner({ surface = "marketing" }: { surface?: "marketing" | "dashboard" }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosTip, setShowIosTip] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneDisplay()) return;
    try {
      if (localStorage.getItem(INSTALL_DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    if (isIosSafari()) {
      setShowIosTip(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    setDeferred(null);
    setShowIosTip(false);
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      setVisible(false);
    }
  }

  const copy =
    surface === "dashboard"
      ? "Install Northstar for faster server switching — opens like a VPN app from your home screen."
      : "Install Northstar on your phone for a home-screen VPN-style app experience.";

  return (
    <div
      role="region"
      aria-label="Install app"
      className="border-b border-border bg-surface-2 px-4 py-3 sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          {showIosTip && !deferred ? `${copy} On iPhone: tap Share, then Add to Home Screen.` : copy}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {deferred ? (
            <Button type="button" size="sm" onClick={() => void install()}>
              Install
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
