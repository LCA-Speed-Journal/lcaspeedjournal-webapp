import { describe, it, expect } from "vitest";
import {
  encodeStickerPayload,
  encodeTemplatePayload,
  decodeWeightRoomPayload,
} from "./qr-payload";

describe("qr-payload", () => {
  it("round-trips sticker and template UUIDs", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(decodeWeightRoomPayload(encodeStickerPayload(id))).toEqual({
      kind: "sticker",
      id,
    });
    expect(decodeWeightRoomPayload(encodeTemplatePayload(id))).toEqual({
      kind: "template",
      id,
    });
  });

  it("returns null for unrelated QR text", () => {
    expect(decodeWeightRoomPayload("https://example.com")).toBeNull();
    expect(decodeWeightRoomPayload("lca-wr:nope:abc")).toBeNull();
  });

  it("decodes UUID case-insensitively and returns lowercase id", () => {
    expect(
      decodeWeightRoomPayload("lca-wr:sticker:AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE")
    ).toEqual({
      kind: "sticker",
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
  });
});
