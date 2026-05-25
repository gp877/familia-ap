export default function Loading() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: "var(--card2)",
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
      <style>
        {`@keyframes ap-loading-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(400%); }
        }`}
      </style>
    </div>
  );
}
