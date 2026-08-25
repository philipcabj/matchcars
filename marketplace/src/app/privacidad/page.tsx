// marketplace/src/app/privacidad/page.tsx
// Mismo texto que app/privacy.tsx (la app) — una sola fuente de verdad de
// la política de privacidad, solo cambia el envoltorio visual para la web.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Política de privacidad de MatchCars.",
  alternates: { canonical: "/privacidad" },
};

const SECTIONS = [
  {
    title: "1. Introducción",
    content:
      "Matchcars respeta tu privacidad y se compromete a proteger tus datos personales. Esta política de privacidad te informará sobre cómo cuidamos tus datos cuando visitas nuestra aplicación móvil y te informará sobre tus derechos de privacidad y cómo la ley te protege.",
  },
  {
    title: "2. Información que recopilamos",
    content:
      "Podemos recopilar, usar, almacenar y transferir diferentes tipos de datos personales sobre ti, que incluyen: Datos de Identidad (nombre, apellido), Datos de Contacto (email, teléfono), Datos Técnicos (dirección IP, tipo de dispositivo), y Datos de Perfil (intereses, preferencias, historial de compras y vehículos publicados).",
  },
  {
    title: "3. Cómo usamos tu información",
    content:
      "Solo usaremos tus datos personales cuando la ley nos lo permita. Más comúnmente, usaremos tus datos personales en las siguientes circunstancias: Para registrarte como nuevo cliente, para procesar y entregar tu pedido (incluyendo gestionar pagos, tarifas y cargos), y para gestionar nuestra relación contigo.",
  },
  {
    title: "4. Seguridad de los datos",
    content:
      "Hemos implementado medidas de seguridad apropiadas para evitar que tus datos personales se pierdan accidentalmente, se usen o se acceda a ellos de manera no autorizada, se alteren o se divulguen.",
  },
  {
    title: "5. Retención de datos",
    content:
      "Solo conservaremos tus datos personales durante el tiempo que sea necesario para cumplir con los fines para los que los recopilamos, incluso para cumplir con cualquier requisito legal, contable o de informes.",
  },
  {
    title: "6. Eliminación de cuenta",
    content:
      "Puedes solicitar la eliminación de tu cuenta y todos los datos asociados en cualquier momento desde la configuración de tu perfil en la aplicación o contactándonos directamente.",
  },
  {
    title: "7. Contacto",
    content:
      "Si tenés alguna pregunta sobre esta política de privacidad o nuestras prácticas de privacidad, escribinos usando el ícono de contacto en el pie de página.",
  },
];

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-extrabold">Política de privacidad</h1>
      <p className="mt-1 text-sm text-muted-foreground">Última actualización: 24 de agosto de 2026</p>

      <div className="mt-8 flex flex-col gap-7">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-base font-bold">{s.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.content}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
