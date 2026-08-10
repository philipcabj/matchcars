import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="description" content="Matchcars es la forma más segura y simple de comprar y vender tu auto usado en Argentina. Publicá gratis, recibí contactos reales y gestioná todo desde la app." />
        <meta name="apple-itunes-app" content="app-id=6739093393" />
        <meta name="theme-color" content="#0E1117" />
        <link rel="canonical" href="https://matchcars.app/app/" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://matchcars.app/app/" />
        <meta property="og:title" content="Matchcars | Compra y venta de autos usados" />
        <meta property="og:description" content="Encontrá autos usados al mejor precio y vendé el tuyo con mayor seguridad. Matchcars conecta compradores y vendedores con herramientas PRO para agencias y particulares." />
        <meta property="og:image" content="https://matchcars.app/logo.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Matchcars | Compra y venta de autos usados" />
        <meta name="twitter:description" content="Comprá y vendé autos usados con más confianza. Publicaciones verificadas, alertas de precio y herramientas para agencias." />
        <meta name="twitter:image" content="https://matchcars.app/logo.png" />
        <title>Matchcars | Compra y venta de autos usados</title>

        <script async src="https://www.googletagmanager.com/gtag/js?id=G-W062XQ8Z0L"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-W062XQ8Z0L');
            `,
          }}
        />

        {/* Meta Pixel Code */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '1217053183887888');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=1217053183887888&ev=PageView&noscript=1"
          />
        </noscript>
        {/* End Meta Pixel Code */}

        {/* Reset default styles */}
        <ScrollViewStyleReset />
        
        <style dangerouslySetInnerHTML={{ __html: `
          body { background-color: #0E1117; }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
