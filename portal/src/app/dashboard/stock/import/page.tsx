// portal/src/app/dashboard/stock/import/page.tsx
// Carga masiva de stock por CSV + fotos. El parseo/creación real de los
// vehículos lo hace la Cloud Function startBulkImport (sin tocar) — acá solo
// se sube el CSV+ZIP a Storage, se la llama, y se escucha el progreso.
//
// Restricción a propósito: startBulkImport usa request.auth.uid como dueño de
// los autos que crea, sin ningún concepto de "agencia"/equipo. Por eso esta
// pantalla solo la puede usar el dueño real de la cuenta (uid === agencyId) —
// si la usara un miembro de equipo, los autos quedarían mal atribuidos.
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useAgencyMe } from "@/hooks/useAgencyMe";
import { BulkImportJob, BulkImportPreviewRow, TEMPLATE_HEADERS, TEMPLATE_ROWS } from "@/lib/bulkImport";
import { app, db, storage } from "@/lib/firebase-client";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import Link from "next/link";
import Papa from "papaparse";
import { useEffect, useState } from "react";

type Phase = "form" | "uploading" | "processing";

function downloadTemplate() {
  const csv = Papa.unparse({ fields: TEMPLATE_HEADERS, data: TEMPLATE_ROWS });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-vehiculos-matchcars.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BulkImportPage() {
  const { user } = useAuth();
  const { data: agency, loading: agencyLoading } = useAgencyMe();

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<BulkImportPreviewRow[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<BulkImportJob | null>(null);
  const [startError, setStartError] = useState("");

  useEffect(() => {
    if (!jobId) return;
    const unsub = onSnapshot(doc(db, "bulkImportJobs", jobId), (snap) => {
      if (snap.exists()) setJob(snap.data() as BulkImportJob);
    });
    return () => unsub();
  }, [jobId]);

  const handleCsvChange = async (file: File | undefined) => {
    if (!file) return;
    setCsvFile(file);
    const text = await file.text();
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (results) => {
        const rows: BulkImportPreviewRow[] = results.data.map((row) => {
          const brand = row.brand || row.marca || "";
          const model = row.model || row.modelo || "";
          return { id: row.id || row.sku || row.vin, brand, model, valid: !!(brand && model) };
        });
        setPreviewRows(rows);
      },
    });
  };

  const handleStartImport = async () => {
    if (!user || !csvFile || !zipFile) return;
    setPhase("uploading");
    setStartError("");
    try {
      const newJobId = doc(collection(db, "bulkImportJobs")).id;
      await uploadBytes(ref(storage, `bulkImports/${user.uid}/${newJobId}/data.csv`), csvFile);
      await uploadBytes(ref(storage, `bulkImports/${user.uid}/${newJobId}/photos.zip`), zipFile);

      setJobId(newJobId);
      setPhase("processing");

      const startBulkImportFn = httpsCallable(getFunctions(app), "startBulkImport");
      startBulkImportFn({ jobId: newJobId }).catch((e: unknown) => {
        setStartError(e instanceof Error ? e.message : "La importación falló.");
      });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "No se pudieron subir los archivos.");
      setPhase("form");
    }
  };

  const resetForm = () => {
    setPhase("form");
    setJobId(null);
    setJob(null);
    setStartError("");
    setCsvFile(null);
    setPreviewRows([]);
    setZipFile(null);
  };

  if (agencyLoading || !user) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  if (!agency?.isDealerPlan) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <p className="font-semibold">Función exclusiva para agencias</p>
        <p className="mt-2 text-sm text-muted-foreground">
          La carga masiva por CSV está disponible en los planes Dealer.
        </p>
      </div>
    );
  }

  if (agency.myUid !== agency.agencyId) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <p className="font-semibold">Solo el dueño de la cuenta</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Por ahora la carga masiva la puede usar únicamente la cuenta dueña de la agencia, no otros usuarios del equipo.
        </p>
      </div>
    );
  }

  const validRowCount = previewRows.filter((r) => r.valid).length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-bold">Carga masiva de stock</h1>

      {phase === "form" && (
        <>
          <p className="text-sm text-muted-foreground">
            Descargá la planilla de ejemplo, completala con tu stock y subí las fotos en un único
            archivo .zip (cada foto nombrada con el ID del vehículo, ej: ID=&quot;AUTO1&quot;, foto=
            &quot;AUTO1_01.jpg&quot;, o agrupadas en una carpeta con el nombre del ID dentro del .zip).
          </p>

          <button
            onClick={downloadTemplate}
            className="flex w-fit items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-accent"
          >
            ⬇️ Descargar planilla de ejemplo
          </button>

          <div>
            <p className="mb-2 text-sm font-semibold">1. Cargar planilla completa (CSV)</p>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              {csvFile ? csvFile.name : "Seleccionar archivo .csv"}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleCsvChange(e.target.files?.[0])} />
            </label>
          </div>

          {previewRows.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">2. Cargar fotos (.zip)</p>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                {zipFile ? zipFile.name : "Seleccionar archivo .zip con las fotos"}
                <input
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  className="hidden"
                  onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}

          {previewRows.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">
                Vista previa ({validRowCount}/{previewRows.length} vehículos válidos)
              </p>
              <div className="flex flex-col gap-1.5">
                {previewRows.slice(0, 20).map((v, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm">
                    <span className="font-semibold">{v.valid ? `${v.brand} ${v.model}` : `Fila ${i + 1} inválida (falta marca o modelo)`}</span>
                    <span className="text-xs text-muted-foreground">ID: {v.id || "N/A"}</span>
                  </div>
                ))}
                {previewRows.length > 20 && (
                  <p className="text-center text-xs text-muted-foreground">y {previewRows.length - 20} más…</p>
                )}
              </div>
            </div>
          )}

          {previewRows.length > 0 && zipFile && (
            <button
              onClick={handleStartImport}
              disabled={validRowCount === 0}
              className="rounded-xl bg-accent px-4 py-3 text-sm font-bold text-accent-foreground disabled:opacity-50"
            >
              Importar {validRowCount} vehículo{validRowCount === 1 ? "" : "s"}
            </button>
          )}
        </>
      )}

      {phase === "uploading" && <p className="py-10 text-center text-sm text-muted-foreground">Subiendo planilla y fotos…</p>}

      {phase === "processing" && (
        <div>
          {startError ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="font-semibold text-error">No se pudo completar la importación</p>
              <p className="text-sm text-muted-foreground">{startError}</p>
              <button onClick={resetForm} className="mt-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground">
                Volver a intentar
              </button>
            </div>
          ) : !job ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Preparando importación…</p>
          ) : (
            <div>
              <p className="mb-3 text-sm font-semibold">{job.status === "done" ? "Importación finalizada" : "Importando tu stock…"}</p>
              <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${job.totalCount ? Math.round((job.processedCount / job.totalCount) * 100) : 0}%` }}
                />
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                {job.processedCount}/{job.totalCount} procesados · {job.successCount} exitosos · {job.failCount} con errores
              </p>

              {job.errors?.length > 0 && (
                <div className="mb-4 flex flex-col gap-1">
                  <p className="text-sm font-semibold">Errores:</p>
                  {job.errors.map((err, i) => (
                    <p key={i} className="text-xs text-error">
                      Fila {err.row} ({err.vehicle}): {err.message}
                    </p>
                  ))}
                </div>
              )}

              {job.status === "done" && (
                <Link href="/dashboard/stock" className="inline-block rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground">
                  Ir a Stock
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
