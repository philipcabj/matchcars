// portal/src/app/dashboard/plans/page.tsx
// Vista informativa de los planes — no se contratan ni gestionan acá (eso
// sigue siendo exclusivo de la app vía RevenueCat/App Store/Google Play).
// Presentación compartida con la landing pública /planes — ver
// PlansDisplay.tsx.
"use client";

import { PlansDisplay } from "@/components/PlansDisplay";
import { useAgencyMe } from "@/hooks/useAgencyMe";

export default function PlansPage() {
  const { data: agency } = useAgencyMe();
  const currentPlanId = !agency
    ? undefined // todavía cargando
    : agency.plan?.includes("pro_dealer")
      ? "pro_dealer"
      : agency.plan?.includes("pro_plus")
        ? "pro_plus"
        : agency.plan?.includes("pro")
          ? "pro"
          : null; // free

  return (
    <div className="mx-auto max-w-5xl">
      <PlansDisplay currentPlanId={currentPlanId} currentPlanLabel={agency?.planLabel} />
    </div>
  );
}
