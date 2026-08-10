import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "./firebase";

export interface DealerReportData {
  period: string;
  publishedCars: number;
  soldCars: number;
  avgDaysToSell: number;
  totalInterests: number; // Likes
  score: number;
  topVehicles: {
    brand: string;
    model: string;
    views: number;
    likes: number;
    status: string;
  }[];
}

export const fetchDealerReportData = async (userId: string): Promise<DealerReportData> => {
  try {
    const q = query(collection(db, "vehicles"), where("userId", "==", userId));
    const snap = await getDocs(q);

    let publishedCars = 0;
    let soldCars = 0;
    let totalSellTimeMs = 0;
    let totalInterests = 0;
    let soldCountForAvg = 0;

    const topVehicles: any[] = [];

    snap.forEach((doc) => {
      const data = doc.data();
      // "En venta": only listings that are actually live (approved + published),
      // matching the "active" filter used in mycars.tsx. Excludes pending/rejected/
      // blocked/sold/deleted so a rejected listing can't inflate this count.
      const status = data.status || 'available';
      if (data.published === true && status === 'available') {
        publishedCars++;
      }

      // Sold count
      if (data.status === 'sold') {
        soldCars++;
        
        // Calculate time to sell
        const created = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
        // Use updatedAt as proxy for soldAt if soldAt is missing
        const sold = data.soldAt instanceof Timestamp ? data.soldAt.toDate() : (data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null);

        if (created && sold) {
          const diff = sold.getTime() - created.getTime();
          if (diff > 0) {
            totalSellTimeMs += diff;
            soldCountForAvg++;
          }
        }
      }

      // Interests (Likes)
      const likes = Array.isArray(data.likedBy) ? data.likedBy.length : (data.likesCount || 0);
      totalInterests += likes;

      topVehicles.push({
        brand: data.brand || "Desconocido",
        model: data.model || "",
        views: data.views || 0,
        likes: likes,
        status: data.status || "available"
      });
    });

    const avgDaysToSell = soldCountForAvg > 0 
      ? Math.round((totalSellTimeMs / soldCountForAvg) / (1000 * 60 * 60 * 24)) 
      : 0;

    // Dealer Score: Sold * 50 + Likes * 5
    const score = (soldCars * 50) + (totalInterests * 5);

    // Sort top vehicles
    topVehicles.sort((a, b) => b.views - a.views);

    return {
      period: new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
      publishedCars,
      soldCars,
      avgDaysToSell,
      totalInterests,
      score,
      topVehicles: topVehicles.slice(0, 5) // Top 5
    };

  } catch (error) {
    console.error("Error fetching report data:", error);
    throw new Error("No se pudieron obtener los datos del reporte.");
  }
};

export const generatePDF = async (data: DealerReportData, userName: string) => {
  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
          h1 { color: #111; margin-bottom: 5px; font-size: 24px; }
          .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
          .brand-text { font-size: 26px; font-weight: 900; color: #9013FE; letter-spacing: -1px; }
          .brand-badge { background: #9013FE; color: white; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px; }
          .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
          .card { background: #F3F4F6; padding: 15px; border-radius: 8px; margin-bottom: 10px; }
          .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; }
          .stat-item { background: #fff; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #eee; }
          .stat-value { font-size: 24px; font-weight: bold; color: #111; }
          .stat-label { font-size: 11px; color: #666; text-transform: uppercase; margin-top: 5px; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { text-align: left; padding: 12px; border-bottom: 1px solid #ddd; }
          th { background-color: #f8f9fa; color: #666; font-size: 12px; text-transform: uppercase; }
          .footer { margin-top: 50px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="brand">
           <div class="brand-text">Matchcars</div>
           <div class="brand-badge">PRO DEALER</div>
        </div>

        <div class="header">
          <div>
            <h1>Reporte Mensual</h1>
            <p style="margin: 0; color: #666;">Generado para: <strong>${userName}</strong></p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-weight: bold; color: #333;">${new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-value">${data.publishedCars}</div>
            <div class="stat-label">Autos Publicados</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${data.soldCars}</div>
            <div class="stat-label">Autos Vendidos</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${data.totalInterests}</div>
            <div class="stat-label">Intereses Recibidos</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${data.avgDaysToSell} días</div>
            <div class="stat-label">Tiempo Promedio Venta</div>
          </div>
        </div>

        <div class="card" style="text-align: center; background: #EEFFE0; border: 1px solid #B8E8A0;">
          <div class="stat-value" style="color: #2E7D32;">${data.score} pts</div>
          <div class="stat-label" style="color: #2E7D32;">Dealer Score</div>
          <p style="margin: 5px 0 0 0; font-size: 11px; color: #444;">
             Tu puntaje refleja la actividad de tu agencia.<br>
             (Ventas x50 + Intereses x5)
          </p>
        </div>

        <h3>Top Vehículos (Por Vistas)</h3>
        <table>
          <thead>
            <tr>
              <th>Vehículo</th>
              <th>Estado</th>
              <th>Vistas</th>
              <th>Intereses</th>
            </tr>
          </thead>
          <tbody>
            ${data.topVehicles.map(v => `
              <tr>
                <td>${v.brand} ${v.model}</td>
                <td>${v.status === 'sold' ? 'Vendido' : 'Disponible'}</td>
                <td>${v.views}</td>
                <td>${v.likes}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          Generado automáticamente por Matchcars App
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
};

export const generateCSV = async (data: DealerReportData, userName: string) => {
  let csv = "Reporte Dealer,Usuario,Fecha\n";
  csv += `Matchcars PRO,${userName},${new Date().toLocaleDateString()}\n\n`;
  
  csv += "Metricas Generales\n";
  csv += "Autos Publicados,Autos Vendidos,Intereses Recibidos,Tiempo Promedio Venta (dias),Dealer Score\n";
  csv += `${data.publishedCars},${data.soldCars},${data.totalInterests},${data.avgDaysToSell},${data.score}\n\n`;

  csv += "Top Vehiculos\n";
  csv += "Marca,Modelo,Estado,Vistas,Intereses\n";
  
  data.topVehicles.forEach(v => {
    csv += `${v.brand},${v.model},${v.status},${v.views},${v.likes}\n`;
  });

  const uri = FileSystem.documentDirectory + 'reporte_dealer.csv';
  await FileSystem.writeAsStringAsync(uri, csv);
  return uri;
};

export const shareFile = async (uri: string, mimeType: string, filename: string) => {
  if (!(await Sharing.isAvailableAsync())) {
    alert('Compartir no está disponible en este dispositivo');
    return;
  }

  let uti = 'public.item';
  if (mimeType === 'application/pdf') {
    uti = 'com.adobe.pdf';
  } else if (mimeType === 'text/csv') {
    uti = 'public.comma-separated-values-text';
  }

  await Sharing.shareAsync(uri, { 
    mimeType, 
    dialogTitle: filename, 
    UTI: uti 
  });
};
