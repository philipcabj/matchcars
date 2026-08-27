// portal/src/app/mi-operacion/[token]/page.tsx
// Portal público del comprador (Módulo A) — sin login, sin sidebar, mismo
// criterio de pantalla standalone que /invite/[id]. Muestra el estado de la
// operación, deja firmar Seña/Boleto (checkbox + código por email) y subir
// documentación que la agencia haya pedido. Ver
// portal/src/app/api/public/operations/[token]/** para las rutas que
// consume — nada acá requiere autenticación porque el comprador puede no
// tener cuenta en MatchCars.
"use client";

import { parseJsonResponse } from "@/lib/api-client";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface ChecklistStep {
  key: string;
  label: string;
  status: "pendiente" | "hecho";
  dueAt: string | null;
}

interface SignatureState {
  status: "pending_buyer" | "signed" | "voided";
  documentUrl: string;
  finalDocumentUrl: string | null;
  buyerSignedAt: string | null;
  sellerSignedAt: string | null;
}

interface DocumentRequestItem {
  id: string;
  label: string;
  uploadedUrl: string | null;
  uploadedAt: string | null;
}

interface OperationPublicState {
  status: string;
  agencyName: string;
  buyerLabel: string;
  vehicle: { brand: string; model: string; year: number | null; coverUrl: string | null };
  checklist: ChecklistStep[];
  signatures: Record<string, SignatureState>;
  documentRequests: DocumentRequestItem[];
}

const SIGNABLE_LABELS: Record<string, string> = {
  sena: "Seña / Reserva",
  boleto_compraventa: "Boleto de compraventa",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface SignBoxState {
  accepted: boolean;
  otpSent: boolean;
  code: string;
  busy: boolean;
  error: string | null;
}

const EMPTY_SIGN_BOX: SignBoxState = { accepted: false, otpSent: false, code: "", busy: false, error: null };

function SignatureCard({
  token,
  docKey,
  signature,
  onSigned,
}: {
  token: string;
  docKey: string;
  signature: SignatureState;
  onSigned: () => void;
}) {
  const [state, setState] = useState<SignBoxState>(EMPTY_SIGN_BOX);
  const set = (patch: Partial<SignBoxState>) => setState((prev) => ({ ...prev, ...patch }));

  const requestOtp = async () => {
    set({ busy: true, error: null });
    try {
      const res = await fetch(`/api/public/operations/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_otp", key: docKey }),
      });
      await parseJsonResponse(res);
      set({ otpSent: true, busy: false });
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : "Error desconocido" });
    }
  };

  const verify = async () => {
    set({ busy: true, error: null });
    try {
      const res = await fetch(`/api/public/operations/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", key: docKey, code: state.code.trim() }),
      });
      await parseJsonResponse(res);
      onSigned();
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : "Error desconocido" });
    }
  };

  if (signature.status === "signed") {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">{SIGNABLE_LABELS[docKey] ?? docKey}</p>
        <p className="mt-1 text-xs text-success">Firmado el {fmtDateTime(signature.buyerSignedAt)}</p>
        {signature.finalDocumentUrl && (
          <a href={signature.finalDocumentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-accent underline">
            Descargar documento firmado
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{SIGNABLE_LABELS[docKey] ?? docKey}</p>
      <a href={signature.documentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-accent underline">
        Ver documento
      </a>

      <label className="mt-3 flex items-start gap-2 text-xs">
        <input type="checkbox" checked={state.accepted} onChange={(e) => set({ accepted: e.target.checked })} className="mt-0.5" />
        Leí y acepto los términos de este documento.
      </label>

      {state.error && <p className="mt-2 text-xs text-error">{state.error}</p>}

      {!state.otpSent ? (
        <button
          type="button"
          disabled={!state.accepted || state.busy}
          onClick={requestOtp}
          className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
        >
          {state.busy ? "Enviando…" : "Enviar código de verificación"}
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Te mandamos un código a tu email — vence en 10 minutos.</p>
          <div className="flex gap-2">
            <input
              value={state.code}
              onChange={(e) => set({ code: e.target.value })}
              placeholder="Código de 6 dígitos"
              maxLength={6}
              className="w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={state.code.trim().length !== 6 || state.busy}
              onClick={verify}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              {state.busy ? "Confirmando…" : "Confirmar firma"}
            </button>
          </div>
          <button type="button" onClick={requestOtp} disabled={state.busy} className="self-start text-xs font-semibold text-accent">
            Reenviar código
          </button>
        </div>
      )}
    </div>
  );
}

function DocumentRequestCard({ token, request, onUploaded }: { token: string; request: DocumentRequestItem; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/public/operations/${token}/documents/${request.id}`, { method: "POST", body: formData });
      await parseJsonResponse(res);
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{request.label}</p>
      {request.uploadedUrl ? (
        <p className="mt-1 text-xs text-success">
          Subido el {fmtDateTime(request.uploadedAt)} —{" "}
          <a href={request.uploadedUrl} target="_blank" rel="noreferrer" className="underline">
            ver archivo
          </a>
        </p>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="mt-2 text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            disabled={busy}
          />
          {busy && <p className="mt-1 text-xs text-muted-foreground">Subiendo…</p>}
          {error && <p className="mt-1 text-xs text-error">{error}</p>}
        </>
      )}
    </div>
  );
}

export default function BuyerOperationPage() {
  const { token } = useParams<{ token: string }>();
  const [op, setOp] = useState<OperationPublicState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/public/operations/${token}`);
      const data = await parseJsonResponse<OperationPublicState>(res);
      setOp(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/operations/${token}`);
        const data = await parseJsonResponse<OperationPublicState>(res);
        setOp(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, [token]);

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-error">{error}</p>
        </div>
      </main>
    );
  }

  if (!op) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </main>
    );
  }

  const signableEntries = Object.entries(op.signatures);
  const pendingDocs = op.documentRequests.filter((d) => !d.uploadedUrl);
  const uploadedDocs = op.documentRequests.filter((d) => d.uploadedUrl);

  return (
    <main className="flex flex-1 justify-center px-4 py-10">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs text-muted-foreground">{op.agencyName}</p>
          <h1 className="mt-1 text-xl font-bold">
            {op.vehicle.brand} {op.vehicle.model} {op.vehicle.year ?? ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Hola {op.buyerLabel} — acá podés seguir el estado de tu compra.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="mb-3 text-sm font-semibold">Estado de la operación</p>
          <div className="flex flex-col gap-2">
            {op.checklist.map((step) => (
              <div key={step.key} className="flex items-center justify-between text-sm">
                <span>{step.label}</span>
                <span className={step.status === "hecho" ? "text-xs font-semibold text-success" : "text-xs text-muted-foreground"}>
                  {step.status === "hecho" ? "Hecho" : "Pendiente"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {signableEntries.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold">Documentos para firmar</p>
            {signableEntries.map(([key, sig]) => (
              <SignatureCard key={key} token={token} docKey={key} signature={sig} onSigned={load} />
            ))}
          </div>
        )}

        {pendingDocs.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold">Documentos que te pidieron</p>
            {pendingDocs.map((d) => (
              <DocumentRequestCard key={d.id} token={token} request={d} onUploaded={load} />
            ))}
          </div>
        )}

        {uploadedDocs.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold">Documentos ya subidos</p>
            {uploadedDocs.map((d) => (
              <DocumentRequestCard key={d.id} token={token} request={d} onUploaded={load} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
