import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  eyebrow?: string;
  className?: string;
};

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
