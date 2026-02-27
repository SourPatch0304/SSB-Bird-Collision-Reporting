import exifr from "exifr";

export interface ExifExtract {
  capturedAt?: Date;
  lat?: number;
  lng?: number;
  orientation?: number;
  make?: string;
  model?: string;
  raw: Record<string, unknown>;
}

export async function extractExifFromFile(path: string): Promise<ExifExtract> {
  const data = (await exifr.parse(path, {
    gps: true,
    tiff: true,
    exif: true,
  })) as Record<string, unknown> | null;

  if (!data) {
    return { raw: {} };
  }

  return {
    capturedAt: (data.DateTimeOriginal as Date | undefined) ?? (data.CreateDate as Date | undefined),
    lat: data.latitude as number | undefined,
    lng: data.longitude as number | undefined,
    orientation: data.Orientation as number | undefined,
    make: data.Make as string | undefined,
    model: data.Model as string | undefined,
    raw: data,
  };
}
