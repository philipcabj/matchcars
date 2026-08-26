// portal/src/lib/api-client.ts
// Parseo robusto de respuestas de /api/*. Sin esto, si el servidor devuelve
// HTML en vez de JSON (una página de error del dev server, un timeout, un
// proxy, etc.), `res.json()` explota con "Unexpected token '<'..." — un error
// ilegible que no dice nada de lo que realmente pasó. Acá se detecta ese caso
// y se muestra un mensaje entendible en su lugar.
"use client";

// Lleva el status HTTP además del mensaje — sin esto, dashboard/layout.tsx no
// podía distinguir "tu sesión venció" (401, requireUid) de "tu cuenta no
// tiene acceso al portal" (403, resolveMembership) y mostraba el texto crudo
// del servidor ("Token inválido o expirado") como si fuera un problema de
// la cuenta, en vez de algo tan simple como volver a iniciar sesión.
export class ApiClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiClientError(
        `El servidor devolvió una respuesta inesperada (status ${res.status}). Probá recargar la página; si sigue, puede ser un problema del servidor de desarrollo (reiniciá "npm run dev").`,
        res.status
      );
    }
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new ApiClientError(message || `Error ${res.status}`, res.status);
  }
  return data as T;
}
