const texasCities = ["austin", "dallas", "houston", "san antonio", "fort worth", "el paso"];

export function extractCityStateFromText(text: string): { city?: string; state?: string } {
  const normalized = text.toLowerCase();
  const city = texasCities.find((candidate) => normalized.includes(candidate));
  return {
    city: city ? city.split(" ").map((v) => v[0].toUpperCase() + v.slice(1)).join(" ") : undefined,
    state: city ? "TX" : undefined,
  };
}

export function parseBooleanLike(text: string): boolean | null {
  const value = text.trim().toLowerCase();
  if (["yes", "y", "true"].includes(value)) return true;
  if (["no", "n", "false"].includes(value)) return false;
  return null;
}

export function normalizeStopMessage(body: string): boolean {
  const token = body.trim().toUpperCase();
  return token === "STOP" || token === "CANCEL" || token === "UNSUBSCRIBE";
}
