import { CompareTray } from "@/components/CompareTray";
import { NavBar } from "@/components/NavBar";
import { CompareProvider } from "@/contexts/CompareContext";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Mismos IDs que la app (app/+html.tsx) — matchcars.app pasa a ser este
// sitio, así que el tracking de la landing tiene que vivir acá también o se
// pierde toda la medición de tráfico/conversión de la página principal.
const GA_MEASUREMENT_ID = "G-W062XQ8Z0L";
const META_PIXEL_ID = "1217053183887888";

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
        {/* Corre antes del primer paint (beforeInteractive) para que no haya
            flash del tema equivocado — crema es el default, oscuro solo si
            el usuario lo eligió antes (ThemeToggle.tsx persiste en localStorage). */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            try {
              if (localStorage.getItem('mc-theme') === 'dark') {
                document.documentElement.classList.add('dark');
              }
            } catch (e) {}
          `}
        </Script>
        <Script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>

        <CompareProvider>
          <NavBar />
          <div className="flex-1 pb-16">{children}</div>
          <CompareTray />
        </CompareProvider>
      </body>
    </html>
  );
}
