import { cn } from "@/lib/utils";

type Props = {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizes = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
} as const;

export function BrandMark({ size = "md", className }: Props) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-xl bg-gradient-brand font-bold text-white shadow-sm",
        sizes[size],
        className
      )}
    >
      <span className="leading-none tracking-tight">AP</span>
      <span
        aria-hidden
        className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20"
      />
    </div>
  );
}
