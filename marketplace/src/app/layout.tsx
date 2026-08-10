import { CompareTray } from "@/components/CompareTray";
import { NavBar } from "@/components/NavBar";
import { CompareProvider } from "@/contexts/CompareContext";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Matchcars | Compra y venta de autos usados en Argentina",
    template: "%s | Matchcars",
  },
  description:
    "Matchcars es el marketplace de autos usados en Argentina. Buscá, comparé y contactá vendedores particulares y agencias verificadas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <CompareProvider>
          <NavBar />
          <div className="flex-1 pb-16">{children}</div>
          <CompareTray />
        </CompareProvider>
      </body>
    </html>
  );
}
