"use client";

import { useState } from "react";
import Link from "next/link";
import { CANT_CONNECT_CHECKLIST } from "@/lib/setup-guides";
import { SupportForm } from "./support-form";

export function SupportWithChecklist() {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const allDone = CANT_CONNECT_CHECKLIST.every((_, i) => checked[i]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="font-display text-xl">Can&apos;t connect?</h2>
        <p className="mt-1 text-sm text-muted">
          Most issues are fixed by the checklist below. Start from{" "}
          <Link href="/dashboard/get-connected" className="text-sea underline">
            Get connected
          </Link>{" "}
          if you have not imported a config yet.
        </p>
        <ul className="mt-4 space-y-3">
          {CANT_CONNECT_CHECKLIST.map((item, i) => (
            <li key={item} className="flex gap-3 text-sm">
              <input
                id={`check-${i}`}
                type="checkbox"
                className="mt-1"
                checked={Boolean(checked[i])}
                onChange={(e) => setChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
              />
              <label htmlFor={`check-${i}`} className="text-muted">
                {item}
              </label>
            </li>
          ))}
        </ul>
        {!showForm ? (
          <button
            type="button"
            className="mt-4 text-sm text-sea underline disabled:opacity-40"
            disabled={!allDone}
            onClick={() => setShowForm(true)}
          >
            {allDone ? "Still need help — open a ticket" : "Complete the checklist to contact support"}
          </button>
        ) : null}
      </div>
      {showForm ? <SupportForm /> : null}
    </div>
  );
}
