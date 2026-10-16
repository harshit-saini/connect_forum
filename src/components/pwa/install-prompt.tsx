"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "connect-install-dismissed";
const DISMISS_DAYS = 14;

function readDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false; // storage can be blocked: just show the prompt
  }
}

function snapshot(): "installed" | "ios" | "other" {
  if (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) return "installed";
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && safari ? "ios" : "other";
}

const subscribe = () => () => {};

/**
 * Install banner. Android/Chrome uses `beforeinstallprompt`; iOS Safari has no such event, so it gets
 * "Add to Home Screen" instructions. Hidden once installed, and after a dismissal for two weeks.
 */
export function InstallPrompt() {
  const platform = useSyncExternalStore(subscribe, snapshot, () => "other" as const);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true); // hidden until we have read storage on the client

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage, which doesn't exist during SSR
    setDismissed(readDismissed());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  if (dismissed || platform === "installed") return null;
  const canPrompt = deferred !== null;
  if (!canPrompt && platform !== "ios") return null;

  return (
    <aside aria-label="Install the app" className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Install Connect</p>
        {canPrompt ? (
          <p className="text-muted">Add it to your home screen for quick access.</p>
        ) : (
          <p className="text-muted">
            Tap the <span className="font-medium text-foreground">Share</span> button <span aria-hidden>⎋</span>, then <span className="font-medium text-foreground">Add to Home Screen</span>.
          </p>
        )}
      </div>
      {canPrompt && (
        <Button
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice.catch(() => undefined);
            setDeferred(null);
          }}
        >
          Install
        </Button>
      )}
      <button type="button" aria-label="Dismiss install prompt" className="grid size-11 shrink-0 place-items-center rounded-lg text-lg text-muted hover:bg-accent" onClick={dismiss}>×</button>
    </aside>
  );
}
