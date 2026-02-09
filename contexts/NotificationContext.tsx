import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

type NotificationContextType = {
  unreadMessagesCount: number;
  unreadLikesCount: number; // For "Interesados"
  unreadMatchesCount: number; // For "Matches"
  totalUnreadCount: number;
  markNotificationsAsSeen: () => Promise<void>; // Deprecated or mapped to markAsRead
  markNotificationsAsRead: () => Promise<void>; // New: updates notificationsReadAt
  clearNotifications: () => Promise<void>; // New: updates notificationsClearedAt
  markLikesAsSeen: () => Promise<void>;
  markMatchesAsSeen: () => Promise<void>;
  lastSeenAt: any; // Used for "Read" status
  clearedAt: any; // Used for "Clear" status
};

const NotificationContext = createContext<NotificationContextType>({
  unreadMessagesCount: 0,
  unreadLikesCount: 0,
  unreadMatchesCount: 0,
  totalUnreadCount: 0,
  markNotificationsAsSeen: async () => {},
  markNotificationsAsRead: async () => {},
  clearNotifications: async () => {},
  markLikesAsSeen: async () => {},
  markMatchesAsSeen: async () => {},
  lastSeenAt: null,
  clearedAt: null,
});

export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  // Removed explicit state for derived counts to avoid redeclaration error
  const [totalLikesCount, setTotalLikesCount] = useState(0);
  const [totalMatchesCount, setTotalMatchesCount] = useState(0);
  const [seenLikesCount, setSeenLikesCount] = useState(0);
  const [seenMatchesCount, setSeenMatchesCount] = useState(0);
  const [lastSeenAt, setLastSeenAt] = useState<any>(null);
  const [clearedAt, setClearedAt] = useState<any>(null);

  // 1. Listen to User's stats (seen counts)
  useEffect(() => {
    if (!user) {
      setLastSeenAt(null);
      setClearedAt(null);
      setSeenLikesCount(0);
      setSeenMatchesCount(0);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.data() as any;
      setLastSeenAt(data?.notificationsLastSeenAt || null); // Used as "Read At"
      setClearedAt(data?.notificationsClearedAt || null);   // Used as "Cleared At"
      setSeenLikesCount(data?.seenLikesCount || 0);
      setSeenMatchesCount(data?.seenMatchesCount || 0);
    }, () => {
        setLastSeenAt(null);
        setClearedAt(null);
        setSeenLikesCount(0);
        setSeenMatchesCount(0);
    });
    return () => unsub();
  }, [user]);

  // 2. Listen to Unread Messages
  useEffect(() => {
    if (!user) {
      setUnreadMessagesCount(0);
      return;
    }
    const q = query(collection(db, "conversations"), where("members", "array-contains", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      let count = 0;
      snap.forEach((d) => {
        const data = d.data() as any;
        if (data.deletedBy && Array.isArray(data.deletedBy) && data.deletedBy.includes(user.uid)) return;

        // Check readBy array
        const isUnread = data.lastSenderId !== user.uid && (!data.readBy || !Array.isArray(data.readBy) || !data.readBy.includes(user.uid));
        if (isUnread) {
            count++;
        }
      });
      setUnreadMessagesCount(count);
    }, () => setUnreadMessagesCount(0));
    return () => unsub();
  }, [user]);

  // 3. Listen to Likes & Matches (Global Calculation)
  useEffect(() => {
    if (!user) {
      setTotalLikesCount(0);
      setTotalMatchesCount(0);
      return;
    }

    // A. Listen to My Favorites (Who I liked) - needed for Matches
    let ownersILiked = new Map<string, Set<string>>(); // OwnerID -> Set(VehicleIDs)
    const favRef = collection(db, "users", user.uid, "favorites");
    const unsubFav = onSnapshot(favRef, (snap) => {
      const owners = new Map<string, Set<string>>();
      snap.forEach((d) => {
        const data = d.data() as any;
        const ownerUid = data?.vehicleOwnerId;
        const vid = data?.vehicleId || d.id;
        if (!ownerUid || !vid) return;
        if (ownerUid === user.uid) return;
        const set = owners.get(ownerUid) || new Set<string>();
        set.add(String(vid));
        owners.set(ownerUid, set);
      });
      ownersILiked = owners;
      recalc();
    });

    // B. Listen to My Vehicles (Who liked me) - needed for Likes & Matches
    let likersOfMine = new Map<string, Set<string>>(); // LikerID -> Set(VehicleIDs)
    let myTotalLikes = 0;
    
    const ownRef = query(collection(db, "vehicles"), where("userId", "==", user.uid));
    const unsubOwn = onSnapshot(ownRef, (snap) => {
        const likers = new Map<string, Set<string>>();
        let likesCount = 0;
        
        snap.forEach((d) => {
            const data: any = d.data();
            const likedBy: string[] = Array.isArray(data?.likedBy) ? data.likedBy : [];
            // Filter out self-likes just in case, though UI prevents it
            const validLikers = likedBy.filter(uid => uid !== user.uid);
            likesCount += validLikers.length;

            validLikers.forEach((uid: string) => {
                const set = likers.get(uid) || new Set<string>();
                set.add(d.id);
                likers.set(uid, set);
            });
        });
        likersOfMine = likers;
        myTotalLikes = likesCount;
        recalc();
    });

    function recalc() {
        // Update Total Likes
        setTotalLikesCount(myTotalLikes);

        // Update Total Matches
        // Match = Intersection of likersOfMine and ownersILiked
        let matches = 0;
        const processedPairs = new Set<string>();

        // Iterate through everyone who liked me
        likersOfMine.forEach((myVehiclesSet, userId) => {
            // Check if I also liked any of their vehicles
            if (ownersILiked.has(userId)) {
                // It's a match! 
                // We count unique user-pairs or unique vehicle-pairs? 
                // Matches tab lists "Users". 
                // Let's count unique USERS as matches for the badge.
                matches++; 
            }
        });
        setTotalMatchesCount(matches);
    }

    return () => {
        unsubFav();
        unsubOwn();
    };
  }, [user]);

  const markNotificationsAsRead = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { notificationsLastSeenAt: serverTimestamp() }, { merge: true });
      setLastSeenAt({ toMillis: () => Date.now() }); 
    } catch (e) {
      console.error(e);
    }
  };

  const markNotificationsAsSeen = markNotificationsAsRead; // Alias for backward compatibility

  const clearNotifications = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { notificationsClearedAt: serverTimestamp() }, { merge: true });
      setClearedAt({ toMillis: () => Date.now() }); 
    } catch (e) {
      console.error(e);
    }
  };

  const markLikesAsSeen = async () => {
    if (!user) return;
    try {
        await setDoc(doc(db, "users", user.uid), { seenLikesCount: totalLikesCount }, { merge: true });
        setSeenLikesCount(totalLikesCount);
    } catch(e) { console.error(e); }
  };

  const markMatchesAsSeen = async () => {
    if (!user) return;
    try {
        await setDoc(doc(db, "users", user.uid), { seenMatchesCount: totalMatchesCount }, { merge: true });
        setSeenMatchesCount(totalMatchesCount);
    } catch(e) { console.error(e); }
  };

  // Calculate badges
  // If we have more likes than last time we saw, show badge.
  // Note: if totalLikes decreases (unlike), this logic still works (0).
  const unreadLikesCount = Math.max(0, totalLikesCount - seenLikesCount);
  const unreadMatchesCount = Math.max(0, totalMatchesCount - seenMatchesCount);
  
  const totalUnreadCount = unreadMessagesCount + unreadLikesCount + unreadMatchesCount;

  return (
    <NotificationContext.Provider value={{
      unreadMessagesCount,
      unreadLikesCount,
      unreadMatchesCount,
      totalUnreadCount,
      markNotificationsAsSeen,
      markNotificationsAsRead,
      clearNotifications,
      markLikesAsSeen,
      markMatchesAsSeen,
      lastSeenAt,
      clearedAt
    }}>
      {children}
    </NotificationContext.Provider>
  );
}
