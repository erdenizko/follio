const POSSIBLE_FIELDS = ["url", "image", "image_url", "result", "output", "response", "images"];

function isLikelyUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function extractResultUrls(response: unknown): string[] {
  const urls = new Set<string>();

  function visit(value: unknown) {
    if (!value) {
      return;
    }

    if (typeof value === "string") {
      if (isLikelyUrl(value)) {
        urls.add(value);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (typeof value === "object") {
      const maybeResponse = value as Record<string, unknown>;

      for (const field of POSSIBLE_FIELDS) {
        if (field in maybeResponse) {
          visit(maybeResponse[field]);
        }
      }

      for (const child of Object.values(maybeResponse)) {
        visit(child);
      }
    }
  }

  visit(response);
  return Array.from(urls);
}


