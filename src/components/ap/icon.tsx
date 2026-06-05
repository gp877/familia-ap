type IconName =
  | "menu"
  | "chev"
  | "chevD"
  | "plus"
  | "mic"
  | "photo"
  | "stop"
  | "chart"
  | "fork"
  | "home"
  | "mask"
  | "bag"
  | "file"
  | "weight"
  | "star"
  | "plane"
  | "cal"
  | "cake"
  | "heart"
  | "spark"
  | "search"
  | "bank"
  | "bell"
  | "cutlery";

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
  className?: string;
};

export function Icon({
  name,
  size = 18,
  color,
  stroke = 1.7,
  className,
}: Props) {
  const c = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths[name](c)}
    </svg>
  );
}

const paths: Record<IconName, (c: string) => React.ReactNode> = {
  menu: () => (
    <>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </>
  ),
  chev: () => <polyline points="9,18 15,12 9,6" />,
  chevD: () => <polyline points="6,9 12,15 18,9" />,
  plus: () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  mic: () => (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0014 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </>
  ),
  photo: () => (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M3 17l5-4 4 3 4-4 5 4" />
    </>
  ),
  stop: (c) => <rect x="6" y="6" width="12" height="12" rx="2" fill={c} stroke="none" />,
  chart: (c) => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 019 9h-9z" fill={c} stroke="none" opacity="0.4" />
    </>
  ),
  fork: () => (
    <>
      <path d="M7 3v8a3 3 0 003 3v7" />
      <path d="M11 3v8M14 3a3 3 0 013 3v3a3 3 0 01-3 3v9" />
    </>
  ),
  home: () => (
    <path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V11z" />
  ),
  mask: (c) => (
    <>
      <path d="M3 7v6c0 4 4 8 9 8s9-4 9-8V7" />
      <circle cx="9" cy="11" r="1.2" fill={c} stroke="none" />
      <circle cx="15" cy="11" r="1.2" fill={c} stroke="none" />
    </>
  ),
  bag: () => (
    <>
      <path d="M5 8h14l-1 12a2 2 0 01-2 2H8a2 2 0 01-2-2L5 8z" />
      <path d="M9 8V6a3 3 0 016 0v2" />
    </>
  ),
  file: () => (
    <>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
      <path d="M14 3v6h6" />
    </>
  ),
  weight: () => (
    <>
      <circle cx="12" cy="13" r="6" />
      <path d="M9 7h6l-1 1H10z" />
    </>
  ),
  star: () => (
    <path d="M12 3l2.5 5.5 6 .5-4.5 4 1.5 6L12 16l-5.5 3 1.5-6L3.5 9l6-.5z" />
  ),
  plane: () => (
    <path d="M2 13l8-2 1.5-7 2 .5L12 11l7-1.5 1 1.5-6.5 4 1 7-2 .5-3-6L3 14z" />
  ),
  cal: () => (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  cake: () => (
    <>
      <path d="M5 11v9h14v-9" />
      <path d="M3 20h18" />
      <path d="M8 11V8m4 3V7m4 4V8" />
    </>
  ),
  heart: () => (
    <path d="M12 21s-7-5-7-11a4 4 0 017-2.6A4 4 0 0119 10c0 6-7 11-7 11z" />
  ),
  spark: (c) => (
    <path
      d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7z"
      fill={c}
      stroke="none"
    />
  ),
  search: () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </>
  ),
  bank: () => (
    <>
      <polygon points="3,9 12,4 21,9" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="5" y1="9" x2="5" y2="18" />
      <line x1="9" y1="9" x2="9" y2="18" />
      <line x1="15" y1="9" x2="15" y2="18" />
      <line x1="19" y1="9" x2="19" y2="18" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </>
  ),
  bell: () => (
    <>
      <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 004 0" />
    </>
  ),
  // Garfo (esquerda) + faca (direita) — ícone do Cardápio.
  cutlery: () => (
    <>
      {/* Garfo: 3 dentes que se juntam num cabo central */}
      <path d="M7 3v5M10 3v5M13 3v5" />
      <path d="M7 8h6" />
      <path d="M10 8v13" />
      {/* Faca: lâmina curva no topo, cabo reto descendo */}
      <path d="M19 3v18" />
      <path d="M19 3c-3 4-3 8 0 11" />
    </>
  ),
};

export type { IconName };
