// portal/src/lib/api-client.ts
// Parseo robusto de respuestas de /api/*. Sin esto, si el servidor devuelve
// HTML en vez de JSON (una página de error del dev server, un timeout, un
// proxy, etc.), `res.json()` explota con "Unexpected token '<'..." — un error
// ilegible que no dice nada de lo que realmente pasó. Acá se detecta ese caso
// y se muestra un mensaje entendible en su lugar.
"use client";

export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `El servidor devolvió una respuesta inesperada (status ${res.status}). Probá recargar la página; si sigue, puede ser un problema del servidor de desarrollo (reiniciá "npm run dev").`
      );
    }
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new Error(message || `Error ${res.status}`);
  }
  return data as T;
}
