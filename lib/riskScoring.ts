import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "./firebase";
import { analyzeMarketPrice } from "./pricing";

export async function evaluateVehicleRisk(options: {
  brand: string;
  model: string;
  year: number;
  price: number;
  currency: "ARS" | "USD";
  description: string;
  userId: string;
  trustLevel: string;
  coverImage: string;
}) {
  const flags: string[] = [];
  let score = 0;

  try {
    const analysis = await analyzeMarketPrice(
      options.brand,
      options.model,
      options.year,
      options.currency
    );
    if (analysis.avg > 0) {
      if (options.price < analysis.avg * 0.6) {
        flags.push("price_outlier");
        score += 4;
      } else if (options.price > analysis.avg * 1.5) {
        flags.push("price_high_outlier");
        score += 3;
      }
      const currentYear = new Date().getFullYear();
      if (options.year >= currentYear && options.price < analysis.avg * 0.8) {
        flags.push("year_price_mismatch");
        score += 2;
      }
    }
  } catch {
  }

  try {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const qRecent = query(
      collection(db, "vehicles"),
      where("userId", "==", options.userId),
      where("createdAt", ">=", Timestamp.fromDate(from))
    );
    const snapRecent = await getDocs(qRecent);
    if (snapRecent.docs.length >= 3 && options.trustLevel !== "verified") {
      flags.push("new_user_mass");
      score += 3;
    }
  } catch {
  }

  if (options.description) {
    const text = options.description.toLowerCase();
    const hasPhone = /\d{8,}/.test(text);
    const hasLink = text.includes("http://") || text.includes("https://") || text.includes("www.") || text.includes(".com");
    if (hasPhone || hasLink) {
      flags.push("external_contact");
      score += 2;
    }
  }

  try {
    if (options.coverImage) {
      const qDup = query(
        collection(db, "vehicles"),
        where("userId", "==", options.userId),
        where("images.cover", "==", options.coverImage)
      );
      const snapDup = await getDocs(qDup);
      if (!snapDup.empty) {
        flags.push("duplicate_image");
        score += 2;
      }
    }
  } catch {
  }

  return {
    flags: Array.from(new Set(flags)),
    score,
  };
}
