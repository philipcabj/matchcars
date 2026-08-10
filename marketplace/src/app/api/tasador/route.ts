// marketplace/src/app/api/tasador/route.ts
// Único endpoint del tasador — de solo lectura/cálculo, no escribe nada.
// ?action=makes | models&make=X | years&brand=&model= | analyze&brand=&model=&year=&currency=
import { getCatalogMakes, getCatalogModels } from "@/lib/catalog";
import { analyzeMarketPrice, getAvailableYears } from "@/lib/pricing-admin";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  try {
    if (action === "makes") {
      return Response.json({ makes: await getCatalogMakes() });
    }

    if (action === "models") {
      const make = searchParams.get("make") || "";
      return Response.json({ models: await getCatalogModels(make) });
    }

    if (action === "years") {
      const brand = searchParams.get("brand") || "";
      const model = searchParams.get("model") || "";
      return Response.json({ years: await getAvailableYears(brand, model) });
    }

    if (action === "analyze") {
      const brand = searchParams.get("brand") || "";
      const model = searchParams.get("model") || "";
      const year = Number(searchParams.get("year"));
      const currency = searchParams.get("currency") === "USD" ? "USD" : "ARS";
      if (!brand || !model || !year) {
        return Response.json({ error: "Faltan marca, modelo o año." }, { status: 400 });
      }
      return Response.json(await analyzeMarketPrice(brand, model, year, currency));
    }

    return Response.json({ error: "Acción inválida." }, { status: 400 });
  } catch (e) {
    console.error("[api/tasador] error:", e);
    return Response.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
