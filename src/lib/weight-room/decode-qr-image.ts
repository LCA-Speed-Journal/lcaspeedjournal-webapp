import jsQR from "jsqr";
import sharp from "sharp";

type RgbaImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const JPEG_MIME = "image/jpeg";
const PNG_MIME = "image/png";
const WEBP_MIME = "image/webp";

/** Longest side after decode, before jsQR. */
export const MAX_QR_DECODE_SIDE_PX = 2000;
/** Reject decompression bombs before allocating full RGBA. */
const MAX_INPUT_PIXELS = 25_000_000;

export const SCAN_IMAGE_TYPES = [JPEG_MIME, PNG_MIME, WEBP_MIME] as const;
export type ScanImageMime = (typeof SCAN_IMAGE_TYPES)[number];

export function isScanImageMime(value: string): value is ScanImageMime {
  return (SCAN_IMAGE_TYPES as readonly string[]).includes(value);
}

/** Detect jpeg/png/webp from magic bytes. Does not log bytes. */
export function sniffImageMime(buffer: Buffer): ScanImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return JPEG_MIME;
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return PNG_MIME;
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return WEBP_MIME;
  }
  return null;
}

function toClamped(data: Uint8Array | Buffer): Uint8ClampedArray {
  return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
}

async function decodeToRgba(buffer: Buffer): Promise<RgbaImage> {
  if (!sniffImageMime(buffer)) {
    throw new Error("unsupported_image");
  }

  const { data, info } = await sharp(buffer, {
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize(MAX_QR_DECODE_SIDE_PX, MAX_QR_DECODE_SIDE_PX, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: toClamped(data),
    width: info.width,
    height: info.height,
  };
}

function rotate90Cw(img: RgbaImage): RgbaImage {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const nx = height - 1 - y;
      const ny = x;
      const dst = (ny * height + nx) * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = data[src + 3];
    }
  }
  return { data: out, width: height, height: width };
}

function blackout(
  img: RgbaImage,
  location: {
    topLeftCorner: { x: number; y: number };
    topRightCorner: { x: number; y: number };
    bottomLeftCorner: { x: number; y: number };
    bottomRightCorner: { x: number; y: number };
  }
): void {
  const xs = [
    location.topLeftCorner.x,
    location.topRightCorner.x,
    location.bottomLeftCorner.x,
    location.bottomRightCorner.x,
  ];
  const ys = [
    location.topLeftCorner.y,
    location.topRightCorner.y,
    location.bottomLeftCorner.y,
    location.bottomRightCorner.y,
  ];
  const pad = 12;
  const minX = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const maxX = Math.min(img.width - 1, Math.ceil(Math.max(...xs) + pad));
  const minY = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const maxY = Math.min(img.height - 1, Math.ceil(Math.max(...ys) + pad));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
}

function crop(
  img: RgbaImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): RgbaImage {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(img.width, Math.ceil(x1));
  const bottom = Math.min(img.height, Math.ceil(y1));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcOff = ((top + y) * img.width + left) * 4;
    const dstOff = y * width * 4;
    data.set(img.data.subarray(srcOff, srcOff + width * 4), dstOff);
  }
  return { data, width, height };
}

function findQrsOnImage(img: RgbaImage, acc: Set<string>): void {
  const working: RgbaImage = {
    data: new Uint8ClampedArray(img.data),
    width: img.width,
    height: img.height,
  };
  for (let i = 0; i < 6; i++) {
    const code = jsQR(working.data, working.width, working.height, {
      inversionAttempts: "attemptBoth",
    });
    if (!code?.data) break;
    acc.add(code.data);
    blackout(working, code.location);
  }
}

function collectFromViews(img: RgbaImage, acc: Set<string>): void {
  findQrsOnImage(img, acc);
  const midX = img.width / 2;
  const midY = img.height / 2;
  const overlapX = img.width * 0.12;
  const overlapY = img.height * 0.12;
  findQrsOnImage(crop(img, 0, 0, midX + overlapX, midY + overlapY), acc);
  findQrsOnImage(crop(img, midX - overlapX, 0, img.width, midY + overlapY), acc);
  findQrsOnImage(crop(img, 0, midY - overlapY, midX + overlapX, img.height), acc);
  findQrsOnImage(crop(img, midX - overlapX, midY - overlapY, img.width, img.height), acc);
}

/**
 * Decode QR strings from a JPEG, PNG, or WebP image.
 * Tries a couple of orientations; does not deskew.
 */
export async function decodeQrFromImage(image: Buffer): Promise<string[]> {
  const base = await decodeToRgba(image);
  const found = new Set<string>();

  let oriented = base;
  for (let turn = 0; turn < 4; turn++) {
    collectFromViews(oriented, found);
    if (found.size >= 2) break;
    oriented = rotate90Cw(oriented);
  }

  return [...found];
}
