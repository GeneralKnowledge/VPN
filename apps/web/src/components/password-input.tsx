"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Input } from "./ui";

export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={`pr-16 ${className ?? ""}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 rounded-r-md px-3 text-xs font-medium text-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-sea"
      >
        {visible ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}
