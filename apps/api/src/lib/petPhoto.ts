import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { deleteUploadedFile, UPLOAD_DIR } from "./uploads.js";

const PET_PHOTO_SUBDIR = "pets";
const MAX_EDGE = 800;

export async function savePetPhoto(
  petId: string,
  buffer: Buffer,
  previousPath: string | null,
): Promise<string> {
  const dir = path.join(UPLOAD_DIR, PET_PHOTO_SUBDIR);
  await mkdir(dir, { recursive: true });

  const filename = `${petId}-${randomUUID()}.webp`;
  const relativePath = `${PET_PHOTO_SUBDIR}/${filename}`;
  const outPath = path.join(UPLOAD_DIR, relativePath);

  await sharp(buffer)
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(outPath);

  if (previousPath) await deleteUploadedFile(previousPath);

  return relativePath;
}

export function petPhotoAbsolutePath(relativePath: string): string {
  const safe = relativePath.replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(UPLOAD_DIR, safe);
}

export async function removePetPhoto(relativePath: string | null): Promise<void> {
  if (!relativePath) return;
  await deleteUploadedFile(relativePath);
}
