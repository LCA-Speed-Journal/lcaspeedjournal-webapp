import { describe, it, expect, vi } from "vitest";
import { extractCard } from "./extract-card";
import { encodeStickerPayload, encodeTemplatePayload } from "./qr-payload";

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const STICKER_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE = Buffer.from("fake-scan");

const movements = [
  { id: "mov-1", name: "Back Squat", set_count: 2 },
];

function deps(opts: {
  qr?: string[];
  vision?: Record<string, string>;
  decodeQr?: (image: Buffer) => Promise<string[]>;
  visionFn?: (
    image: Buffer,
    movements: { id: string; name: string; set_count: number }[]
  ) => Promise<Record<string, string>>;
}) {
  return {
    decodeQr:
      opts.decodeQr ??
      (async () => opts.qr ?? []),
    vision:
      opts.visionFn ??
      (async () => opts.vision ?? {}),
  };
}

describe("extractCard", () => {
  it("parses vision cells and needs_review when template and sticker QR are present", async () => {
    const result = await extractCard(
      { image: IMAGE, movements },
      deps({
        qr: [
          encodeTemplatePayload(TEMPLATE_ID),
          encodeStickerPayload(STICKER_ID),
        ],
        vision: { "mov-1:0": "185x5" },
      })
    );

    expect(result.status).toBe("needs_review");
    expect(result.templateId).toBe(TEMPLATE_ID);
    expect(result.stickerId).toBe(STICKER_ID);
    expect(result.stickerPayload).toBe(encodeStickerPayload(STICKER_ID));
    expect(result.error).toBeNull();
    expect(result.extraction).toEqual({ "mov-1:0": "185x5" });
    expect(result.cells["mov-1:0"]).toEqual({
      raw: "185x5",
      kind: "load_reps",
      load: 185,
      reps: 5,
      units: "lb",
    });
  });

  it("is unmatched when template QR is present and sticker QR is missing", async () => {
    const result = await extractCard(
      { image: IMAGE, movements },
      deps({
        qr: [encodeTemplatePayload(TEMPLATE_ID)],
        vision: { "mov-1:0": "185x5" },
      })
    );

    expect(result.status).toBe("unmatched");
    expect(result.templateId).toBe(TEMPLATE_ID);
    expect(result.stickerId).toBeNull();
    expect(result.stickerPayload).toBeNull();
    expect(result.cells["mov-1:0"].kind).toBe("load_reps");
  });

  it("is uploaded with unknown_template when template QR is missing", async () => {
    const vision = vi.fn(async () => ({ "mov-1:0": "185x5" }));
    const result = await extractCard(
      { image: IMAGE, movements },
      {
        decodeQr: async () => [encodeStickerPayload(STICKER_ID)],
        vision,
      }
    );

    expect(result.status).toBe("uploaded");
    expect(result.error).toBe("unknown_template");
    expect(result.templateId).toBeNull();
    expect(result.stickerId).toBe(STICKER_ID);
    expect(result.cells).toEqual({});
    expect(result.extraction).toEqual({});
    expect(vision).not.toHaveBeenCalled();
  });

  it("does not use unknown_template when a template QR is present and movements are empty", async () => {
    const vision = vi.fn(async () => ({ "mov-1:0": "185x5" }));
    const result = await extractCard(
      { image: IMAGE, movements: [] },
      {
        decodeQr: async () => [encodeTemplatePayload(TEMPLATE_ID)],
        vision,
      }
    );

    expect(result.error).not.toBe("unknown_template");
    expect(result.templateId).toBe(TEMPLATE_ID);
    expect(result.status).toBe("unmatched");
    expect(result.cells).toEqual({});
    expect(vision).not.toHaveBeenCalled();
  });

  it("leaves empty vision cells unknown and does not invent missing cells", async () => {
    const result = await extractCard(
      { image: IMAGE, movements },
      deps({
        qr: [
          encodeTemplatePayload(TEMPLATE_ID),
          encodeStickerPayload(STICKER_ID),
        ],
        vision: { "mov-1:0": "" },
      })
    );

    expect(result.status).toBe("needs_review");
    expect(result.cells["mov-1:0"].kind).toBe("unknown");
    expect(result.cells["mov-1:0"].raw).toBe("");
    expect(result.cells["mov-1:1"]).toBeUndefined();
  });

  it("records vision errors without inventing cells", async () => {
    const result = await extractCard(
      { image: IMAGE, movements },
      {
        decodeQr: async () => [
          encodeTemplatePayload(TEMPLATE_ID),
          encodeStickerPayload(STICKER_ID),
        ],
        vision: async () => {
          throw new Error("vision timeout");
        },
      }
    );

    expect(result.status).toBe("uploaded");
    expect(result.error).toBe("vision timeout");
    expect(result.cells).toEqual({});
    expect(result.extraction).toEqual({});
    expect(result.templateId).toBe(TEMPLATE_ID);
    expect(result.stickerId).toBe(STICKER_ID);
  });
});
