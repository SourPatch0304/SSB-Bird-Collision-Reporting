export interface SaveMediaInput {
  reportId: string;
  filename: string;
  stream: NodeJS.ReadableStream;
}

export interface SaveMediaResult {
  storedPath: string;
  bytes: number;
}

export interface StorageAdapter {
  saveMedia(input: SaveMediaInput): Promise<SaveMediaResult>;
}
