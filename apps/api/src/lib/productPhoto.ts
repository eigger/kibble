import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { deleteUploadedFile, UPLOAD_DIR } from "./uploads.js";

const PRODUCT_PHOTO_SUBDIR = "products";
const MAX_EDGE = 1000;

export class InvalidProductPhotoError extends Error {
  constructor() {
    super("INVALID_PRODUCT_PHOTO");
    this.name = "InvalidProductPhotoError";
  }
}

export async function saveProductPhoto(
  productId: string,
  buffer: Buffer,
  previousPath: string | null,
): Promise<string> {
  const dir = path.join(UPLOAD_DIR, PRODUCT_PHOTO_SUBDIR);
  await mkdir(dir, { recursive: true });

  const safeId = productId.replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `${safeId ? `${safeId}-` : ""}${randomUUID()}.webp`;
  const relativePath = `${PRODUCT_PHOTO_SUBDIR}/${filename}`;
  const outPath = path.join(UPLOAD_DIR, relativePath);

  try {
    await sharp(buffer)
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(outPath);
  } catch {
    throw new InvalidProductPhotoError();
  }

  if (previousPath) await deleteUploadedFile(previousPath);

  return relativePath;
}

export function productPhotoAbsolutePath(relativePath: string): string {
  const normalized = path.normalize(relativePath);
  const abs = path.resolve(UPLOAD_DIR, normalized);
  const uploadRoot = path.resolve(UPLOAD_DIR);
  if (abs !== uploadRoot && !abs.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new Error("PATH_ESCAPE");
  }
  return abs;
}

export async function removeProductPhoto(relativePath: string | null): Promise<void> {
  if (!relativePath) return;
  await deleteUploadedFile(relativePath);
}
