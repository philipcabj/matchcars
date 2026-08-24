// portal/src/app/global-error.tsx
// Reemplaza el layout entero si algo revienta en cualquier punto del árbol
// (antes no había ningún manejo de errores en el portal, ni siquiera una
// pantalla de "algo salió mal") — y lo manda a Sentry.
"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 700 }}>Algo salió mal</h1>
        <p style={{ fontSize: "14px", color: "#666", maxWidth: "420px" }}>
          Ya nos enteramos del error. Probá de nuevo — si sigue pasando, contactanos.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: "8px",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 600,
            background: "#111",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
