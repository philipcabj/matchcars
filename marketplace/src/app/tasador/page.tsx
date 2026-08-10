import { TasadorForm } from "./TasadorForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "¿Cuánto vale tu auto?",
  description: "Estimá el precio de mercado de tu auto usado gratis, sin registrarte.",
  alternates: { canonical: "/tasador" },
};

export default function TasadorPage() {
  return <TasadorForm />;
}
