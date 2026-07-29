import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Vehicle } from "@/types/vehicle";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

interface CacheEntry<T> {
  ts: number;
  data: T;
}

async function save<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { ts: Date.now(), data };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {}
}

async function load<T>(key: string, maxAgeMs = CACHE_TTL_MS): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export const VEHICLES_CACHE_KEY = "mc_vehicles_v1";
export const favoritesCacheKey = (uid: string) => `mc_favs_v1_${uid}`;

export const saveVehiclesCache = (vehicles: Vehicle[]) =>
  save(VEHICLES_CACHE_KEY, vehicles);

export const loadVehiclesCache = (): Promise<Vehicle[] | null> =>
  load<Vehicle[]>(VEHICLES_CACHE_KEY);

export const saveFavoritesCache = (uid: string, vehicles: Vehicle[]) =>
  save(favoritesCacheKey(uid), vehicles);

export const loadFavoritesCache = (uid: string): Promise<Vehicle[] | null> =>
  load<Vehicle[]>(favoritesCacheKey(uid));
