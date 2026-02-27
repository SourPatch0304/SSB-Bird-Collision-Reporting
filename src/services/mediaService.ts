import path from "node:path";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { StorageAdapter } from "../adapters/storage/storageAdapter";
import { extractExifFromFile } from "./exifService";

export const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png"];

export function validateMediaCount(numMedia: number): { valid: boolean; message?: string } {
  if (numMedia === 0) return { valid: false, message: "Please send at least one photo." };
  if (numMedia > 5) return { valid: false, message: "Please send up to 5 photos." };
  return { valid: true };
}

export function validateMediaType(contentType: string): { valid: boolean; message?: string } {
  if (!ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase())) {
    return { valid: false, message: "Please send JPEG or PNG images only." };
  }
  return { valid: true };
}

export function validateMediaSize(bytes: number, maxBytes: number): { valid: boolean; message?: string } {
  if (bytes > maxBytes) {
    return {
      valid: false,
      message: `One of the photos is too large. Please keep each image under ${maxBytes} bytes.`,
    };
  }
  return { valid: true };
}

export interface IncomingMedia {
  mediaUrl: string;
  contentType: string;
  mediaSid?: string;
}

export interface SavedMedia {
  id: string;
  contentType: string;
  bytes: number;
  exifCapturedAt?: Date;
  exifLat?: number;
  exifLng?: number;
}

export class MediaService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageAdapter,
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly maxMediaBytes: number,
  ) {}

  async downloadAndStoreForReport(reportId: string, mediaItems: IncomingMedia[]): Promise<SavedMedia[]> {
    const saved: SavedMedia[] = [];

    for (let i = 0; i < mediaItems.length; i += 1) {
      const media = mediaItems[i];
      const typeValidation = validateMediaType(media.contentType);
      if (!typeValidation.valid) {
        throw new Error(typeValidation.message);
      }

      const response = await axios.get(media.mediaUrl, {
        responseType: "stream",
        auth: {
          username: this.accountSid,
          password: this.authToken,
        },
        maxRedirects: 5,
      });

      const headerBytes = Number(response.headers["content-length"] ?? 0);
      if (headerBytes > 0) {
        const sizeCheck = validateMediaSize(headerBytes, this.maxMediaBytes);
        if (!sizeCheck.valid) {
          throw new Error(sizeCheck.message);
        }
      }

      const extension = media.contentType === "image/png" ? "png" : "jpg";
      const stored = await this.storage.saveMedia({
        reportId,
        filename: `media-${Date.now()}-${i}.${extension}`,
        stream: response.data,
      });

      const sizeCheck = validateMediaSize(stored.bytes, this.maxMediaBytes);
      if (!sizeCheck.valid) {
        throw new Error(sizeCheck.message);
      }

      const exif = await extractExifFromFile(stored.storedPath);

      const created = await this.prisma.media.create({
        data: {
          reportId,
          twilioMediaSid: media.mediaSid,
          contentType: media.contentType,
          originalUrl: media.mediaUrl,
          storedPath: path.resolve(stored.storedPath),
          bytes: stored.bytes,
          exifJson: exif.raw as any,
          exifMake: exif.make,
          exifModel: exif.model,
          exifLat: exif.lat,
          exifLng: exif.lng,
          exifCapturedAt: exif.capturedAt,
        },
      });

      saved.push({
        id: created.id,
        contentType: created.contentType,
        bytes: created.bytes,
        exifCapturedAt: created.exifCapturedAt ?? undefined,
        exifLat: created.exifLat ?? undefined,
        exifLng: created.exifLng ?? undefined,
      });
    }

    return saved;
  }
}
