import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        
        {/* iOS Smart App Banner */}
        <meta name="apple-itunes-app" content="app-id=6739093393" />
        
        {/* Android Theme Color */}
        <meta name="theme-color" content="#0E1117" />
        
        <title>Matchcars</title>
        
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
