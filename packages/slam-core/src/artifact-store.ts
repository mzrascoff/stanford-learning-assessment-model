import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface StoreArtifactInput {
  tenantId: string;
  assessmentId: string;
  sessionId: string;
  name: string;
  mimeType: string;
  contentBase64: string;
}

export interface StoredArtifact {
  storageKind: "local" | "s3";
  objectKey: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  textPreview: string;
}

export interface ArtifactStore {
  saveArtifact(input: StoreArtifactInput): Promise<StoredArtifact>;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function buildArtifactTextPreview(mimeType: string, contentBase64: string): { textPreview: string; sizeBytes: number } {
  const buffer = Buffer.from(contentBase64, "base64");
  if (/^(text\/|application\/(json|xml|javascript))/i.test(mimeType)) {
    return {
      textPreview: buffer.toString("utf8").slice(0, 3000),
      sizeBytes: buffer.byteLength
    };
  }

  return {
    textPreview: `Binary artifact uploaded (${buffer.byteLength} bytes, ${mimeType}).`,
    sizeBytes: buffer.byteLength
  };
}

export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly rootDir: string) {}

  async saveArtifact(input: StoreArtifactInput): Promise<StoredArtifact> {
    const { textPreview, sizeBytes } = buildArtifactTextPreview(input.mimeType, input.contentBase64);
    const objectKey = join(
      input.tenantId,
      input.assessmentId,
      input.sessionId,
      `${randomUUID()}-${safeName(input.name)}`
    );
    const filePath = resolve(this.rootDir, objectKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(input.contentBase64, "base64"));

    return {
      storageKind: "local",
      objectKey,
      name: input.name,
      mimeType: input.mimeType,
      sizeBytes,
      textPreview
    };
  }
}

export interface S3ArtifactStoreOptions {
  bucket: string;
  region?: string;
  keyPrefix?: string;
}

export class S3ArtifactStore implements ArtifactStore {
  private readonly client: S3Client;
  private readonly keyPrefix: string;

  constructor(private readonly options: S3ArtifactStoreOptions) {
    this.client = new S3Client({
      region: options.region
    });
    this.keyPrefix = options.keyPrefix ?? "artifacts";
  }

  async saveArtifact(input: StoreArtifactInput): Promise<StoredArtifact> {
    const { textPreview, sizeBytes } = buildArtifactTextPreview(input.mimeType, input.contentBase64);
    const objectKey = [
      this.keyPrefix,
      input.tenantId,
      input.assessmentId,
      input.sessionId,
      `${randomUUID()}-${safeName(input.name)}`
    ].join("/");

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
        Body: Buffer.from(input.contentBase64, "base64"),
        ContentType: input.mimeType
      })
    );

    return {
      storageKind: "s3",
      objectKey,
      name: input.name,
      mimeType: input.mimeType,
      sizeBytes,
      textPreview
    };
  }
}

export interface CreateArtifactStoreOptions {
  dataDir: string;
  storageMode?: "local" | "s3";
  s3Bucket?: string;
  s3Region?: string;
  s3KeyPrefix?: string;
}

export function createArtifactStore(options: CreateArtifactStoreOptions): ArtifactStore {
  if (options.storageMode === "s3") {
    if (!options.s3Bucket) {
      throw new Error("SLAM_ARTIFACT_S3_BUCKET is required when SLAM_ARTIFACT_STORAGE=s3.");
    }
    return new S3ArtifactStore({
      bucket: options.s3Bucket,
      region: options.s3Region,
      keyPrefix: options.s3KeyPrefix
    });
  }

  return new LocalArtifactStore(resolve(options.dataDir, "artifacts"));
}
