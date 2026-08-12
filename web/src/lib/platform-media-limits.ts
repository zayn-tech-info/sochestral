import type { ConnectorPlatform } from "@/lib/product-api";

/** Image count limits for calendar create (official API carousel / multi-image caps). */
export type PlatformImageLimits = {
  min: number;
  max: number;
};

/**
 * Instagram Graph: carousel 1–10 (single image counts as 1; IG feed requires media).
 * Threads: text-only allowed; carousel 2–20, single image allowed as 1.
 * LinkedIn Personal: text-only allowed; multi-image posts up to 20 images.
 */
export const PLATFORM_IMAGE_LIMITS: Record<
  ConnectorPlatform,
  PlatformImageLimits
> = {
  instagram: { min: 1, max: 10 },
  threads: { min: 0, max: 20 },
  linkedin_personal: { min: 0, max: 20 },
};

export function platformImageLimits(
  platform: ConnectorPlatform,
): PlatformImageLimits {
  return PLATFORM_IMAGE_LIMITS[platform];
}

export function mediaCountOk(
  platform: ConnectorPlatform,
  count: number,
): boolean {
  const { min, max } = platformImageLimits(platform);
  return count >= min && count <= max;
}
