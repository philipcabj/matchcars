import { APPLE_URL, PLAY_URL } from "@/lib/app-links";

// Compartido entre la ficha del auto y el perfil de agencia — mismo patrón
// de contacto: WhatsApp directo si el vendedor lo cargó, si no mail. El botón
// "Ver/Hacer una oferta en la app" que había acá se sacó por redundante: ya
// están los botones de tienda debajo con el mismo destino, y duplicaba texto
// sin agregar nada. Lo que sí queda siempre visible es la aclaración de que
// ofertar, mensajear en privado y guardar favoritos son exclusivos de la app
// — no depende de si hay WhatsApp/email cargado.
export function SellerContactButtons({
  whatsapp,
  email,
  waMessage,
}: {
  whatsapp: string;
  email: string;
  waMessage: string;
}) {
  const waDigits = whatsapp ? whatsapp.replace(/\D/g, "") : "";
  const waLink = waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waMessage)}` : null;
  const mailLink = !waLink && email ? `mailto:${email}` : null;

  return (
    <div className="flex flex-col gap-2">
      {waLink && (
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-[#25D366] px-4 py-2.5 text-center text-sm font-semibold text-white"
        >
          Escribir por WhatsApp
        </a>
      )}
      {mailLink && (
        <a href={mailLink} className="rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-semibold text-accent-foreground">
          Enviar email
        </a>
      )}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
        <p className="text-center text-[11px] text-muted-foreground">
          Para hacer una oferta, mensajear en privado o guardar en favoritos, descargá la app de MatchCars
        </p>
        <div className="flex gap-2">
          <a
            href={APPLE_URL}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background transition hover:opacity-90"
          >
            🍏 App Store
          </a>
          <a
            href={PLAY_URL}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background transition hover:opacity-90"
          >
            🤖 Google Play
          </a>
        </div>
      </div>
    </div>
  );
}
