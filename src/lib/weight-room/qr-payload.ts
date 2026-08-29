import {
  QR_PREFIX,
  STICKER_QR_KIND,
  TEMPLATE_QR_KIND,
} from "./constants";

export type WeightRoomQrKind = typeof STICKER_QR_KIND | typeof TEMPLATE_QR_KIND;

export type WeightRoomQrPayload = {
  kind: WeightRoomQrKind;
  id: string;
};

const UUID_PATTERN =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const DECODE_RE = new RegExp(
  `^${QR_PREFIX}:(${STICKER_QR_KIND}|${TEMPLATE_QR_KIND}):(${UUID_PATTERN})$`
);

export function encodeStickerPayload(id: string): string {
  return `${QR_PREFIX}:${STICKER_QR_KIND}:${id}`;
}

export function encodeTemplatePayload(id: string): string {
  return `${QR_PREFIX}:${TEMPLATE_QR_KIND}:${id}`;
}

export function decodeWeightRoomPayload(
  text: string
): WeightRoomQrPayload | null {
  const match = text.match(DECODE_RE);
  if (!match) return null;
  return {
    kind: match[1].toLowerCase() as WeightRoomQrKind,
    id: match[2].toLowerCase(),
  };
}
