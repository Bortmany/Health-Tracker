// Checking and cleaning an uploaded photo, by looking at the bytes themselves.
//
// sniffImageType: which kind of picture this really is (JPEG, PNG or WebP),
// decided from the file's first bytes — never from its name or the type the
// browser claimed.
//
// stripImageMetadata: removes the hidden extras a camera or phone writes into
// the file — location (GPS), device details, dates, editing history and text
// notes — while keeping the picture itself untouched. Small and hand-written so
// there's nothing native to install:
//   - JPEG: drops APP1 (EXIF and XMP), APP13 (Photoshop/IPTC) and comments.
//     Anything after the end-of-image marker (motion-photo trailers) is cut off.
//     The one EXIF detail kept is which way up the photo is (orientation),
//     rebuilt as a tiny fresh block, so phone photos don't turn sideways.
//   - PNG: drops eXIf, tEXt, zTXt, iTXt and tIME chunks.
//   - WebP: drops EXIF and XMP chunks and clears their flags.
// A file whose structure doesn't add up throws, and is refused as not a photo.

export class BadImageError extends Error {
  constructor(message = 'Not a readable image') {
    super(message);
    this.name = 'BadImageError';
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sniffImageType(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function stripImageMetadata(bytes, type) {
  if (type === 'image/jpeg') return stripJpeg(bytes);
  if (type === 'image/png') return stripPng(bytes);
  if (type === 'image/webp') return stripWebp(bytes);
  throw new BadImageError('Unsupported type');
}

// ---- JPEG ------------------------------------------------------------------

// Markers with no length field after them.
function jpegStandalone(marker) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
}

// Reads the orientation (1-8) from an EXIF APP1 body, or null.
export function readExifOrientation(body) {
  try {
    if (body.toString('latin1', 0, 6) !== 'Exif\0\0') return null;
    const tiff = body.subarray(6);
    const order = tiff.toString('latin1', 0, 2);
    if (order !== 'II' && order !== 'MM') return null;
    const le = order === 'II';
    const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
    const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
    if (u16(2) !== 42) return null;
    const ifd = u32(4);
    const count = u16(ifd);
    for (let i = 0; i < count; i += 1) {
      const entry = ifd + 2 + i * 12;
      if (u16(entry) === 0x0112) {
        const value = u16(entry + 8);
        return value >= 1 && value <= 8 ? value : null;
      }
    }
  } catch {
    // Out-of-range reads mean a broken EXIF block: just ignore it.
  }
  return null;
}

// A minimal APP1 segment holding nothing but the orientation.
function orientationSegment(orientation) {
  const body = Buffer.concat([
    Buffer.from('Exif\0\0', 'latin1'),
    Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]), // big-endian TIFF, IFD at 8
    Buffer.from([0x00, 0x01]), // one entry
    Buffer.from([0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00]),
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // no next IFD
  ]);
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = 0xe1;
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

function stripJpeg(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new BadImageError();
  const kept = [];
  let orientation = null;
  let sawScan = false;
  let sawEnd = false;
  let pos = 2;
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) throw new BadImageError();
    // Fill bytes (extra 0xFF) are allowed between segments.
    let markerPos = pos + 1;
    while (markerPos < bytes.length && bytes[markerPos] === 0xff) markerPos += 1;
    if (markerPos >= bytes.length) throw new BadImageError();
    const marker = bytes[markerPos];
    const segStart = markerPos - 1;

    if (marker === 0xd9) {
      // End of image: anything after this (a phone's motion-photo video, a
      // second JPEG, leftover bytes) is dropped, since it can carry its own
      // location data.
      kept.push(bytes.subarray(segStart, markerPos + 1));
      sawEnd = true;
      pos = markerPos + 1;
      break;
    }
    if (jpegStandalone(marker)) {
      kept.push(bytes.subarray(segStart, markerPos + 1));
      pos = markerPos + 1;
      continue;
    }
    if (markerPos + 2 >= bytes.length) throw new BadImageError();
    const length = bytes.readUInt16BE(markerPos + 1);
    const end = markerPos + 1 + length;
    if (length < 2 || end > bytes.length) throw new BadImageError();

    if (marker === 0xda) {
      // Start of the picture data. Keep the scan header and the coded data
      // after it as is. Inside that data a 0xFF is always followed by 0x00
      // (a stuffed byte), 0xD0-0xD7 (a restart marker) or another 0xFF; the
      // first other marker is the next header (progressive photos have
      // several scans) or the real end of image.
      let scanEnd = end;
      while (scanEnd < bytes.length) {
        if (bytes[scanEnd] === 0xff) {
          const next = bytes[scanEnd + 1];
          if (next === undefined) break;
          if (next !== 0x00 && next !== 0xff && !(next >= 0xd0 && next <= 0xd7)) break;
          scanEnd += next === 0xff ? 1 : 2;
        } else {
          scanEnd += 1;
        }
      }
      if (scanEnd >= bytes.length) throw new BadImageError();
      kept.push(bytes.subarray(segStart, scanEnd));
      sawScan = true;
      pos = scanEnd;
      continue;
    }

    const body = bytes.subarray(markerPos + 3, end);
    if (marker === 0xe1) {
      orientation = orientation ?? readExifOrientation(body);
    } else if (marker !== 0xed && marker !== 0xfe) {
      kept.push(bytes.subarray(segStart, end));
    }
    pos = end;
  }
  // A JPEG with no picture data in it isn't a photo.
  if (!sawScan || !sawEnd) throw new BadImageError();

  const head = [bytes.subarray(0, 2)];
  if (orientation && orientation !== 1) head.push(orientationSegment(orientation));
  return Buffer.concat([...head, ...kept]);
}

// ---- PNG -------------------------------------------------------------------

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(bytes) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new BadImageError();
  const kept = [bytes.subarray(0, 8)];
  let pos = 8;
  let sawEnd = false;
  while (pos < bytes.length) {
    if (pos + 12 > bytes.length) throw new BadImageError();
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString('latin1', pos + 4, pos + 8);
    const end = pos + 12 + length;
    if (end > bytes.length) throw new BadImageError();
    if (!PNG_DROP.has(type)) kept.push(bytes.subarray(pos, end));
    pos = end;
    if (type === 'IEND') {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) throw new BadImageError();
  return Buffer.concat(kept);
}

// ---- WebP ------------------------------------------------------------------

const WEBP_DROP = new Set(['EXIF', 'XMP ']);
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function stripWebp(bytes) {
  if (bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WEBP') {
    throw new BadImageError();
  }
  const riffEnd = Math.min(bytes.length, 8 + bytes.readUInt32LE(4));
  const kept = [];
  let pos = 12;
  while (pos < riffEnd) {
    if (pos + 8 > riffEnd) throw new BadImageError();
    const fourcc = bytes.toString('latin1', pos, pos + 4);
    const size = bytes.readUInt32LE(pos + 4);
    const padded = size + (size % 2);
    const end = pos + 8 + padded;
    if (pos + 8 + size > riffEnd) throw new BadImageError();
    if (!WEBP_DROP.has(fourcc)) {
      const chunk = Buffer.from(bytes.subarray(pos, Math.min(end, riffEnd)));
      if (fourcc === 'VP8X' && size >= 1) {
        chunk[8] &= ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG) & 0xff;
      }
      kept.push(chunk);
    }
    pos = end;
  }
  const bodyChunks = Buffer.concat(kept);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + bodyChunks.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, bodyChunks]);
}
