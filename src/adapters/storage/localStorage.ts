import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { StorageAdapter, SaveMediaInput, SaveMediaResult } from "./storageAdapter";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir: string) {}

  async saveMedia(input: SaveMediaInput): Promise<SaveMediaResult> {
    const reportDir = path.join(this.baseDir, input.reportId);
    await fs.promises.mkdir(reportDir, { recursive: true });
    const absolutePath = path.join(reportDir, input.filename);

    const writer = fs.createWriteStream(absolutePath);
    await pipeline(input.stream, writer);

    const stats = await fs.promises.stat(absolutePath);
    return {
      storedPath: absolutePath,
      bytes: stats.size,
    };
  }
}
