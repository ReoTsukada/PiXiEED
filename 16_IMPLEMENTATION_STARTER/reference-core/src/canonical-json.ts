function normalize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot encode non-finite numbers.");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (value instanceof Uint8Array) {
    return {
      $type: "Uint8Array",
      data: Array.from(value),
    };
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    const input = value as Record<string, unknown>;

    for (const key of Object.keys(input).sort()) {
      const child = input[key];
      if (child !== undefined) {
        output[key] = normalize(child);
      }
    }

    return output;
  }

  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
