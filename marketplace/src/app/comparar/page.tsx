import { computeBestValues, computeScores } from "@/lib/compare";
import { getVehiclesByIds } from "@/lib/vehicles";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Comparar autos",
  robots: { index: false }, // depende de qué autos eligió cada visitante — no tiene sentido indexarla
};

function Row({ label, cells }: { label: string; cells: React.ReactNode[] }) {
  return (
    <tr className="border-b border-border">
      <th className="w-40 shrink-0 border-r border-border bg-card px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{label}</th>
      {cells.map((c, i) => (
        <td key={i} className="px-3 py-2.5 text-sm">
          {c}
        </td>
      ))}
    </tr>
  );
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids: idsParam } = await searchParams;
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : [];
  const vehicles = ids.length > 0 ? await getVehiclesByIds(ids) : [];

  if (vehicles.length < 2) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-xl font-bold">Todavía no elegiste autos para comparar</p>
        <p className="text-sm text-muted-foreground">
          Marcá &quot;Comparar&quot; en 2 o más autos desde la búsqueda o la ficha, y volvé acá.
        </p>
        <Link href="/" className="mt-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground">
          Ver autos
        </Link>
      </div>
    );
  }

  const best = computeBestValues(vehicles);
  const scores = computeScores(vehicles, best);
  const winnerId = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0];

  const highlight = (value: boolean) => (value ? "bg-success/10 font-bold text-success" : "");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-extrabold">Comparar autos</h1>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="w-40 shrink-0 border-r border-border bg-card px-3 py-3" />
              {vehicles.map((v) => (
                <th key={v.id} className="min-w-[180px] px-3 py-3 text-left">
                  <Link href={`/car/${v.id}`} className="flex flex-col gap-2">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-background">
                      {v.coverImage && <Image src={v.coverImage} alt="" fill sizes="200px" className="object-cover" />}
                    </div>
                    <p className="text-sm font-semibold">
                      {v.brand} {v.model}
                    </p>
                    {v.id === winnerId && (
                      <span className="w-fit rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">Mejor opción</span>
                    )}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row
              label="Precio"
              cells={vehicles.map((v) => (
                <span key={v.id} className={best?.minPrice === v.price ? "font-bold text-success" : ""}>
                  {v.currency} {v.price.toLocaleString("es-AR")}
                </span>
              ))}
            />
            <Row
              label="Precio / km"
              cells={vehicles.map((v) => {
                const ppk = v.price && v.km > 0 ? v.price / v.km : null;
                const isBest = ppk !== null && best?.minPricePerKm !== null && Math.round(ppk) === Math.round(best?.minPricePerKm ?? -1);
                return (
                  <span key={v.id} className={isBest ? "font-bold text-success" : ""}>
                    {ppk ? `${v.currency} ${Math.round(ppk).toLocaleString("es-AR")}` : "—"}
                  </span>
                );
              })}
            />
            <Row
              label="Año"
              cells={vehicles.map((v) => (
                <span key={v.id} className={best?.maxYear === v.year ? "font-bold text-success" : ""}>
                  {v.year ?? "—"}
                </span>
              ))}
            />
            <Row
              label="Kilómetros"
              cells={vehicles.map((v) => (
                <span key={v.id} className={best?.minKm === v.km ? "font-bold text-success" : ""}>
                  {v.km.toLocaleString("es-AR")} km
                </span>
              ))}
            />
            <Row label="Combustible" cells={vehicles.map((v) => <span key={v.id}>{v.fuelType || "—"}</span>)} />
            <Row label="Caja" cells={vehicles.map((v) => <span key={v.id}>{v.gearbox || "—"}</span>)} />
            <Row
              label="Rating vendedor"
              cells={vehicles.map((v) => (
                <span key={v.id} className={best?.maxRating === v.sellerRating ? "font-bold text-success" : ""}>
                  {v.sellerRating > 0 ? `★ ${v.sellerRating.toFixed(1)}` : "—"}
                </span>
              ))}
            />
            <Row label="VTV vigente" cells={vehicles.map((v) => <span key={v.id} className={`rounded px-1.5 py-0.5 ${highlight(v.vtvValid)}`}>{v.vtvValid ? "Sí" : "—"}</span>)} />
            <Row label="Papeles al día" cells={vehicles.map((v) => <span key={v.id} className={`rounded px-1.5 py-0.5 ${highlight(v.papersUpToDate)}`}>{v.papersUpToDate ? "Sí" : "—"}</span>)} />
            <Row label="Garantía" cells={vehicles.map((v) => <span key={v.id} className={`rounded px-1.5 py-0.5 ${highlight(v.warranty)}`}>{v.warranty ? "Sí" : "—"}</span>)} />
            <Row label="Único dueño" cells={vehicles.map((v) => <span key={v.id} className={`rounded px-1.5 py-0.5 ${highlight(v.singleOwner)}`}>{v.singleOwner ? "Sí" : "—"}</span>)} />
            <Row label="Service oficial" cells={vehicles.map((v) => <span key={v.id} className={`rounded px-1.5 py-0.5 ${highlight(v.serviceRecords)}`}>{v.serviceRecords ? "Sí" : "—"}</span>)} />
            <Row label="Financiación" cells={vehicles.map((v) => <span key={v.id} className={`rounded px-1.5 py-0.5 ${highlight(v.acceptsFinancing)}`}>{v.acceptsFinancing ? "Sí" : "—"}</span>)} />
            <Row label="Precio conversable" cells={vehicles.map((v) => <span key={v.id} className={`rounded px-1.5 py-0.5 ${highlight(v.negotiablePrice)}`}>{v.negotiablePrice ? "Sí" : "—"}</span>)} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
