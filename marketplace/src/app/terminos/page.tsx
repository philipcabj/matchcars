// marketplace/src/app/terminos/page.tsx
// Mismo texto que app/legal-terms.tsx (la app) — una sola fuente de verdad
// de los términos, solo cambia el envoltorio visual para la web.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Términos y condiciones de uso de MatchCars.",
  alternates: { canonical: "/terminos" },
};

const SECTIONS = [
  {
    title: "1. Aceptación de los Términos",
    content:
      "Al descargar o utilizar la aplicación Matchcars, estos términos se aplicarán automáticamente a ti; por lo tanto, debes asegurarte de leerlos atentamente antes de usar la aplicación.",
  },
  {
    title: "2. Descripción del Servicio",
    content:
      "Matchcars es una plataforma que facilita la conexión entre compradores y vendedores de vehículos. Matchcars no es propietario de los vehículos ofrecidos, no los posee ni los vende directamente.",
  },
  {
    title: "3. Cuentas de Usuario",
    content:
      "Eres responsable de mantener la confidencialidad de tu cuenta y contraseña y de restringir el acceso a tu dispositivo. Aceptas la responsabilidad de todas las actividades que ocurran bajo tu cuenta o contraseña.",
  },
  {
    title: "4. Suscripciones y Pagos",
    content:
      "Matchcars ofrece planes de suscripción (PRO, PRO Plus, PRO Dealer) que otorgan beneficios adicionales. El pago se cargará a tu cuenta de Apple ID en la confirmación de la compra. La suscripción se renueva automáticamente a menos que se cancele al menos 24 horas antes del final del período actual. Tu cuenta será cargada por la renovación dentro de las 24 horas anteriores al final del período actual. Puedes gestionar y cancelar tus suscripciones yendo a la configuración de tu cuenta de App Store después de la compra.",
  },
  {
    title: "5. Conducta del Usuario",
    content:
      "Te comprometes a utilizar la aplicación solo para fines legales y de una manera que no infrinja los derechos de, restrinja o inhiba el uso y disfrute de la aplicación por parte de cualquier tercero.",
  },
  {
    title: "6. Limitación de Responsabilidad",
    content:
      "En ningún caso Matchcars, ni sus directores, empleados, socios, agentes, proveedores o afiliados, serán responsables de cualquier daño indirecto, incidental, especial, consecuente o punitivo, incluyendo, sin limitación, pérdida de beneficios, datos, uso, buena voluntad, u otras pérdidas intangibles.",
  },
  {
    title: "7. Cambios en los Términos",
    content:
      "Nos reservamos el derecho, a nuestra sola discreción, de modificar o reemplazar estos Términos en cualquier momento. Si una revisión es material, intentaremos proporcionar un aviso de al menos 30 días antes de que entren en vigor los nuevos términos.",
  },
];

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-extrabold">Términos y condiciones</h1>
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
