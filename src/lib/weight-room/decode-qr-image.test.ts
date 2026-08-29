import { describe, it, expect } from "vitest";
import QRCode from "qrcode";
import sharp from "sharp";
import { decodeQrFromImage, sniffImageMime } from "./decode-qr-image";
import { encodeTemplatePayload } from "./qr-payload";

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";

async function qrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: "png",
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}

describe("decodeQrFromImage", () => {
  it("reads a template payload from a PNG QR", async () => {
    const payload = encodeTemplatePayload(TEMPLATE_ID);
    const png = await qrPng(payload);

    expect(sniffImageMime(png)).toBe("image/png");
    const texts = await decodeQrFromImage(png);
    expect(texts).toContain(payload);
  });

  it("reads a template payload from a JPEG QR", async () => {
    const payload = encodeTemplatePayload(TEMPLATE_ID);
    const png = await qrPng(payload);
    const jpegBuf = await sharp(png).jpeg({ quality: 90 }).toBuffer();

    expect(sniffImageMime(jpegBuf)).toBe("image/jpeg");
    const texts = await decodeQrFromImage(jpegBuf);
    expect(texts).toContain(payload);
  });

  it("reads a template payload from a WebP QR", async () => {
    const payload = encodeTemplatePayload(TEMPLATE_ID);
    const png = await qrPng(payload);
    const webp = await sharp(png).webp({ lossless: true }).toBuffer();

    expect(sniffImageMime(webp)).toBe("image/webp");
    const texts = await decodeQrFromImage(webp);
    expect(texts).toContain(payload);
  });
});
