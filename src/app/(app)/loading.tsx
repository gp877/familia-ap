/**
 * Esqueleto + barrinha de progresso no topo enquanto a nova rota resolve.
 *
 * Antes: só uma barrinha de 2px — a tela ANTIGA permanecia visível,
 * dando sensação de "nada está acontecendo" mesmo a navegação tendo
 * iniciado. Próxima rota só aparecia inteira no fim.
 *
 * Agora: skeleton que substitui o conteúdo da página, feedback visual
 * imediato. Pulse shimmer pra indicar que algo está chegando.
 */
export default function Loading() {
  return (
    <>
      <ProgressBar />
      <div
        className="mx-auto flex w-full flex-col max-w-[480px] lg:max-w-4xl"
        style={{ minHeight: "100%", padding: "8px 20px 24px" }}
      >
        <Bar w={120} h={12} mt={16} />
        <Bar w={240} h={32} mt={10} />
        <Bar w={180} h={14} mt={6} />

        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "1fr 1fr",
            marginTop: 20,
          }}
        >
          <CardSkel />
          <CardSkel />
        </div>

        <Bar w={120} h={12} mt={24} />
        {Array.from({ length: 4 }, (_, i) => (
          <RowSkel key={i} />
        ))}
      </div>
      <style>{`
        @keyframes ap-loading-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(400%); }
        }
        @keyframes ap-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </>
  );
}

function ProgressBar() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: "transparent",
        zIndex: 100,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: "30%",
          background: "var(--accent)",
          animation: "ap-loading-slide 1s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function Bar({ w, h, mt = 0 }: { w: number | string; h: number; mt?: number }) {
  return (
    <div
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: h,
        marginTop: mt,
        borderRadius: 6,
        background:
          "linear-gradient(90deg, var(--card2) 0%, var(--card) 50%, var(--card2) 100%)",
        backgroundSize: "200% 100%",
        animation: "ap-shimmer 1.6s ease-in-out infinite",
      }}
    />
  );
}

function CardSkel() {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: "var(--card)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <Bar w={80} h={10} />
      <Bar w="60%" h={20} />
    </div>
  );
}

function RowSkel() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: "0.5px solid var(--line-d)",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "var(--card2)",
          flexShrink: 0,
        }}
      />
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}
      >
        <Bar w="55%" h={12} />
        <Bar w="35%" h={10} />
      </div>
      <Bar w={70} h={16} />
    </div>
  );
}
