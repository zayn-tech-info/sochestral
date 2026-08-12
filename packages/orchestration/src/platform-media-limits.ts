import type { ConnectorPlatform } from "./connectors.js";

/** Image count limits aligned with platform publish APIs. */
export const PLATFORM_IMAGE_LIMITS: Record<
  ConnectorPlatform,
  { min: number; max: number }
> = {
  instagram: { min: 1, max: 10 },
  threads: { min: 0, max: 20 },
  linkedin_personal: { min: 0, max: 20 },
};

export function platformImageLimits(platform: ConnectorPlatform): {
  min: number;
  max: number;
} {
  return PLATFORM_IMAGE_LIMITS[platform];
}
