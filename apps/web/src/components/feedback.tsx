"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, Input, Label } from "./ui";

type ToastTone = "info" | "success" | "danger";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, the user must type this exact text before the confirm button is enabled. */
  requireText?: string;
}

interface PromptOptions {
  title: string;
  description?: ReactNode;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
  maxLength?: number;
}

type DialogRequest =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

interface FeedbackApi {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, tone, message }].slice(-4));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), tone === "danger" ? 8000 : 5000);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ kind: "confirm", options, resolve })),
    [],
  );
  const prompt = useCallback(
    (options: PromptOptions) => new Promise<string | null>((resolve) => setRequest({ kind: "prompt", options, resolve })),
    [],
  );

  const api = useMemo(() => ({ toast, confirm, prompt }), [toast, confirm, prompt]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <DialogHost request={request} onClose={() => setRequest(null)} />
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "danger" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg",
              t.tone === "info" && "border-border bg-surface text-foreground",
              t.tone === "success" && "border-success/40 bg-surface text-foreground",
              t.tone === "danger" && "border-danger/40 bg-surface text-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                t.tone === "info" && "bg-sea",
                t.tone === "success" && "bg-success",
                t.tone === "danger" && "bg-danger",
              )}
            />
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="text-muted hover:text-foreground"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

function DialogHost({ request, onClose }: { request: DialogRequest | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [value, setValue] = useState("");
  const settled = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (request) {
      settled.current = false;
      setValue(request.kind === "prompt" ? (request.options.defaultValue ?? "") : "");
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [request]);

  function finish(result: boolean | string | null) {
    if (!request || settled.current) return;
    settled.current = true;
    if (request.kind === "confirm") request.resolve(result === true);
    else request.resolve(typeof result === "string" ? result : null);
    onClose();
  }

  const cancel = () => finish(request?.kind === "confirm" ? false : null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!request) return;
    if (request.kind === "confirm") {
      if (request.options.requireText && value.trim() !== request.options.requireText) return;
      finish(true);
    } else {
      const trimmed = value.trim();
      if (trimmed) finish(trimmed);
    }
  }

  const confirmBlocked =
    request?.kind === "confirm"
      ? Boolean(request.options.requireText) && value.trim() !== request.options.requireText
      : !value.trim();
  const inputId = `${titleId}-input`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) cancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50"
    >
      {request ? (
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <h2 id={titleId} className="font-display text-xl">
            {request.options.title}
          </h2>
          {request.options.description ? <div className="text-sm text-muted">{request.options.description}</div> : null}
          {request.kind === "prompt" ? (
            <div>
              <Label htmlFor={inputId}>{request.options.label}</Label>
              <Input
                id={inputId}
                autoFocus
                value={value}
                maxLength={request.options.maxLength ?? 80}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          ) : request.options.requireText ? (
            <div>
              <Label htmlFor={inputId}>
                Type <span className="font-mono">{request.options.requireText}</span> to confirm
              </Label>
              <Input
                id={inputId}
                autoFocus
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={cancel}>
              {(request.kind === "confirm" && request.options.cancelLabel) || "Cancel"}
            </Button>
            <Button
              type="submit"
              variant={request.kind === "confirm" && request.options.destructive ? "danger" : "primary"}
              disabled={confirmBlocked}
              autoFocus={request.kind === "confirm" && !request.options.requireText}
            >
              {request.options.confirmLabel ?? (request.kind === "confirm" ? "Confirm" : "Save")}
            </Button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
