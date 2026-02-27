import ngeohash from "ngeohash";

export function computeGeohash(lat: number, lng: number): string {
  return ngeohash.encode(lat, lng, 9);
}
