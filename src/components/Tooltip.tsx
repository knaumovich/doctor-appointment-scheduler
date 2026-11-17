import React from "react";

export function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 6,
        background: "#111",
        color: "white",
        padding: "8px 10px",
        borderRadius: 10,
        width: 220,
        zIndex: 999,
        boxShadow: "0 10px 24px rgba(0,0,0,0.25)"
      }}
    >
      {children}
    </div>
  );
}
