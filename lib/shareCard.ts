import { shareFile } from "@/lib/reporting";
import { logger } from "@/lib/logger";
import type { RefObject } from "react";
import { Image, Platform, View } from "react-native";
import { captureRef } from "react-native-view-shot";

interface GenerateAndShareCardParams {
  cardRef: RefObject<View | null>;
  uid: string;
  imageUrls?: (string | null | undefined)[];
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Captures the ShareCard view (must already be mounted and visible/laid-out —
 * captureRef on an off-screen/never-painted node produces blank or broken
 * output, especially on native where remote <Image> sources need time to
 * actually load) and hands it off to the platform's share/download flow.
 */
export async function generateAndShareCard({ cardRef, uid, imageUrls = [] }: GenerateAndShareCardParams) {
  if (!cardRef.current) throw new Error("Share card no está montada todavía.");

  // Preload remote images (logo, vehicle covers) so captureRef doesn't snapshot
  // them mid-load — this is the main cause of "broken" images in the exported card.
  await Promise.allSettled(
    imageUrls
      .filter((u): u is string => !!u)
      .map((u) => Image.prefetch(u).catch(() => {}))
  );

  // Give the view a beat to finish laying out/painting before capturing —
  // same precaution app/(screens)/add-car.tsx already uses around captureRef.
  await wait(80);

  if (Platform.OS === "web") {
    const dataUri = await captureRef(cardRef as any, { format: "png", quality: 1, result: "data-uri" });
    const res = await fetch(dataUri);
    const blob = await res.blob();

    try {
      const file = new File([blob], `matchcars-${uid}.png`, { type: "image/png" });
      if ((navigator as any).canShare?.({ files: [file] })) {
        await (navigator as any).share({ files: [file] });
        return;
      }
    } catch (e) {
      // Native web share sheet was cancelled or errored — respect that, don't force a download.
      logger.warn("[shareCard] navigator.share failed/cancelled", e);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `matchcars-${uid}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    return;
  }

  const uri = await captureRef(cardRef as any, { format: "jpg", quality: 0.92, result: "tmpfile" });
  await shareFile(uri, "image/jpeg", `matchcars-${uid}.jpg`);
}
