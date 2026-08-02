import { shareFile } from "@/lib/reporting";
import type { RefObject } from "react";
import { Platform, View } from "react-native";
import { captureRef } from "react-native-view-shot";

interface GenerateAndShareCardParams {
  cardRef: RefObject<View | null>;
  uid: string;
}

/**
 * Captures the off-screen ShareCard view and hands it off to the platform's
 * share/download flow. Native uses the same captureRef pattern already used
 * in app/(screens)/add-car.tsx; web relies on react-native-view-shot's
 * built-in html2canvas shim (works out of the box, no extra dependency).
 */
export async function generateAndShareCard({ cardRef, uid }: GenerateAndShareCardParams) {
  if (!cardRef.current) return;

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
    } catch {
      // Native web share sheet was cancelled or errored — respect that, don't force a download.
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
