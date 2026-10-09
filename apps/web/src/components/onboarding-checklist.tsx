import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button, Card } from "./ui";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
};

export function OnboardingChecklist({
  steps,
  title = "Get set up",
  description = "Finish these steps in your account — no app install from us required.",
}: {
  steps: OnboardingStep[];
  title?: string;
  description?: string;
}) {
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  if (allDone) return null;

  const next = steps.find((s) => !s.done);

  return (
    <Card className="border-sea/30 bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          {doneCount} of {steps.length} complete
        </p>
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3",
              step.done ? "border-border bg-surface-2/60" : "border-sea/25 bg-sea/5",
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.done ? "bg-success/20 text-success" : "bg-sea text-white",
                )}
                aria-hidden
              >
                {step.done ? "✓" : index + 1}
              </span>
              <div className="min-w-0">
                <p className={cn("font-medium", step.done && "text-muted line-through")}>{step.title}</p>
                <p className="text-sm text-muted">{step.description}</p>
              </div>
            </div>
            {!step.done ? (
              <Link href={step.href}>
                <Button size="sm" variant={step.id === next?.id ? "primary" : "secondary"}>
                  {step.cta}
                </Button>
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
