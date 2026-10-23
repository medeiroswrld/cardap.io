// Runs only in the browser for a locally selected photo, before upload.
// Customers at the table are often on weak mobile data: keep menu photos light.
export const PHOTO_MAX_SIDE = 1080;
export const PHOTO_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_SELECT_MAX_MB = 15;

function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.82),
  );
}

export async function optimizePhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "Não foi possível ler a foto. Escolha outro arquivo JPG, PNG ou WebP.",
    );
  }
  try {
    const scale = Math.min(
      1,
      PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Não foi possível preparar a foto neste navegador.");
    // Transparent PNGs would turn black in the JPEG fallback.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await encode(canvas, "image/webp");
    // Browsers without WebP encoding silently return PNG; use JPEG instead.
    if (!blob || blob.type !== "image/webp")
      blob = await encode(canvas, "image/jpeg");
    if (!blob) throw new Error("Não foi possível preparar a foto.");
    const alreadyFine =
      scale === 1 &&
      blob.size >= file.size &&
      file.size <= PHOTO_UPLOAD_MAX_BYTES;
    if (alreadyFine) return file;
    if (blob.size > PHOTO_UPLOAD_MAX_BYTES)
      throw new Error("A foto continua grande demais. Escolha outra imagem.");
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `foto.${extension}`, { type: blob.type });
  } finally {
    bitmap.close();
  }
}
