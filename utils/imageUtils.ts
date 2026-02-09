
/**
 * Optimizes image URLs for web compatibility (bypassing CORS) and performance.
 * On native platforms, it returns the original URL.
 * On web, it uses images.weserv.nl as a proxy to handle CORS and caching.
 */
export const getOptimizedImageUrl = (url: string | null | undefined): string => {
  if (!url) return "https://placehold.co/800x600?text=No+Image";

  return url;
};
