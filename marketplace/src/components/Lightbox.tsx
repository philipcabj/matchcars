"use client";

// Mismo patrón que portal/src/app/dashboard/stock/[id]/page.tsx — modal
// fullscreen con navegación por teclado/flechas en pantalla. Acá se ofrece
// como dos piezas: la grilla de miniaturas clickeables (`PhotoGallery`) y el
// modal en sí (`Lightbox`), para poder reusarlo con distintos layouts.
import Image from "next/image";
import { useEffect, useState } from "react";

function Lightbox({ photos, index, onClose, onNavigate }: { photos: string[]; index: number; onClose: () => void; onNavigate: (i: number) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNavigate((index - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") onNavigate((index + 1) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onNavigate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white"
      >
        ×
      </button>
      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((index - 1 + photos.length) % photos.length);
          }}
          className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white sm:left-6"
        >
          ‹
        </button>
      )}
      <div className="relative h-[85vh] w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <Image src={photos[index]} alt="" fill sizes="90vw" className="object-contain" />
      </div>
      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((index + 1) % photos.length);
          }}
          className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white sm:right-6"
        >
          ›
        </button>
      )}
      {photos.length > 1 && (
        <p className="absolute bottom-4 text-xs font-semibold text-white/80">
          {index + 1} / {photos.length}
        </p>
      )}
    </div>
  );
}

export function PhotoGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (photos.length === 0) {
    return <div className="flex aspect-video items-center justify-center rounded-2xl bg-card text-sm text-muted-foreground">Sin fotos</div>;
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => setOpenIndex(0)}
          className="relative col-span-4 aspect-video cursor-zoom-in overflow-hidden rounded-2xl bg-card"
        >
          <Image src={photos[0]} alt={alt} fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" priority />
        </button>
        {photos.slice(1, 5).map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpenIndex(i + 1)}
            className="relative aspect-square cursor-zoom-in overflow-hidden rounded-xl bg-card"
          >
            <Image src={url} alt="" fill sizes="150px" className="object-cover" />
          </button>
        ))}
      </div>
      {openIndex !== null && (
        <Lightbox photos={photos} index={openIndex} onClose={() => setOpenIndex(null)} onNavigate={setOpenIndex} />
      )}
    </>
  );
}
