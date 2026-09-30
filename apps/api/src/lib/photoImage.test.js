import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BadImageError,
  readExifOrientation,
  sniffImageType,
  stripImageMetadata,
} from './photoImage.js';
import { SECRET, makeJpeg, makePng, makeWebp } from './testImages.js';

const has = (buf, text) => buf.includes(Buffer.from(text, 'latin1'));

test('the type is decided from the bytes, not a name or a claimed type', () => {
  assert.equal(sniffImageType(makeJpeg()), 'image/jpeg');
  assert.equal(sniffImageType(makePng()), 'image/png');
  assert.equal(sniffImageType(makeWebp()), 'image/webp');
  assert.equal(sniffImageType(Buffer.from('%PDF-1.7\n1 0 obj << >> endobj')), null);
  assert.equal(sniffImageType(Buffer.from('just some text, renamed to photo.jpg')), null);
  assert.equal(sniffImageType(Buffer.from('GIF89a......')), null);
  assert.equal(sniffImageType(Buffer.alloc(0)), null);
});

test('JPEG: location, XMP and comments are removed; the picture and its way-up stay', () => {
  const input = makeJpeg({ orientation: 6 });
  assert.ok(has(input, SECRET));
  const out = stripImageMetadata(input, 'image/jpeg');
  assert.equal(has(out, SECRET), false);
  assert.equal(has(out, 'ns.adobe.com'), false);
  assert.equal(sniffImageType(out), 'image/jpeg');
  // The picture data (from the start-of-scan marker to the end) is untouched.
  const scan = input.subarray(input.indexOf(Buffer.from([0xff, 0xda])));
  assert.ok(out.subarray(out.length - scan.length).equals(scan));
  // The only EXIF left is the tiny rebuilt orientation block.
  const app1 = out.indexOf(Buffer.from([0xff, 0xe1]));
  assert.ok(app1 > 0);
  const len = out.readUInt16BE(app1 + 2);
  assert.equal(readExifOrientation(out.subarray(app1 + 4, app1 + 2 + len)), 6);
  // Stripping again changes nothing.
  assert.ok(stripImageMetadata(out, 'image/jpeg').equals(out));
});

test('JPEG: an upright photo keeps no EXIF at all', () => {
  const out = stripImageMetadata(makeJpeg({ orientation: 1 }), 'image/jpeg');
  assert.equal(out.indexOf(Buffer.from([0xff, 0xe1])), -1);
});

test('PNG: text, EXIF and time chunks are removed', () => {
  const input = makePng();
  const out = stripImageMetadata(input, 'image/png');
  assert.equal(has(out, SECRET), false);
  for (const type of ['tEXt', 'eXIf', 'iTXt']) assert.equal(has(out, type), false);
  for (const type of ['IHDR', 'IDAT', 'IEND']) assert.ok(has(out, type));
  assert.equal(sniffImageType(out), 'image/png');
});

test('WebP: EXIF and XMP chunks are removed, their flags cleared and the size fixed', () => {
  const out = stripImageMetadata(makeWebp(), 'image/webp');
  assert.equal(has(out, SECRET), false);
  assert.equal(has(out, 'EXIF'), false);
  assert.equal(has(out, 'XMP '), false);
  assert.equal(out.readUInt32LE(4), out.length - 8);
  const vp8x = out.indexOf(Buffer.from('VP8X', 'latin1'));
  assert.equal(out[vp8x + 8] & 0x0c, 0);
  assert.ok(has(out, 'VP8L'));
});

test('a file with the right first bytes but a broken inside is refused', () => {
  const jpegHead = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x40]), Buffer.from('short')]);
  assert.throws(() => stripImageMetadata(jpegHead, 'image/jpeg'), BadImageError);
  const png = makePng();
  assert.throws(() => stripImageMetadata(png.subarray(0, png.length - 20), 'image/png'), BadImageError);
  const webp = makeWebp();
  webp.writeUInt32LE(9999, 16); // first chunk claims to be far bigger than the file
  assert.throws(() => stripImageMetadata(webp, 'image/webp'), BadImageError);
  // A JPEG with no picture data in it.
  assert.throws(() => stripImageMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0]), 'image/jpeg'), BadImageError);
});
