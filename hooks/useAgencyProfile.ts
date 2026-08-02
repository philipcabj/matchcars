import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";

interface AgencyProfileResult {
  uid: string | null;
  profileData: any | null;
  loading: boolean;
  notFound: boolean;
}

/**
 * Resolves a public profile identifier — either a Firebase uid or a custom
 * slug (users.slug) — to the underlying users/{uid} doc, live via onSnapshot.
 * Keep resolution semantics (doc-get first, then slug query fallback) in sync
 * with functions/src/ogPreview.ts, which duplicates this logic server-side.
 */
export function useAgencyProfile(identifier?: string | null): AgencyProfileResult {
  const [uid, setUid] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!identifier) {
      setUid(null);
      setProfileData(null);
      setLoading(false);
      setNotFound(false);
      return;
    }

    let unsubSnapshot: (() => void) | undefined;
    let cancelled = false;

    setLoading(true);
    setNotFound(false);

    (async () => {
      try {
        const directSnap = await getDoc(doc(db, "users", identifier));
        if (cancelled) return;

        let resolvedUid: string | null = null;
        if (directSnap.exists()) {
          resolvedUid = directSnap.id;
        } else {
          const slugSnap = await getDocs(
            query(collection(db, "users"), where("slug", "==", identifier), limit(1))
          );
          if (cancelled) return;
          if (!slugSnap.empty) resolvedUid = slugSnap.docs[0].id;
        }

        if (!resolvedUid) {
          setUid(null);
          setProfileData(null);
          setLoading(false);
          setNotFound(true);
          return;
        }

        setUid(resolvedUid);
        unsubSnapshot = onSnapshot(
          doc(db, "users", resolvedUid),
          (snap) => {
            if (cancelled) return;
            if (snap.exists()) {
              setProfileData(snap.data());
              setNotFound(false);
            } else {
              setProfileData(null);
              setNotFound(true);
            }
            setLoading(false);
          },
          () => {
            if (!cancelled) setLoading(false);
          }
        );
      } catch {
        if (!cancelled) {
          setLoading(false);
          setNotFound(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unsubSnapshot) unsubSnapshot();
    };
  }, [identifier]);

  return { uid, profileData, loading, notFound };
}
