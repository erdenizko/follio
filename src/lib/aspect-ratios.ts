export type AspectRatioPreset = {
  id: string;
  label: string;
  aspectRatio: string;
};

export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  { id: "3_4", label: "3:4 (Portrait)", aspectRatio: "3:4" },
  { id: "4_3", label: "4:3 (Portrait)", aspectRatio: "4:3" },
  { id: "4_5", label: "4:5 (Portrait)", aspectRatio: "4:5" },
  { id: "5_4", label: "5:4 (Portrait)", aspectRatio: "5:4" },
  { id: "yt_thumbnail", label: "YouTube Thumbnail (16:9)", aspectRatio: "16:9" },
  { id: "ig_post_square", label: "Instagram Post Square (1:1)", aspectRatio: "1:1" },
  { id: "ig_post_portrait", label: "Instagram Post Portrait (4:5)", aspectRatio: "4:5" },
  { id: "ig_story", label: "Tiktok / Instagram Reels (9:16)", aspectRatio: "9:16" },
];

export const DEFAULT_ASPECT_RATIO_ID = "4_3";

export const CUSTOM_ASPECT_RATIO_ID = "custom";

export function simplifyAspectRatio(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    throw new Error("Width and height must be positive.");
  }

  const gcd = (a: number, b: number): number => {
    return b === 0 ? Math.abs(a) : gcd(Math.abs(b), Math.abs(a) % Math.abs(b));
  };

  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

export function resolveAspectRatioString(
  aspectRatioId: string,
  customDimensions?: { width: number; height: number } | null,
) {
  if (aspectRatioId === CUSTOM_ASPECT_RATIO_ID) {
    if (!customDimensions) {
      throw new Error("Custom dimensions are required for custom aspect ratios.");
    }

    return simplifyAspectRatio(customDimensions.width, customDimensions.height);
  }

  const preset = ASPECT_RATIO_PRESETS.find((preset) => preset.id === aspectRatioId);
  if (!preset) {
    throw new Error(`Unknown aspect ratio preset: ${aspectRatioId}`);
  }

  return preset.aspectRatio;
}

