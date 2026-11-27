// Cache s odpovedmi API pro rezim offline (viz src/sw.js, NetworkFirst pro GET /api/).
export const API_CACHE_NAME = "fq-api-cache";

export function clearOfflineApiCache() {
  try {
    if (typeof caches !== "undefined") {
      caches.delete(API_CACHE_NAME);
    }
  } catch {
    // Cache neni dostupna (napr. soukromy rezim) - nic k mazani.
  }
}
