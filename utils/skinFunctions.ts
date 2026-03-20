/* eslint-disable no-bitwise, no-continue */
import { unzip } from "utils/zipFunctions";
import { bufferToUrl } from "utils/functions";

export type SkinCssVars = Record<string, string>;

// Parse Windows INI-style text into sections
const parseIni = (text: string): Record<string, Record<string, string>> => {
  const result: Record<string, Record<string, string>> = {};
  let currentSection = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith(";") || line.startsWith("#")) continue;

    if (line.startsWith("[") && line.includes("]")) {
      currentSection = line.slice(1, line.indexOf("]")).trim();
      result[currentSection] ??= {};
    } else if (currentSection && line.includes("=")) {
      const eqIndex = line.indexOf("=");
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      result[currentSection][key] = value;
    }
  }

  return result;
};

// Decode a TGA image buffer to a PNG data URL via canvas
const decodeTgaToCanvas = (
  buffer: Uint8Array
): HTMLCanvasElement | undefined => {
  const idLength = buffer[0];
  const imageType = buffer[2];
  const width = buffer[12] | (buffer[13] << 8);
  const height = buffer[14] | (buffer[15] << 8);
  const bpp = buffer[16];
  const bytesPerPixel = bpp >> 3;
  const dataOffset = 18 + idLength;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const imageData = ctx.createImageData(width, height);
  const { data } = imageData;

  const putPixel = (dstPos: number, srcPos: number): void => {
    data[dstPos] = buffer[srcPos + 2]; // R (TGA is BGR order)
    data[dstPos + 1] = buffer[srcPos + 1]; // G
    data[dstPos + 2] = buffer[srcPos]; // B
    data[dstPos + 3] = bytesPerPixel >= 4 ? buffer[srcPos + 3] : 255; // A
  };

  if (imageType === 2) {
    // Uncompressed RGB/RGBA
    for (let y = 0; y < height; y++) {
      // TGA origin is bottom-left by default
      const dstRow = (height - 1 - y) * width;

      for (let x = 0; x < width; x++) {
        const srcPos = dataOffset + (y * width + x) * bytesPerPixel;
        const dstPos = (dstRow + x) * 4;

        putPixel(dstPos, srcPos);
      }
    }
  } else if (imageType === 10) {
    // Run-length encoded RGB/RGBA
    let srcPos = dataOffset;
    let pixelCount = 0;

    while (pixelCount < width * height) {
      const packetHeader = buffer[srcPos++];
      const isRle = (packetHeader & 0x80) !== 0;
      const count = (packetHeader & 0x7f) + 1;

      if (isRle) {
        // RLE packet: repeat one pixel `count` times
        for (let i = 0; i < count; i++) {
          const y = Math.floor(pixelCount / width);
          const x = pixelCount % width;
          const dstPos = ((height - 1 - y) * width + x) * 4;

          putPixel(dstPos, srcPos);
          pixelCount++;
        }
        srcPos += bytesPerPixel;
      } else {
        // Raw packet: `count` literal pixels
        for (let i = 0; i < count; i++) {
          const y = Math.floor(pixelCount / width);
          const x = pixelCount % width;
          const dstPos = ((height - 1 - y) * width + x) * 4;

          putPixel(dstPos, srcPos);
          srcPos += bytesPerPixel;
          pixelCount++;
        }
      }
    }
  } else {
    return undefined;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

const decodeTga = (buffer: Uint8Array): string => {
  const canvas = decodeTgaToCanvas(buffer);
  return canvas ? canvas.toDataURL("image/png") : "";
};

// Decode a BMP image buffer to canvas, treating magenta (255,0,255) as transparent
const decodeBmpToCanvas = (
  buffer: Uint8Array
): HTMLCanvasElement | undefined => {
  if (buffer.length < 54) return undefined;
  if (buffer[0] !== 0x42 || buffer[1] !== 0x4d) return undefined;

  const dataOffset =
    buffer[10] | (buffer[11] << 8) | (buffer[12] << 16) | (buffer[13] << 24);
  const width =
    buffer[18] | (buffer[19] << 8) | (buffer[20] << 16) | (buffer[21] << 24);
  const rawH =
    buffer[22] | (buffer[23] << 8) | (buffer[24] << 16) | (buffer[25] << 24);
  const isTopDown = rawH < 0;
  const height = isTopDown ? -rawH : rawH;
  const bpp = buffer[28] | (buffer[29] << 8);

  if (bpp !== 24 && bpp !== 32) {
    return undefined;
  }

  const bytesPerPixel = bpp >> 3;
  // BMP row stride is padded to a 4-byte boundary
  const rowStride = ((width * bytesPerPixel + 3) >> 2) << 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;

  const imageData = ctx.createImageData(width, height);
  const { data } = imageData;

  for (let y = 0; y < height; y++) {
    const srcRow = isTopDown ? y : height - 1 - y;

    for (let x = 0; x < width; x++) {
      const srcPos = dataOffset + srcRow * rowStride + x * bytesPerPixel;
      const dstPos = (y * width + x) * 4;
      const b = buffer[srcPos];
      const g = buffer[srcPos + 1];
      const r = buffer[srcPos + 2];
      const a = bytesPerPixel === 4 ? buffer[srcPos + 3] : 255;

      // Magenta color key: treat (255, 0, 255) as fully transparent
      if (r === 255 && g === 0 && b === 255) {
        data[dstPos + 3] = 0;
      } else {
        data[dstPos] = r;
        data[dstPos + 1] = g;
        data[dstPos + 2] = b;
        data[dstPos + 3] = a;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

const decodeBmpWithColorKey = (buffer: Uint8Array): string => {
  const canvas = decodeBmpToCanvas(buffer);
  return canvas ? canvas.toDataURL("image/png") : "";
};

// Fix duplicate extensions (e.g. "foo.tga.tga.tga" → "foo.tga")
const dedup = (p: string): string => p.replace(/(\.\w+)\1+/g, "$1");

// Normalize a skin-file-relative path to match zip entry keys
const normalizeSkinPath = (rawPath: string, zipFolder: string): string[] => {
  // Paths in .uis use backslashes; zip entries use forward slashes
  const forward = rawPath.replace(/\\/g, "/");
  const lower = forward.toLowerCase();

  // Some zips store files without the skin folder prefix even though .uis
  // references them with it (e.g. "Vista Plus\foo.bmp" but zip key is "foo.bmp").
  // Strip the first path component to handle this case.
  const slashIdx = forward.indexOf("/");
  const stripped = slashIdx === -1 ? forward : forward.slice(slashIdx + 1);
  const strippedLower = stripped.toLowerCase();

  const dedupFwd = dedup(forward);
  const dedupLower = dedup(lower);
  const dedupStripped = dedup(stripped);
  const dedupStrippedLower = dedup(strippedLower);

  // The zip entries are prefixed with the skin folder name, e.g. "Vista Plus/"
  const candidates = [
    `${zipFolder}/${forward}`,
    `${zipFolder}/${lower}`,
    forward,
    lower,
    stripped,
    strippedLower,
  ];

  // Add deduped variants only if they differ
  if (dedupFwd !== forward) {
    candidates.push(
      `${zipFolder}/${dedupFwd}`,
      `${zipFolder}/${dedupLower}`,
      dedupFwd,
      dedupLower,
      dedupStripped,
      dedupStrippedLower
    );
  }

  return candidates;
};

// Find a zip entry case-insensitively
const findEntry = (
  entries: Record<string, Uint8Array>,
  candidates: string[]
): Uint8Array | undefined => {
  const lowerEntries: Record<string, Uint8Array> = {};

  for (const [key, value] of Object.entries(entries)) {
    lowerEntries[key.toLowerCase()] = value;
  }

  for (const candidate of candidates) {
    const data = entries[candidate] || lowerEntries[candidate.toLowerCase()];

    if (data) return data;
  }

  return undefined;
};

// Convert an image entry to a CSS url() string
const imageEntryToUrl = (data: Uint8Array, ext: string): string => {
  const lowerExt = ext.toLowerCase();

  if (lowerExt === ".tga") {
    return decodeTga(data);
  }

  if (lowerExt === ".bmp") {
    // Decode BMP via canvas so magenta color-key pixels become transparent
    const decoded = decodeBmpWithColorKey(data);
    if (decoded) return decoded;
    // Fallback to native for unsupported BMP formats (e.g. 8-bit)
    return bufferToUrl(Buffer.from(data), "image/bmp");
  }

  const mimeMap: Record<string, string> = {
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
  };

  return bufferToUrl(Buffer.from(data), mimeMap[lowerExt] || "image/png");
};

// Get the extension of a path
const pathExt = (filePath: string): string => {
  const dot = filePath.lastIndexOf(".");
  return dot === -1 ? "" : filePath.slice(dot);
};

// Extract a sub-region of a canvas
const extractCanvasRegion = (
  source: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): HTMLCanvasElement => {
  const c = document.createElement("canvas");

  c.width = sw;
  c.height = sh;
  c.getContext("2d")?.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

  return c;
};

const canvasToDataUrl = (canvas: HTMLCanvasElement): string =>
  canvas.toDataURL("image/png");

// Apply auto color-key transparency for frame/titlebar BMPs.
// WindowBlinds uses a uniform saturated color row as the transparent color-key.
// Bottom row is checked first (typical for frame images); if that fails, the
// top row is checked (typical for titlebar images where the color-key is row 0).
const applyAutoColorKey = (canvas: HTMLCanvasElement, frameCount = 1): void => {
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const frameW = Math.round(width / frameCount);

  // Try a row within a single frame as color-key candidate
  const tryRow = (
    y: number,
    fx: number,
    fw: number
  ): [number, number, number, number] | undefined => {
    const idx = (y * width + fx) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];

    if (a === 0) return undefined;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);

    if (maxC === 0 || (maxC - minC) / maxC < 0.2) return undefined;

    // Reject body colors that happen to form a uniform edge row.
    // Legitimate dim keys are grayish (low saturation, e.g. Vista Plus (109,136,147)
    // sat=0.26).  Body colors are more saturated (e.g. eXperience (79,83,188)
    // sat=0.58).  Bright keys (maxC>=200) bypass this check entirely.
    if (maxC < 200 && (minC < 30 || (maxC - minC) / maxC > 0.4)) {
      return undefined;
    }

    for (let x = fx; x < fx + fw; x++) {
      const i = (y * width + x) * 4;

      if (
        data[i] !== r ||
        data[i + 1] !== g ||
        data[i + 2] !== b ||
        data[i + 3] !== a
      ) {
        return undefined;
      }
    }

    return [r, g, b, a];
  };

  // For multi-frame sprites, detect color key from first frame only
  const key = tryRow(height - 1, 0, frameW) || tryRow(0, 0, frameW);

  if (!key) return;

  const [kr, kg, kb, ka] = key;

  // Replace all matching pixels across entire sprite
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i] === kr &&
      data[i + 1] === kg &&
      data[i + 2] === kb &&
      data[i + 3] === ka
    ) {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
};

// After auto-color-key removal, interior fully-transparent rows (sandwiched
// between opaque rows) can create visible gaps that show the background behind
// the frame.  This fills them with the content of the nearest opaque row below.
const fillInteriorTransparentRows = (canvas: HTMLCanvasElement): void => {
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  const isRowTransparent = (y: number): boolean => {
    const base = y * width * 4;

    for (let x = 0; x < width; x++) {
      if (data[base + x * 4 + 3] !== 0) return false;
    }

    return true;
  };

  for (let y = 1; y < height - 1; y++) {
    if (!isRowTransparent(y)) continue;

    // Find the nearest opaque row below to copy from
    let srcY = y + 1;

    while (srcY < height && isRowTransparent(srcY)) srcY++;

    if (srcY >= height) continue;

    // Copy the source row over the transparent row
    const srcBase = srcY * width * 4;
    const dstBase = y * width * 4;

    for (let i = 0; i < width * 4; i++) {
      data[dstBase + i] = data[srcBase + i];
    }
  }

  ctx.putImageData(imageData, 0, 0);
};

// After auto-color-key, interior transparent pixels (e.g. col 6 in the left
// frame mid-section) create visible gaps showing the window background.  This
// fills each transparent pixel that is NOT in the outermost column (the outset
// edge) with the nearest opaque pixel in the same row, scanning inward.
const fillInteriorTransparentPixels = (canvas: HTMLCanvasElement): void => {
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  const { width, height } = canvas;

  if (width < 3) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  let changed = false;

  for (let y = 0; y < height; y++) {
    const rowBase = y * width * 4;

    // Skip columns 0 (left outset) and width-1 (right outset) — only fill interior
    for (let x = 1; x < width - 1; x++) {
      const i = rowBase + x * 4;

      if (data[i + 3] !== 0) continue;

      // Find nearest opaque pixel scanning right first, then left
      let srcI = -1;

      for (let nx = x + 1; nx < width - 1; nx++) {
        const ni = rowBase + nx * 4;

        if (data[ni + 3] !== 0) {
          srcI = ni;
          break;
        }
      }

      if (srcI < 0) {
        for (let nx = x - 1; nx > 0; nx--) {
          const ni = rowBase + nx * 4;

          if (data[ni + 3] !== 0) {
            srcI = ni;
            break;
          }
        }
      }

      if (srcI >= 0) {
        data[i] = data[srcI];
        data[i + 1] = data[srcI + 1];
        data[i + 2] = data[srcI + 2];
        data[i + 3] = data[srcI + 3];
        changed = true;
      }
    }
  }

  if (changed) ctx.putImageData(imageData, 0, 0);
};

// Fill transparent edge pixels in a titlebar image so tiling doesn't create
// gaps at seams. Each transparent pixel at the left/right edge of a row is
// replaced with the nearest opaque pixel's color.
const fillTransparentEdges = (
  canvas: HTMLCanvasElement,
  activeH: number
): number => {
  const ctx = canvas.getContext("2d");

  if (!ctx) return 0;

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  let maxCorner = 0;
  let changed = false;

  const fillRow = (y: number): void => {
    // Fill transparent left edge
    let firstOpaque = -1;

    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        firstOpaque = x;
        break;
      }
    }

    if (firstOpaque > 0) {
      if (firstOpaque > maxCorner) maxCorner = firstOpaque;

      const si = (y * width + firstOpaque) * 4;

      for (let x = 0; x < firstOpaque; x++) {
        const di = (y * width + x) * 4;

        data[di] = data[si];
        data[di + 1] = data[si + 1];
        data[di + 2] = data[si + 2];
        data[di + 3] = data[si + 3];
        changed = true;
      }
    }

    // Fill transparent right edge
    let lastOpaque = -1;

    for (let x = width - 1; x >= 0; x--) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        lastOpaque = x;
        break;
      }
    }

    if (lastOpaque >= 0 && lastOpaque < width - 1) {
      const rightTrans = width - 1 - lastOpaque;

      if (rightTrans > maxCorner) maxCorner = rightTrans;

      const si = (y * width + lastOpaque) * 4;

      for (let x = lastOpaque + 1; x < width; x++) {
        const di = (y * width + x) * 4;

        data[di] = data[si];
        data[di + 1] = data[si + 1];
        data[di + 2] = data[si + 2];
        data[di + 3] = data[si + 3];
        changed = true;
      }
    }
  };

  // Fill active half rows
  for (let y = 0; y < activeH; y++) fillRow(y);

  // Fill inactive half rows (if dual-state)
  if (height > activeH) {
    for (let y = activeH; y < height; y++) fillRow(y);
  }

  if (changed) ctx.putImageData(imageData, 0, 0);

  return maxCorner;
};

// Extract pixel dimensions from a raw BMP or TGA image buffer
const getImageDimensions = (
  data: Uint8Array,
  ext: string
): { height: number; width: number } | undefined => {
  const lowerExt = ext.toLowerCase();

  if (lowerExt === ".bmp") {
    if (data.length < 26) return undefined;
    const width =
      data[18] | (data[19] << 8) | (data[20] << 16) | (data[21] << 24);
    const rawHeight =
      data[22] | (data[23] << 8) | (data[24] << 16) | (data[25] << 24);
    const height = rawHeight < 0 ? -rawHeight : rawHeight;
    return width > 0 && height > 0 ? { height, width } : undefined;
  }

  if (lowerExt === ".tga") {
    if (data.length < 16) return undefined;
    const width = data[12] | (data[13] << 8);
    const height = data[14] | (data[15] << 8);
    return width > 0 && height > 0 ? { height, width } : undefined;
  }

  return undefined;
};

// Infer sprite frame count from image dimensions.
// For square frames (width/height divides evenly), use aspect ratio.
// For non-square frames (e.g. 126x15 = 3 frames of 42x15), try common counts.
const inferSpriteFrameCount = (width: number, height: number): number => {
  const aspectFC = Math.max(1, Math.round(width / height));

  if (width % aspectFC === 0) return aspectFC;

  // Aspect ratio doesn't divide cleanly — try common frame counts
  const candidate = [3, 4, 2, 5, 6, 7, 8].find((fc) => width % fc === 0);

  return candidate ?? aspectFC;
};

// Button Action codes from WindowBlinds .uis format
const ACTION_CLOSE = "0";
const ACTION_MAXIMIZE = "22";
const ACTION_MINIMIZE = "23";

// Decode a BMP image to canvas, apply auto-color-key, and return data URL.
// Used for BMP button images where the color-key color may be green or other
// non-magenta colors that decodeBmpToCanvas doesn't handle.
// TGA images support native alpha and should NOT be processed here as
// auto-color-key can destroy valid pixel content.
const imageEntryToUrlWithAutoColorKey = (
  data: Uint8Array,
  ext: string,
  frameCount = 1
): string => {
  if (ext.toLowerCase() === ".bmp") {
    const canvas = decodeBmpToCanvas(data);

    if (canvas) {
      applyAutoColorKey(canvas, frameCount);
      return canvasToDataUrl(canvas);
    }
  }

  return imageEntryToUrl(data, ext);
};

// Parse and resolve a skin image path from the .uis config
const resolveSkinImage = (
  imagePath: string | undefined,
  zipEntries: Record<string, Uint8Array>,
  zipFolder: string,
  autoColorKey = false
): string | undefined => {
  if (!imagePath) return undefined;

  const ext = pathExt(imagePath);
  const candidates = normalizeSkinPath(imagePath, zipFolder);
  const data = findEntry(zipEntries, candidates);

  if (!data || data.length === 0) return undefined;

  if (autoColorKey) return imageEntryToUrlWithAutoColorKey(data, ext);

  return imageEntryToUrl(data, ext);
};

// Helper: is a pixel a valid body colour (for frame colour-correction)?
const isBody = (r: number, g: number, b: number, a: number): boolean => {
  if (a < 128) return false;
  if (r + g + b < 30) return false;
  if (r < 15 && g > 150 && b > 200) return false;
  return true;
};

export const parseSkinFile = async (buffer: Buffer): Promise<SkinCssVars> => {
  const vars: SkinCssVars = {};
  let zipEntries: Record<string, Uint8Array>;

  try {
    zipEntries = await unzip(buffer);
  } catch {
    return vars;
  }

  // Find the .uis config file
  const uisKey = Object.keys(zipEntries).find((key) =>
    key.toLowerCase().endsWith(".uis")
  );

  if (!uisKey) return vars;

  // Determine the skin folder name (top-level directory in zip)
  const zipFolder = uisKey.includes("/")
    ? uisKey.slice(0, uisKey.lastIndexOf("/"))
    : "";

  const uisText = Buffer.from(zipEntries[uisKey]).toString("utf8");
  const ini = parseIni(uisText);
  const personality = ini.Personality || {};
  // CaptionHeight lives in [Metrics] in modern skins; fall back to [Personality]
  const metrics = ini.Metrics || {};

  // TopTopHeight: rows cropped from top of titlebar sprite (color-key padding)
  const topTopH = Math.max(
    0,
    Number.parseInt(personality.TopTopHeight || "0", 10)
  );

  // Caption (titlebar) height
  let captionHeight = Number.parseInt(
    metrics.CaptionHeight || personality.CaptionHeight || "0",
    10
  );

  if (captionHeight > 0) {
    vars["--skin-tb-height"] = `${captionHeight}px`;
  }

  // Titlebar text color — check [Personality] separate R/G/B keys, then [Colours], then [Colors]
  const colours = ini.Colours || {};
  const colors = ini.Colors || {};
  const parseIniColor = (val: string | undefined): string | undefined => {
    if (!val) return undefined;
    const trimmed = val.trim();
    if (trimmed.startsWith("#")) return trimmed;
    const parts = trimmed.split(/[\s,]+/);
    if (parts.length >= 3) {
      const [r, g, b] = parts.map(Number);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return `rgb(${r},${g},${b})`;
      }
    }
    return undefined;
  };
  const parseRgbKeys = (
    rKey: string,
    gKey: string,
    bKey: string
  ): string | undefined => {
    const r = Number.parseInt(personality[rKey] || "", 10);
    const g = Number.parseInt(personality[gKey] || "", 10);
    const b = Number.parseInt(personality[bKey] || "", 10);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgb(${r},${g},${b})`;
    }
    return undefined;
  };
  const textColor =
    parseRgbKeys("ActiveTextR", "ActiveTextG", "ActiveTextB") ||
    parseIniColor(colours.TitleText) ||
    parseIniColor(colors.ActiveCaptionText);
  const textColorInactive =
    parseRgbKeys("InactiveTextR", "InactiveTextG", "InactiveTextB") ||
    parseIniColor(colours.InactiveTitleText) ||
    parseIniColor(colors.InactiveCaptionText);
  if (textColor) vars["--skin-tb-text"] = textColor;
  if (textColorInactive) vars["--skin-tb-text-inactive"] = textColorInactive;

  // Title text alignment: 0=left (default), 1=center, 2=right
  if (personality.TextAlignment === "1") {
    vars["--skin-tb-title-position"] = "absolute";
    vars["--skin-tb-title-inset"] = "0";
    vars["--skin-tb-title-justify"] = "center";
    vars["--skin-tb-figure-margin"] = "0";

    const textShift = Number.parseInt(personality.TextShift || "0", 10);
    const textRightClip = Number.parseInt(personality.TextRightClip || "0", 10);
    const totalClip = textShift + textRightClip;

    if (totalClip > 0) {
      vars["--skin-tb-figure-max-width"] = `calc(100% - ${totalClip}px)`;
    }
  }

  // Titlebar text background (colored box behind title text)
  if (personality.Textbackground === "1" && personality.Textback) {
    const tbkExt = pathExt(personality.Textback);
    const tbkCandidates = normalizeSkinPath(personality.Textback, zipFolder);
    const tbkRaw = findEntry(zipEntries, tbkCandidates);

    if (tbkRaw && tbkRaw.length > 0) {
      const tbkCanvas =
        tbkExt.toLowerCase() === ".tga"
          ? decodeTgaToCanvas(tbkRaw)
          : decodeBmpToCanvas(tbkRaw);

      if (tbkCanvas) {
        const tbkSection = ini["TopBorder.TextBack"] || {};
        const frameCount = Number.parseInt(tbkSection.FrameCount || "1", 10);
        const txtBackLeft = Number.parseInt(personality.TxtBackLeft || "0", 10);
        const txtBackRight = Number.parseInt(
          personality.TxtBackRight || "0",
          10
        );
        const stateH =
          frameCount >= 2 ? Math.floor(tbkCanvas.height / 2) : tbkCanvas.height;

        // Active state (top half if dual-state)
        const activeC = extractCanvasRegion(
          tbkCanvas,
          0,
          0,
          tbkCanvas.width,
          stateH
        );
        vars["--skin-tb-textback-img"] = `url("${canvasToDataUrl(activeC)}")`;

        // Inactive state (bottom half if dual-state)
        if (frameCount >= 2) {
          const inactiveC = extractCanvasRegion(
            tbkCanvas,
            0,
            stateH,
            tbkCanvas.width,
            stateH
          );
          vars["--skin-tb-textback-img-i"] =
            `url("${canvasToDataUrl(inactiveC)}")`;
        }

        vars["--skin-tb-textback-slice"] =
          `0 ${txtBackRight} 0 ${txtBackLeft} fill`;
        vars["--skin-tb-textback-width"] =
          `0 ${txtBackRight}px 0 ${txtBackLeft}px`;
        vars["--skin-tb-textback-pad"] =
          `0 ${txtBackRight + 2}px 0 ${txtBackLeft + 2}px`;
      }
    }
  }

  // Titlebar background: "Top" is the top frame image (the entire titlebar area)
  const topImagePath = personality.Top;

  if (topImagePath) {
    const topExt = pathExt(topImagePath);
    const topCandidates = normalizeSkinPath(topImagePath, zipFolder);
    const topRawData = findEntry(zipEntries, topCandidates);

    if (topRawData && topRawData.length > 0) {
      const url = imageEntryToUrl(topRawData, topExt);

      if (url) {
        vars["--skin-tb-active-bg"] = `url("${url}")`;
      }

      // Infer titlebar height from image when CaptionHeight is not explicitly set
      if (!vars["--skin-tb-height"]) {
        const dims = getImageDimensions(topRawData, topExt);

        if (dims && dims.height > 0) {
          const leftTopH = Number.parseInt(
            personality.LeftTopHeight || "0",
            10
          );

          // Detect dual-state titlebar: image height ≈ 2× LeftTopHeight
          captionHeight =
            leftTopH > 0 && Math.abs(dims.height - 2 * leftTopH) <= 3
              ? Math.floor(dims.height / 2)
              : dims.height;

          vars["--skin-tb-height"] = `${captionHeight}px`;
        }
      }
    }
  }

  // TopStretch=0 means tile the titlebar image horizontally; =1 means stretch
  const topStretch = personality.TopStretch !== "0";

  // Detect dual-frame titlebar sprite (active + inactive stacked vertically).
  // If image height is 2× CaptionHeight, the top half is active and bottom half is inactive.
  let dualFrameTitlebar = false;

  if (vars["--skin-tb-active-bg"] && captionHeight > 0 && topImagePath) {
    const topExt2 = pathExt(topImagePath);
    const topCandidates2 = normalizeSkinPath(topImagePath, zipFolder);
    const topRaw2 = findEntry(zipEntries, topCandidates2);

    if (topRaw2) {
      const dims = getImageDimensions(topRaw2, topExt2);

      if (dims && Math.round(dims.height / captionHeight) === 2) {
        dualFrameTitlebar = true;

        // Use the actual per-state height so the rendered titlebar matches
        // the image data and aligns with frame top-slices (LeftTopHeight).
        const perStateH = Math.floor(dims.height / 2);

        if (perStateH !== captionHeight) {
          captionHeight = perStateH;
          vars["--skin-tb-height"] = `${captionHeight}px`;
        }

        vars["--skin-tb-bg-size"] = topStretch ? "100% 200%" : "auto 200%";
        vars["--skin-tb-bg-pos-inactive"] = "0 100%";
        vars["--skin-tb-inactive-bg"] = vars["--skin-tb-active-bg"];
      }
    }
  }

  // Detect transparent corners in the titlebar image and fill them so tiling
  // doesn't create gaps. Also detect the corner radius for border-radius.
  let detectedCornerRadius = 0;
  let actualTopCrop = 0;
  // Saved titlebar canvas for frame colour-correction (right frame body
  // colours often don't match the titlebar's right-edge gradient).
  let savedTbCanvas: HTMLCanvasElement | undefined;
  let savedTbActiveH = 0;
  let savedTbTopCrop = 0;

  // Pre-compute frame outsets for titlebar corner cropping.  When a tiled
  // titlebar image contains rounded-corner / border-separator columns at its
  // edges, those pixels create visible seams at every tile boundary.  Cropping
  // the outset amount from each side removes the corner columns so only the
  // seamlessly-tileable middle remains.
  let tbCropLeft = 0;
  let tbCropRight = 0;

  if (!topStretch) {
    const earlyLeftFS = Number.parseInt(personality.LeftFrame || "0", 10);
    const earlyRightFS = Number.parseInt(personality.RightFrame || "0", 10);

    if (earlyLeftFS > 0) {
      const lPath = personality.Left;

      if (lPath) {
        const lRaw = findEntry(zipEntries, normalizeSkinPath(lPath, zipFolder));

        if (lRaw) {
          const ld = getImageDimensions(lRaw, pathExt(lPath));

          if (ld && ld.width > earlyLeftFS) {
            tbCropLeft = ld.width - earlyLeftFS;
          }
        }
      }
    }

    if (earlyRightFS > 0) {
      const rPath = personality.Right || personality.Left;

      if (rPath) {
        const rRaw = findEntry(zipEntries, normalizeSkinPath(rPath, zipFolder));

        if (rRaw) {
          const rd = getImageDimensions(rRaw, pathExt(rPath));

          if (rd && rd.width > earlyRightFS) {
            tbCropRight = rd.width - earlyRightFS;
          }
        }
      }
    }
  }

  if (vars["--skin-tb-active-bg"] && topImagePath) {
    const tbExt = pathExt(topImagePath).toLowerCase();
    const tbCandidates = normalizeSkinPath(topImagePath, zipFolder);
    const tbRaw = findEntry(zipEntries, tbCandidates);

    if (tbRaw) {
      let tbCanvas: HTMLCanvasElement | undefined;

      if (tbExt === ".bmp") tbCanvas = decodeBmpToCanvas(tbRaw);
      else if (tbExt === ".tga") tbCanvas = decodeTgaToCanvas(tbRaw);

      if (tbCanvas) {
        // Detect and crop color-key padding rows from the titlebar sprite.
        // First apply auto-color-key to make uniform saturated rows transparent,
        // then count how many leading/trailing rows per half are fully transparent.
        // Only those rows get cropped — structural tiling zones with visual content
        // (e.g. rounded corners) are preserved.
        const topBotH = Math.max(
          0,
          Number.parseInt(personality.TopBotHeight || "0", 10)
        );

        if (tbExt === ".bmp") {
          applyAutoColorKey(tbCanvas);
        }

        let actualBotCrop = 0;

        if (topTopH > 0 || topBotH > 0) {
          const halfH = dualFrameTitlebar
            ? Math.floor(tbCanvas.height / 2)
            : tbCanvas.height;

          const tbCtx = tbCanvas.getContext("2d");

          if (tbCtx && halfH > 1) {
            // Count fully-transparent leading rows (capped by topTopH)
            for (let y = 0; y < Math.min(topTopH, halfH - 1); y++) {
              const row = tbCtx.getImageData(0, y, tbCanvas.width, 1).data;
              let allTrans = true;

              for (let x = 0; x < tbCanvas.width; x++) {
                if (row[x * 4 + 3] !== 0) {
                  allTrans = false;
                  break;
                }
              }

              if (!allTrans) break;

              actualTopCrop++;
            }

            // Count fully-transparent trailing rows (capped by topBotH)
            for (
              let y = halfH - 1;
              y >= Math.max(actualTopCrop, halfH - topBotH);
              y--
            ) {
              const row = tbCtx.getImageData(0, y, tbCanvas.width, 1).data;
              let allTrans = true;

              for (let x = 0; x < tbCanvas.width; x++) {
                if (row[x * 4 + 3] !== 0) {
                  allTrans = false;
                  break;
                }
              }

              if (!allTrans) break;

              actualBotCrop++;
            }
          }

          const croppedH = halfH - actualTopCrop - actualBotCrop;

          if (croppedH > 0 && (actualTopCrop > 0 || actualBotCrop > 0)) {
            const halves = dualFrameTitlebar ? 2 : 1;
            const newCanvas = document.createElement("canvas");

            newCanvas.width = tbCanvas.width;
            newCanvas.height = croppedH * halves;

            const newCtx = newCanvas.getContext("2d");

            if (newCtx) {
              for (let h = 0; h < halves; h++) {
                const srcY = h * halfH + actualTopCrop;
                const dstY = h * croppedH;

                newCtx.drawImage(
                  tbCanvas,
                  0,
                  srcY,
                  tbCanvas.width,
                  croppedH,
                  0,
                  dstY,
                  tbCanvas.width,
                  croppedH
                );
              }

              tbCanvas = newCanvas;
              vars["--skin-tb-height"] = `${croppedH}px`;

              if (dualFrameTitlebar) {
                vars["--skin-tb-bg-size"] = topStretch
                  ? "100% 200%"
                  : "auto 200%";
              }
            }
          }
        }

        const activeH = dualFrameTitlebar
          ? Math.floor(tbCanvas.height / 2)
          : tbCanvas.height;
        const cornerSize = fillTransparentEdges(tbCanvas, activeH);

        if (cornerSize > 0) {
          detectedCornerRadius = cornerSize + 1;
        }

        // Save uncropped canvas for frame colour-correction before any
        // horizontal cropping (colour-correction needs the original right edge).
        savedTbCanvas = tbCanvas;
        savedTbActiveH = dualFrameTitlebar
          ? Math.floor(tbCanvas.height / 2)
          : tbCanvas.height;
        savedTbTopCrop = actualTopCrop;

        // For tiled titlebars, crop left/right corner columns so the
        // tileable middle section repeats without seam artifacts.
        let tileCanvas: HTMLCanvasElement = tbCanvas;

        if (tbCropLeft > 0 || tbCropRight > 0) {
          const cropW = tbCanvas.width - tbCropLeft - tbCropRight;

          if (cropW > 0) {
            const cc = document.createElement("canvas");

            cc.width = cropW;
            cc.height = tbCanvas.height;

            const cctx = cc.getContext("2d");

            if (cctx) {
              cctx.drawImage(
                tbCanvas,
                tbCropLeft,
                0,
                cropW,
                tbCanvas.height,
                0,
                0,
                cropW,
                tbCanvas.height
              );
              tileCanvas = cc;
            }
          }
        }

        const processedUrl = canvasToDataUrl(tileCanvas);

        vars["--skin-tb-active-bg"] = `url("${processedUrl}")`;

        if (dualFrameTitlebar) {
          vars["--skin-tb-inactive-bg"] = vars["--skin-tb-active-bg"];
        }
      }
    }
  }

  // Set tiling for non-stretched titlebar images
  if (!topStretch && vars["--skin-tb-active-bg"]) {
    vars["--skin-tb-bg-repeat"] = "repeat-x";

    if (!dualFrameTitlebar) {
      vars["--skin-tb-bg-size"] = "auto 100%";
    }
  }

  // Look for a separate inactive titlebar variant (only if not dual-frame).
  if (!dualFrameTitlebar) {
    const topInactivePath =
      personality.TopInactive ||
      personality.TopI ||
      (topImagePath ? topImagePath.replace(/(\.[^.]+)$/, "_I$1") : undefined) ||
      (topImagePath
        ? topImagePath.replace(/(\.[^.]+)$/, "-inactive$1")
        : undefined);

    if (topInactivePath) {
      const url = resolveSkinImage(topInactivePath, zipEntries, zipFolder);

      if (url) {
        vars["--skin-tb-inactive-bg"] = `url("${url}")`;
      }
    }
  }

  // When a skin titlebar is active, suppress the default outline, shadow, and titlebar border
  if (vars["--skin-tb-active-bg"]) {
    vars["--skin-window-outline"] = "none";
    vars["--skin-window-shadow"] = "none";
    vars["--skin-tb-border-bottom"] = "none";
    vars["--skin-tb-bg-color"] = "transparent";
    vars["--skin-window-border-radius"] =
      detectedCornerRadius > 0 ? `${detectedCornerRadius}px` : "0";
  }

  // Build a case-insensitive section lookup for named button sections
  const iniLower: Record<string, Record<string, string>> = {};

  for (const [sectionKey, sectionVal] of Object.entries(ini)) {
    iniLower[sectionKey.toLowerCase()] = sectionVal;
  }

  let hasAnyButton = false;

  // Pre-scan indexed buttons: when [Button0]-[ButtonN] provide close/max/min
  // with images, they are the main window buttons and named sections like
  // [Window.CloseButton] are for tool/minimized windows (e.g. Hyano Revo).
  const rawBtnCountForScan = Number.parseInt(
    personality.BUTTONCOUNT ||
      personality.ButtonCount ||
      personality.buttoncount ||
      "0",
    10
  );
  const btnSectionCountForScan = Object.keys(ini).filter((s) =>
    /^Button\d+$/i.test(s)
  ).length;
  const btnCountForScan =
    rawBtnCountForScan > 0 ? rawBtnCountForScan : btnSectionCountForScan;
  let hasIndexedMainButtons = false;

  for (let i = 0; i < btnCountForScan && !hasIndexedMainButtons; i++) {
    const sec = ini[`Button${i}`] || iniLower[`button${i}`] || {};
    const action = sec.Action;
    const img = sec.ButtonImage || sec.Image;

    if (
      img &&
      (action === ACTION_CLOSE ||
        action === ACTION_MAXIMIZE ||
        action === ACTION_MINIMIZE)
    ) {
      hasIndexedMainButtons = true;
    }
  }

  // Strategy 1: Named sections [Window.CloseButton] / [Window.MaxButton] / [Window.MinButton]
  // Used by Mac OS X Tiger, Vista Plus, and many modern skins.
  // Skipped when indexed buttons provide main actions — named sections in those
  // skins are typically for tool/minimized windows, not the main titlebar.
  const namedButtonMap: [string, string, string][] = [
    ["Window.CloseButton", "--skin-btn-close-img", "--skin-btn-close-img-i"],
    ["Window.MaxButton", "--skin-btn-max-img", "--skin-btn-max-img-i"],
    ["Window.MinButton", "--skin-btn-min-img", "--skin-btn-min-img-i"],
  ];

  for (const [sectionName, activeVar, inactiveVar] of namedButtonMap) {
    if (hasIndexedMainButtons) continue;

    const section = iniLower[sectionName.toLowerCase()];

    if (!section) continue;

    const imagePath = section.image;

    if (!imagePath) continue;

    // Resolve raw data first so we can read dimensions for sprite frame count
    const ext = pathExt(imagePath);
    const candidates = normalizeSkinPath(imagePath, zipFolder);
    const rawData = findEntry(zipEntries, candidates);

    if (!rawData || rawData.length === 0) continue;

    const url = imageEntryToUrlWithAutoColorKey(rawData, ext);

    if (!url) continue;

    vars[activeVar] = `url("${url}")`;
    hasAnyButton = true;

    // Compute frame count from sprite strip dimensions
    const dims = getImageDimensions(rawData, ext);

    if (dims && dims.height > 0) {
      const frameCount = inferSpriteFrameCount(dims.width, dims.height);
      const frameWidth = Math.round(dims.width / frameCount);
      const btnKey = activeVar.replace("--skin-btn-", "").replace("-img", "");

      vars[`--skin-btn-${btnKey}-frames`] = String(frameCount);
      vars[`--skin-btn-${btnKey}-frame-width`] = `${frameWidth}px`;
      vars["--skin-btn-width"] = `${frameWidth}px`;
      vars["--skin-btn-height"] = `${dims.height}px`;
    }

    // Look for inactive variant via InactiveImage key or _I suffix
    const inactiveImagePath =
      section.inactiveimage || imagePath.replace(/(\.[^.]+)$/, "_I$1");
    const inactiveUrl = resolveSkinImage(
      inactiveImagePath,
      zipEntries,
      zipFolder,
      true
    );

    if (inactiveUrl) {
      vars[inactiveVar] = `url("${inactiveUrl}")`;
    }
  }

  // Strategy 2: Indexed sections [Button0], [Button1], ...
  // Supports Action-based assignment and implicit ordering (0=close,1=max,2=restore,3=min).
  // Runs when no named buttons were found OR when indexed buttons take precedence.
  if (!hasAnyButton || hasIndexedMainButtons) {
    // ButtonCount key name varies across skins — check all common spellings
    const rawButtonCount = Number.parseInt(
      personality.BUTTONCOUNT ||
        personality.ButtonCount ||
        personality.buttoncount ||
        "0",
      10
    );
    const buttonSectionCount = Object.keys(ini).filter((s) =>
      /^Button\d+$/i.test(s)
    ).length;
    const buttonCount =
      rawButtonCount > 0 ? rawButtonCount : buttonSectionCount;

    // Implicit index → action when no Action= key is present
    const implicitActionMap: Record<number, string> = {
      0: ACTION_CLOSE,
      1: ACTION_MAXIMIZE,
      2: ACTION_MAXIMIZE, // restore — map to maximize slot
      3: ACTION_MINIMIZE,
    };

    // Parse sprite frame count hints from [Personality]
    const tripleImages = personality.TripleImages === "1";
    // Collect XCoord values for display width calculation
    // Right-aligned (Align=1) and left-aligned (Align=0) tracked separately
    const xCoordByAction: Record<string, number> = {};
    const leftXCoordByAction: Record<string, number> = {};

    // Track which actions we've found per visibility state.
    // Visibility=2 means "inactive window only"; all other values (0,1,3,4,...) or absent
    // relate to window state (maximized, restored, etc.) and are treated as active variants.
    const activeImages: Record<string, string | undefined> = {};
    const activeVisibility: Record<string, string> = {};
    const inactiveImages: Record<string, string | undefined> = {};
    const rawDataByAction: Record<
      string,
      {
        alphaCanvas?: HTMLCanvasElement;
        data: Uint8Array;
        ext: string;
        frameCount: number;
      }
    > = {};
    // Map XCoord → action for resolving Action=-2 (visual-only inactive overlays)
    const xCoordToAction: Record<number, string> = {};
    // Pending Action=-2 buttons to resolve after first pass
    const pendingInactive: { imagePath: string; xCoord: number }[] = [];
    // Collect YCoord from the first right-aligned button for vertical positioning
    let buttonYCoord = -1;

    for (let i = 0; i < buttonCount; i++) {
      const section = ini[`Button${i}`] || iniLower[`button${i}`] || {};
      const action =
        "Action" in section ? section.Action : implicitActionMap[i];
      const visibility = section.Visibility || "0";
      const imagePath = section.ButtonImage || section.Image;
      const isMainAction = [
        ACTION_CLOSE,
        ACTION_MAXIMIZE,
        ACTION_MINIMIZE,
      ].includes(action);

      // Collect XCoord for aligned buttons
      const alignVal = section.Align || section.align || "";
      const xCoordVal =
        section.XCoord || section.Xcoord || section.xcoord || "";
      let xCoord = 0;

      if (xCoordVal) {
        xCoord = Number.parseInt(xCoordVal, 10);

        if (!Number.isNaN(xCoord) && xCoord >= 0 && isMainAction) {
          if (alignVal === "1") {
            // Right-aligned button
            if (!(action in xCoordByAction)) {
              xCoordByAction[action] = xCoord;
              xCoordToAction[xCoord] = action;
            }
          } else if (!(action in leftXCoordByAction)) {
            // Left-aligned button (Align=0 or unspecified)
            leftXCoordByAction[action] = xCoord;
          }

          // Capture YCoord from the first button with XCoord
          if (buttonYCoord < 0) {
            const yVal =
              section.YCoord || section.Ycoord || section.ycoord || "";
            const y = Number.parseInt(yVal, 10);

            if (!Number.isNaN(y) && y >= 0) buttonYCoord = y;
          }
        }
      }

      if (!imagePath) {
        // Handle Action=-2 (visual-only inactive overlay) without image skip
        if (action === "-2" && visibility === "2" && xCoord > 0) {
          pendingInactive.push({ imagePath: "", xCoord });
        }
      } else if (action === "-2" && visibility === "2") {
        // Queue Action=-2 buttons for XCoord matching after the loop
        pendingInactive.push({ imagePath, xCoord });
      } else if (isMainAction) {
        const ext = pathExt(imagePath);
        const candidates = normalizeSkinPath(imagePath, zipFolder);
        const rawData = findEntry(zipEntries, candidates);

        if (rawData && rawData.length > 0) {
          // CombineOp=2: apply per-pixel alpha from companion _pp.tga mask
          let url: string | undefined;
          let alphaAppliedCanvas: HTMLCanvasElement | undefined;
          const combineOp = section.CombineOp || "";

          if (combineOp === "2" && ext.toLowerCase() === ".bmp") {
            const ppPath = imagePath.replace(/\.bmp$/i, "_pp.tga");
            const ppCandidates = normalizeSkinPath(ppPath, zipFolder);
            const ppRaw = findEntry(zipEntries, ppCandidates);

            if (ppRaw && ppRaw.length > 0) {
              const bmpCanvas = decodeBmpToCanvas(rawData);
              const tgaCanvas = decodeTgaToCanvas(ppRaw);

              if (bmpCanvas && tgaCanvas) {
                const bmpCtx = bmpCanvas.getContext("2d");
                const tgaCtx = tgaCanvas.getContext("2d");

                if (bmpCtx && tgaCtx) {
                  const bmpData = bmpCtx.getImageData(
                    0,
                    0,
                    bmpCanvas.width,
                    bmpCanvas.height
                  );
                  const tgaData = tgaCtx.getImageData(
                    0,
                    0,
                    tgaCanvas.width,
                    tgaCanvas.height
                  );

                  // Apply TGA alpha to BMP, frame-by-frame.
                  // BMP and TGA may have different frame counts (e.g. 6 vs 8)
                  // but same frame width; use modular mapping.
                  const bmpW = bmpCanvas.width;
                  const tgaW = tgaCanvas.width;
                  const frameCount = Number.parseInt(
                    section.FrameCount || "6",
                    10
                  );
                  const bmpFrameW =
                    frameCount > 0 ? Math.round(bmpW / frameCount) : bmpW;
                  const tgaFrameCount =
                    bmpFrameW > 0 ? Math.round(tgaW / bmpFrameW) : 1;

                  for (
                    let y = 0;
                    y < bmpCanvas.height && y < tgaCanvas.height;
                    y++
                  ) {
                    for (let x = 0; x < bmpW; x++) {
                      // Map BMP frame index to TGA frame index
                      const bmpFrame = Math.floor(x / bmpFrameW);
                      const localX = x - bmpFrame * bmpFrameW;
                      const tgaFrame = bmpFrame % tgaFrameCount;
                      const tgaX = tgaFrame * bmpFrameW + localX;
                      const bmpIdx = (y * bmpW + x) * 4;

                      if (tgaX < tgaW) {
                        const tgaIdx = (y * tgaW + tgaX) * 4;

                        bmpData.data[bmpIdx + 3] = tgaData.data[tgaIdx + 3];
                      }
                    }
                  }

                  bmpCtx.putImageData(bmpData, 0, 0);
                  alphaAppliedCanvas = bmpCanvas;
                  url = canvasToDataUrl(bmpCanvas);
                }
              }
            }
          }

          if (!url) url = imageEntryToUrlWithAutoColorKey(rawData, ext);

          if (url) {
            if (visibility === "2") {
              // Inactive-only variant
              if (!inactiveImages[action]) inactiveImages[action] = url;
            } else {
              // Prefer Visibility 0 (all states) or 4 (normal/restored) so
              // the maximize slot shows the maximize icon, not restore.
              const isPreferred = visibility === "0" || visibility === "4";
              const existingPreferred =
                activeVisibility[action] === "0" ||
                activeVisibility[action] === "4";

              if (
                !activeImages[action] ||
                (isPreferred && !existingPreferred)
              ) {
                activeImages[action] = url;
                activeVisibility[action] = visibility;
                rawDataByAction[action] = {
                  alphaCanvas: alphaAppliedCanvas,
                  data: rawData,
                  ext,
                  frameCount: Number.parseInt(section.FrameCount || "0", 10),
                };
              }
            }
          }
        }
      }
    }

    // Resolve Action=-2 buttons by matching XCoord to real action buttons
    for (const { xCoord, imagePath } of pendingInactive) {
      if (imagePath && xCoord) {
        const matchedAction = xCoordToAction[xCoord];

        if (matchedAction && !inactiveImages[matchedAction]) {
          const url = resolveSkinImage(imagePath, zipEntries, zipFolder, true);

          if (url) inactiveImages[matchedAction] = url;
        }
      }
    }

    // Map action codes to CSS variable names
    const actionToVar: Record<string, [string, string]> = {
      [ACTION_CLOSE]: ["--skin-btn-close-img", "--skin-btn-close-img-i"],
      [ACTION_MAXIMIZE]: ["--skin-btn-max-img", "--skin-btn-max-img-i"],
      [ACTION_MINIMIZE]: ["--skin-btn-min-img", "--skin-btn-min-img-i"],
    };

    for (const [action, [activeVar, inactiveVar]] of Object.entries(
      actionToVar
    )) {
      const activeUrl = activeImages[action];
      const inactiveUrl = inactiveImages[action];

      if (activeUrl) {
        hasAnyButton = true;

        // Compute frame count from sprite strip dimensions
        const rawEntry = rawDataByAction[action];
        let finalActiveUrl = activeUrl;
        let finalInactiveUrl = inactiveUrl;

        if (rawEntry) {
          const dims = getImageDimensions(rawEntry.data, rawEntry.ext);

          if (dims && dims.height > 0) {
            const sectionFC = rawEntry.frameCount;
            let frameCount =
              sectionFC > 0
                ? sectionFC
                : tripleImages
                  ? 6
                  : inferSpriteFrameCount(dims.width, dims.height);

            // When TripleImages=1, 6-frame sprites contain active (0-2) and
            // inactive (3-5) states.  Split into two 3-frame sprites so
            // inactive windows show the correct inactive button frames.
            let spriteWidth = dims.width;

            if (
              tripleImages &&
              frameCount >= 6 &&
              frameCount % 2 === 0 &&
              !finalInactiveUrl &&
              rawEntry.ext.toLowerCase() === ".bmp"
            ) {
              // Use pre-processed alpha canvas if available (CombineOp=2 with
              // _pp.tga mask), otherwise decode fresh and apply auto color-key.
              const canvas =
                rawEntry.alphaCanvas || decodeBmpToCanvas(rawEntry.data);

              if (canvas) {
                if (!rawEntry.alphaCanvas) {
                  applyAutoColorKey(canvas, frameCount);
                }
                const halfFrames = frameCount / 2;
                const halfW = Math.round(
                  (canvas.width * halfFrames) / frameCount
                );
                const activeC = extractCanvasRegion(
                  canvas,
                  0,
                  0,
                  halfW,
                  canvas.height
                );
                const inactiveC = extractCanvasRegion(
                  canvas,
                  halfW,
                  0,
                  canvas.width - halfW,
                  canvas.height
                );

                finalActiveUrl = canvasToDataUrl(activeC);
                finalInactiveUrl = canvasToDataUrl(inactiveC);
                frameCount = halfFrames;
                spriteWidth = halfW;
              }
            }

            const naturalFrameWidth = Math.round(spriteWidth / frameCount);
            const btnKey = activeVar
              .replace("--skin-btn-", "")
              .replace("-img", "");

            vars[`--skin-btn-${btnKey}-frames`] = String(frameCount);
            // Natural frame pixel width (may differ from display width)
            vars[`--skin-btn-${btnKey}-frame-width`] = `${naturalFrameWidth}px`;
            vars["--skin-btn-height"] = `${dims.height}px`;
          }
        }

        vars[activeVar] = `url("${finalActiveUrl}")`;

        if (finalInactiveUrl) {
          vars[inactiveVar] = `url("${finalInactiveUrl}")`;
        }
      } else if (inactiveUrl) {
        vars[inactiveVar] = `url("${inactiveUrl}")`;
      }
    }

    // Compute per-button display widths and nav right margin from XCoord positions.
    // XCoord = distance from window right edge to button left edge (right-aligned).
    // Buttons are laid out in flex: [min][max][close] with a right margin on <nav>.
    const sortedButtons = Object.entries(xCoordByAction).sort(
      ([, a], [, b]) => a - b
    ); // ascending by XCoord (rightmost button first)

    const actionToBtnKey = (action: string): string =>
      action === ACTION_CLOSE
        ? "close"
        : action === ACTION_MAXIMIZE
          ? "max"
          : "min";

    if (sortedButtons.length >= 2) {
      // Get natural frame width of the rightmost button (smallest XCoord)
      const closestBtnKey = actionToBtnKey(sortedButtons[0][0]);
      const closestFrameWidth = Number.parseInt(
        vars[`--skin-btn-${closestBtnKey}-frame-width`]?.replace("px", "") ||
          "0",
        10
      );

      if (closestFrameWidth > 0) {
        // Use natural frame widths for button display.  This preserves the
        // sprite's pixel layout so each frame fills the button exactly.
        for (const [action] of sortedButtons) {
          const btnKey = actionToBtnKey(action);
          const fw = vars[`--skin-btn-${btnKey}-frame-width`];

          if (fw) vars[`--skin-btn-${btnKey}-width`] = fw;
        }

        const rightMargin = sortedButtons[0][1] - closestFrameWidth;

        if (rightMargin > 0) {
          vars["--skin-nav-right-margin"] = `${rightMargin}px`;
        }

        // When XCoord spacing exceeds natural frame width, add flex gap
        // so adjacent frames don't bleed into each other's display area.
        const xCoordSpacing = sortedButtons[1][1] - sortedButtons[0][1];
        const gap = xCoordSpacing - closestFrameWidth;

        if (gap > 0) {
          vars["--skin-btn-gap"] = `${gap}px`;
        }
      } else {
        // Fallback: use XCoord spacing as display width
        for (let i = 0; i < sortedButtons.length - 1; i++) {
          const spacing = sortedButtons[i + 1][1] - sortedButtons[i][1];
          const btnKey = actionToBtnKey(sortedButtons[i][0]);

          vars[`--skin-btn-${btnKey}-width`] = `${spacing}px`;
        }

        const lastBtnKey = actionToBtnKey(
          sortedButtons[sortedButtons.length - 1][0]
        );
        const commonWidth = sortedButtons[1][1] - sortedButtons[0][1];

        vars[`--skin-btn-${lastBtnKey}-width`] = `${commonWidth}px`;
        vars["--skin-btn-width"] = `${commonWidth}px`;

        const rightMargin = sortedButtons[0][1] - commonWidth;

        if (rightMargin > 0) {
          vars["--skin-nav-right-margin"] = `${rightMargin}px`;
        }
      }
    } else if (sortedButtons.length === 1) {
      const [action, xCoord] = sortedButtons[0];
      const btnKey = actionToBtnKey(action);
      const fw = vars[`--skin-btn-${btnKey}-frame-width`];

      if (fw) {
        vars[`--skin-btn-${btnKey}-width`] = fw;
        const fwNum = Number.parseInt(fw.replace("px", ""), 10);

        if (fwNum > 0 && xCoord > fwNum) {
          vars["--skin-nav-right-margin"] = `${xCoord - fwNum}px`;
        }
      }
    } else {
      // Check for left-aligned (Align=0) buttons (e.g. Mac OS X style)
      const leftButtons = Object.entries(leftXCoordByAction).sort(
        ([, a], [, b]) => a - b
      ); // ascending by XCoord (leftmost first)

      if (leftButtons.length > 0) {
        // Move nav to the left side of the titlebar
        vars["--skin-nav-order"] = "-1";
        vars["--skin-nav-left-margin"] = `${leftButtons[0][1]}px`;

        // Set button ordering within nav based on XCoord position
        for (const [action, , idx] of leftButtons.map(
          ([a, x], i) => [a, x, i] as const
        )) {
          vars[`--skin-btn-${actionToBtnKey(action)}-order`] = String(idx);
        }

        // Use frame width for display width
        const fallback =
          vars["--skin-btn-close-frame-width"] ||
          vars["--skin-btn-min-frame-width"] ||
          vars["--skin-btn-max-frame-width"];

        if (fallback) vars["--skin-btn-width"] = fallback;
      } else {
        // No XCoord data — fallback to natural frame width
        const fallback =
          vars["--skin-btn-close-frame-width"] ||
          vars["--skin-btn-min-frame-width"] ||
          vars["--skin-btn-max-frame-width"];

        if (fallback) vars["--skin-btn-width"] = fallback;
      }
    }

    // When no inactive button images exist, apply a desaturation filter to
    // grey out buttons on inactive (unfocused) windows (e.g. XP Professional).
    if (hasAnyButton && !Object.values(inactiveImages).some(Boolean)) {
      vars["--skin-btn-inactive-filter"] = "saturate(0) opacity(0.6)";
    }

    // Button vertical positioning from YCoord, adjusted for titlebar crop
    if (hasAnyButton) {
      const adjustedY =
        buttonYCoord >= 0 ? Math.max(0, buttonYCoord - actualTopCrop) : 0;
      vars["--skin-btn-bg-y"] = `${adjustedY}px`;
    }

    // Detect decorative buttons (Action=-6, Align=1) for nav decoration.
    // These are visual-only elements (e.g. diagonal grip lines in GT3wb5)
    // placed to the left of the main buttons on the titlebar.
    if (hasAnyButton && sortedButtons.length > 0) {
      // Collect main button X positions to exclude disabled-button variants
      // (e.g. Vista Plus uses Action=-6 at the same XCoord as the main max/min
      // buttons to show a "disabled" sprite; those are NOT decorations).
      const mainBtnXs = new Set(sortedButtons.map(([, x]) => x));
      const decorXSet = new Set<number>();
      let decorImgPath = "";

      for (let i = 0; i < buttonCount; i++) {
        const sec = ini[`Button${i}`] || iniLower[`button${i}`] || {};
        const act = sec.Action;
        const vis = Number.parseInt(sec.Visibility || "0", 10);
        const align = sec.Align || sec.align || "";
        const img = sec.ButtonImage || sec.Image;
        const xVal = sec.XCoord || sec.Xcoord || sec.xcoord || "";
        const x = Number.parseInt(xVal, 10);

        if (
          act === "-6" &&
          align === "1" &&
          img &&
          !Number.isNaN(x) &&
          x > 0 &&
          (vis === 0 || (vis & 1) !== 0) &&
          !mainBtnXs.has(x)
        ) {
          decorXSet.add(x);
          if (!decorImgPath) decorImgPath = img;
        }
      }

      if (decorXSet.size > 0 && decorImgPath) {
        const ext = pathExt(decorImgPath);
        const candidates = normalizeSkinPath(decorImgPath, zipFolder);
        const rawData = findEntry(zipEntries, candidates);

        if (rawData && rawData.length > 0) {
          const lExt = ext.toLowerCase();
          let decorFull: HTMLCanvasElement | undefined;

          if (lExt === ".bmp") decorFull = decodeBmpToCanvas(rawData);
          else if (lExt === ".tga") decorFull = decodeTgaToCanvas(rawData);

          if (decorFull) {
            // The image contains N identical frames side by side.
            // Extract just one frame for the decoration.
            const frameW = Math.round(decorFull.width / decorXSet.size);
            const fh = decorFull.height;
            const frame = document.createElement("canvas");

            frame.width = frameW;
            frame.height = fh;
            frame
              .getContext("2d")
              ?.drawImage(decorFull, 0, 0, frameW, fh, 0, 0, frameW, fh);

            const decorUrl = frame.toDataURL("image/png");
            const maxButtonX = sortedButtons[sortedButtons.length - 1][1];

            vars["--skin-tb-decor-img"] = `url("${decorUrl}")`;
            vars["--skin-tb-decor-pos"] = `calc(100% - ${maxButtonX}px) 0`;
            vars["--skin-tb-decor-size"] = `auto 100%`;
          }
        }
      }
    }
  }

  // For stretched titlebars with baked-in button backgrounds, the right portion
  // must stay at its natural pixel size so the backgrounds align with the actual
  // button elements.  [WindowFrame.TopPerPixel].ContentRight defines the width
  // of this fixed button area.  Split the titlebar into a stretchable left
  // portion and a fixed right portion rendered via the decor overlay layer.
  // Only applies when BackgroundEffect=1 (per-pixel frame contributes visible
  // button area backgrounds), otherwise the split creates visible seams on
  // smooth gradient titlebars (e.g. Windows 98 Classic).
  const topPerPixel = ini["WindowFrame.TopPerPixel"] || {};
  const ppContentRight = Number.parseInt(topPerPixel.ContentRight || "0", 10);
  const ppBackgroundEffect = topPerPixel.BackgroundEffect === "1";

  if (
    topStretch &&
    savedTbCanvas &&
    ppContentRight > 0 &&
    ppBackgroundEffect &&
    !vars["--skin-tb-decor-img"]
  ) {
    const fixedRightW = ppContentRight;

    if (fixedRightW < savedTbCanvas.width) {
      const imgW = savedTbCanvas.width;
      const imgH = savedTbCanvas.height;
      const leftW = imgW - fixedRightW;

      // Extract the right (fixed) portion as the decor overlay
      const rightC = extractCanvasRegion(
        savedTbCanvas,
        leftW,
        0,
        fixedRightW,
        imgH
      );
      vars["--skin-tb-decor-img"] = `url("${canvasToDataUrl(rightC)}")`;
      vars["--skin-tb-decor-pos"] = "100% 0";

      if (dualFrameTitlebar) {
        vars["--skin-tb-decor-size"] = `${fixedRightW}px 200%`;
        vars["--skin-tb-decor-pos-inactive"] = "100% 100%";
      } else {
        vars["--skin-tb-decor-size"] = `${fixedRightW}px 100%`;
      }

      // Crop the main titlebar to only the stretchable left portion
      const leftC = extractCanvasRegion(savedTbCanvas, 0, 0, leftW, imgH);

      vars["--skin-tb-active-bg"] = `url("${canvasToDataUrl(leftC)}")`;

      if (dualFrameTitlebar) {
        vars["--skin-tb-inactive-bg"] = vars["--skin-tb-active-bg"];
      }
    }
  }

  // Hide SVG icons, remove button borders, and suppress theme hover/active colors
  if (hasAnyButton) {
    vars["--skin-btn-svg"] = "hidden";
    vars["--skin-btn-border"] = "none";
    vars["--skin-btn-hover-bg"] = "transparent";
    vars["--skin-btn-active-bg"] = "transparent";
  }

  // Parse frame thickness values first (needed for dual-state detection)
  const leftFrameSize = Number.parseInt(personality.LeftFrame || "0", 10);
  const rightFrameSize = Number.parseInt(personality.RightFrame || "0", 10);
  const bottomFrameSize = Number.parseInt(personality.BottomFrame || "0", 10);

  const frameSizeMap: Record<string, number> = {
    Bottom: bottomFrameSize,
    Left: leftFrameSize,
    Right: rightFrameSize,
  };

  // Tracks whether the Bottom frame was rendered via a PerPixel TGA section,
  // so the post-loop trim logic can skip it (PerPixel has native alpha, no trim).
  let bottomIsPerPixel = false;

  // Saved full-frame canvases for Left/Right used to build titlebar corner overlays
  // that cover the full titlebar height (captionHeight px, not just topSliceH).
  let leftSavedCanvas: HTMLCanvasElement | undefined;
  let leftSavedInactive: HTMLCanvasElement | undefined;
  let leftSavedIsPerPixel = false;
  let rightSavedCanvas: HTMLCanvasElement | undefined;
  let rightSavedInactive: HTMLCanvasElement | undefined;
  let rightSavedIsPerPixel = false;

  // Window border frames: Left, Right, Bottom images from [Personality]
  // Frame images may be dual-state sprites (active + inactive side by side).
  const frameSides: [
    string,
    string,
    string,
    string,
    "width" | "height",
    "horizontal" | "vertical",
  ][] = [
    [
      "Left",
      "--skin-frame-left",
      "--skin-frame-left-width",
      "--skin-frame-left-i",
      "width",
      "horizontal",
    ],
    [
      "Right",
      "--skin-frame-right",
      "--skin-frame-right-width",
      "--skin-frame-right-i",
      "width",
      "horizontal",
    ],
    [
      "Bottom",
      "--skin-frame-bottom",
      "--skin-frame-bottom-width",
      "--skin-frame-bottom-i",
      "height",
      "vertical",
    ],
  ];

  for (const [
    key,
    urlVar,
    sizeVar,
    inactiveVar,
    dimKey,
    splitDir,
  ] of frameSides) {
    const framePath = personality[key];

    if (!framePath) continue;

    const ext = pathExt(framePath);
    const candidates = normalizeSkinPath(framePath, zipFolder);
    const rawData = findEntry(zipEntries, candidates);

    if (!rawData || rawData.length === 0) continue;

    // PerPixel override for L/R/Bottom: use [WindowFrame.{Key}PerPixel] TGA
    // when it is strictly thicker (wider for L/R, taller for Bottom) than the
    // standard BMP.  PerPixel frames carry native per-pixel alpha so no
    // color-key processing, inner-edge clearing, or color correction is needed.
    let effectiveData: Uint8Array = rawData;
    let effectiveExt: string = ext;
    let isPerPixelFrame = false;
    let ppTopSliceH = 0;
    let ppBotSliceH = 0;
    let ppLeftCornerW = 0;
    let ppRightCornerW = 0;

    if (key !== "Top") {
      const ppSec = ini[`WindowFrame.${key}PerPixel`] || {};

      if (ppSec.PerPixel === "1" && ppSec.Image) {
        const ppExt = pathExt(ppSec.Image);
        const ppCands = normalizeSkinPath(ppSec.Image, zipFolder);
        const ppData = findEntry(zipEntries, ppCands);

        if (ppData && ppData.length > 0) {
          // Thickness: width for Left/Right, height for Bottom
          const thickProp = key === "Bottom" ? "height" : "width";
          const ppDims = getImageDimensions(ppData, ppExt);
          const bmpDims = getImageDimensions(rawData, ext);
          const ppThick = ppDims?.[thickProp] ?? 0;
          const bmpThick = bmpDims?.[thickProp] ?? 0;

          if (ppThick > bmpThick) {
            isPerPixelFrame = true;
            effectiveData = ppData;
            effectiveExt = ppExt;
            ppTopSliceH = Math.max(
              0,
              Number.parseInt(ppSec.TopHeight || "0", 10)
            );
            ppBotSliceH = Math.max(
              0,
              Number.parseInt(ppSec.BottomHeight || "0", 10)
            );
            ppLeftCornerW = Math.max(
              0,
              Number.parseInt(ppSec.LeftWidth || "0", 10)
            );
            ppRightCornerW = Math.max(
              0,
              Number.parseInt(ppSec.RightWidth || "0", 10)
            );
          }
        }
      }
    }

    // Decode to canvas for flexible splitting
    const lExt = effectiveExt.toLowerCase();
    let fullCanvas: HTMLCanvasElement | undefined;

    if (lExt === ".bmp") fullCanvas = decodeBmpToCanvas(effectiveData);
    else if (lExt === ".tga") fullCanvas = decodeTgaToCanvas(effectiveData);

    if (!fullCanvas) {
      // Fallback for unsupported formats
      const url = imageEntryToUrl(effectiveData, effectiveExt);

      if (!url) continue;

      vars[urlVar] = `url("${url}")`;
      const dims = getImageDimensions(effectiveData, effectiveExt);

      if (dims) {
        const rd = dimKey === "width" ? dims.width : dims.height;

        if (rd > 0) vars[sizeVar] = `${rd}px`;
      }
      continue;
    }

    const relevantDim =
      dimKey === "width" ? fullCanvas.width : fullCanvas.height;
    const frameSize = frameSizeMap[key] || 0;
    const isDualState = relevantDim > 2 * Math.max(frameSize, 1);

    // 9-slice: top and bottom fixed region heights for side frames.
    // PerPixel frames use their own section's TopHeight/BottomHeight rather
    // than the [Personality] LeftTopHeight/LeftBotHeight values.
    const topSliceH =
      key === "Bottom"
        ? 0
        : isPerPixelFrame
          ? ppTopSliceH
          : Math.max(
              0,
              Number.parseInt(personality[`${key}TopHeight`] || "0", 10)
            );
    const botSliceH =
      key === "Bottom"
        ? 0
        : isPerPixelFrame
          ? ppBotSliceH
          : Math.max(
              0,
              Number.parseInt(personality[`${key}BotHeight`] || "0", 10)
            );

    // Dual-state split into active/inactive canvases
    let activeCanvas: HTMLCanvasElement;
    let inactiveCanvas: HTMLCanvasElement | undefined;

    if (isDualState) {
      if (splitDir === "horizontal") {
        const hw = Math.floor(fullCanvas.width / 2);

        activeCanvas = extractCanvasRegion(
          fullCanvas,
          0,
          0,
          hw,
          fullCanvas.height
        );
        inactiveCanvas = extractCanvasRegion(
          fullCanvas,
          hw,
          0,
          hw,
          fullCanvas.height
        );
      } else {
        const hh = Math.floor(fullCanvas.height / 2);

        activeCanvas = extractCanvasRegion(
          fullCanvas,
          0,
          0,
          fullCanvas.width,
          hh
        );
        inactiveCanvas = extractCanvasRegion(
          fullCanvas,
          0,
          hh,
          fullCanvas.width,
          hh
        );
      }
    } else {
      activeCanvas = fullCanvas;
    }

    // Apply auto-color-key to the full frame canvas after dual-state split.
    // This removes the outset edge column, edge rows, and L-shaped corner
    // cutout pixels.  Then fill interior transparent rows (e.g. bottom frame's
    // CYN separator row between the inner border and body) so they don't create
    // visible dark gaps showing the window background through.
    if (lExt === ".bmp") {
      applyAutoColorKey(activeCanvas);
      fillInteriorTransparentRows(activeCanvas);

      if (inactiveCanvas) {
        applyAutoColorKey(inactiveCanvas);
        fillInteriorTransparentRows(inactiveCanvas);
      }
    }

    // Detect rounded-corner radius from side frame images.  After auto-color-
    // key, the top rows of the left/right frame typically have transparent
    // pixels forming a quarter-circle corner cut.  Count the consecutive rows
    // from the top where the outer-edge column is transparent — this gives the
    // vertical extent of the corner, which we use as the CSS border-radius.
    // Skip when the frame has an outset — the outer column is then transparent
    // for the entire height (the outset gap) which would give a false result.
    const perStateDimEarly =
      dimKey === "width" ? activeCanvas.width : activeCanvas.height;
    const earlyOutset = frameSize > 0 && perStateDimEarly > frameSize;

    if ((key === "Left" || key === "Right") && !earlyOutset) {
      const cCtx = activeCanvas.getContext("2d");

      if (cCtx) {
        const cData = cCtx.getImageData(
          0,
          0,
          activeCanvas.width,
          activeCanvas.height
        ).data;
        // Outer-edge column: col 0 for Left, col width-1 for Right
        const outerCol = key === "Left" ? 0 : activeCanvas.width - 1;
        let cornerRows = 0;

        for (let y = 0; y < activeCanvas.height; y++) {
          if (cData[(y * activeCanvas.width + outerCol) * 4 + 3] === 0) {
            cornerRows++;
          } else {
            break;
          }
        }

        if (cornerRows > detectedCornerRadius) {
          detectedCornerRadius = cornerRows;
        }
      }
    }

    // Clear the inner-edge column/row of side frames.  In WindowBlinds the
    // inner highlight is hidden behind the content area, but our ::before
    // frame renders at z-index:1 above content, making it visible as a gray
    // 1px line.  Making it transparent hides it cleanly.
    const clearInnerEdge = (cvs: HTMLCanvasElement): void => {
      const ctx2 = cvs.getContext("2d");

      if (!ctx2) return;

      if (key === "Left") {
        ctx2.clearRect(cvs.width - 1, 0, 1, cvs.height);
      } else if (key === "Right") {
        ctx2.clearRect(0, 0, 1, cvs.height);
      }
    };

    const perStateDim =
      dimKey === "width" ? activeCanvas.width : activeCanvas.height;
    const frameHasOutset = frameSize > 0 && perStateDim > frameSize;

    // PerPixel frames have native alpha — inner-edge clearing would destroy
    // valid semi-transparent pixels along the content boundary.
    if (frameHasOutset && !isPerPixelFrame) {
      clearInnerEdge(activeCanvas);
      if (inactiveCanvas) clearInnerEdge(inactiveCanvas);
    }

    // Colour-correct the right frame so its body pixels match the titlebar's
    // right-edge gradient.  Many .wba skins ship a right-frame BMP whose hue
    // and saturation are shifted from the titlebar, causing a visible seam.
    // The titlebar image is the authoritative colour reference (the left frame
    // matches it exactly).
    //
    // Strategy: for rows that overlap the titlebar, compute a per-row scale
    // from the titlebar's rightmost body pixel.  For the frame body below
    // the titlebar, use the last valid scale.  This preserves the gradient
    // in the top-slice while ensuring the body matches.
    if (
      key === "Right" &&
      !isPerPixelFrame &&
      savedTbCanvas &&
      savedTbActiveH > 0 &&
      frameSize > 0
    ) {
      const correctFrameColors = (cvs: HTMLCanvasElement): void => {
        const ctx3 = cvs.getContext("2d");
        const tbCtx = savedTbCanvas.getContext("2d");

        if (!ctx3 || !tbCtx) return;

        const fw = cvs.width;
        const fh = cvs.height;
        const imgData = ctx3.getImageData(0, 0, fw, fh);
        const d = imgData.data;
        const tbW = savedTbCanvas.width;
        const tbData = tbCtx.getImageData(0, 0, tbW, savedTbActiveH);
        const td = tbData.data;

        // Build per-row scale factors from the titlebar overlap zone.
        // Each entry is [scaleR, scaleG, scaleB] or undefined if no valid pair.
        type Scale3 = [number, number, number];
        const rowScales: Record<number, Scale3> = {};
        let lastValidScale: Scale3 | undefined;

        // The titlebar canvas was cropped by savedTbTopCrop rows, so
        // titlebar row tY corresponds to frame row (tY + savedTbTopCrop).
        // rowScales is indexed by FRAME row.
        const cropOff = savedTbTopCrop;

        for (let tY = 0; tY < savedTbActiveH; tY++) {
          const fY = tY + cropOff; // corresponding frame row

          // Titlebar rightmost valid pixel at this row
          let tbR = 0;
          let tbG = 0;
          let tbB = 0;
          let tbOk = false;

          for (let x = tbW - 1; x >= Math.max(0, tbW - 4); x--) {
            const ti = (tY * tbW + x) * 4;

            if (isBody(td[ti], td[ti + 1], td[ti + 2], td[ti + 3])) {
              tbR = td[ti];
              tbG = td[ti + 1];
              tbB = td[ti + 2];
              tbOk = true;
              break;
            }
          }

          if (!tbOk || fY >= fh) continue;

          // Frame body pixel at the corresponding row
          let frR = 0;
          let frG = 0;
          let frB = 0;
          let frOk = false;

          for (let x = 2; x < fw - 2; x++) {
            const fi = (fY * fw + x) * 4;

            if (isBody(d[fi], d[fi + 1], d[fi + 2], d[fi + 3])) {
              frR = d[fi];
              frG = d[fi + 1];
              frB = d[fi + 2];
              frOk = true;
              break;
            }
          }

          if (!frOk) continue;

          const s: Scale3 = [
            tbR / Math.max(1, frR),
            tbG / Math.max(1, frG),
            tbB / Math.max(1, frB),
          ];

          rowScales[fY] = s;
          lastValidScale = s;
        }

        if (!lastValidScale) return;

        // Apply per-row correction in overlap zone, last valid scale below.
        for (let y = 0; y < fh; y++) {
          const s: Scale3 = rowScales[y] ?? lastValidScale;

          for (let x = 1; x < fw - 1; x++) {
            const i = (y * fw + x) * 4;

            if (!isBody(d[i], d[i + 1], d[i + 2], d[i + 3])) continue;

            d[i] = Math.min(255, Math.round(d[i] * s[0]));
            d[i + 1] = Math.min(255, Math.round(d[i + 1] * s[1]));
            d[i + 2] = Math.min(255, Math.round(d[i + 2] * s[2]));
          }
        }

        ctx3.putImageData(imgData, 0, 0);
      };

      correctFrameColors(activeCanvas);
    }

    // PerPixel bottom frame: horizontally 9-slice into left corner, middle,
    // and right corner using LeftWidth/RightWidth from the PerPixel section.
    // Corner pieces are emitted as separate CSS background layers so they
    // render on top of the stretched middle strip at the bottom corners.
    if (isPerPixelFrame && key === "Bottom") {
      bottomIsPerPixel = true;

      const extractBottomCorners = (
        cvs: HTMLCanvasElement,
        leftVar: string,
        rightVar: string
      ): HTMLCanvasElement => {
        if (ppLeftCornerW > 0 && ppLeftCornerW < cvs.width) {
          const lc = extractCanvasRegion(cvs, 0, 0, ppLeftCornerW, cvs.height);
          vars[leftVar] = `url("${canvasToDataUrl(lc)}")`;
        }

        if (ppRightCornerW > 0 && ppRightCornerW < cvs.width) {
          const rc = extractCanvasRegion(
            cvs,
            cvs.width - ppRightCornerW,
            0,
            ppRightCornerW,
            cvs.height
          );
          vars[rightVar] = `url("${canvasToDataUrl(rc)}")`;
        }

        const midW =
          cvs.width - Math.max(ppLeftCornerW, 0) - Math.max(ppRightCornerW, 0);

        if (midW > 0 && (ppLeftCornerW > 0 || ppRightCornerW > 0)) {
          return extractCanvasRegion(cvs, ppLeftCornerW, 0, midW, cvs.height);
        }

        return cvs;
      };

      activeCanvas = extractBottomCorners(
        activeCanvas,
        "--skin-frame-bottom-left",
        "--skin-frame-bottom-right"
      );

      if (inactiveCanvas) {
        inactiveCanvas = extractBottomCorners(
          inactiveCanvas,
          "--skin-frame-bottom-left-i",
          "--skin-frame-bottom-right-i"
        );
      }

      if (ppLeftCornerW > 0) {
        vars["--skin-frame-bottom-left-w"] = `${ppLeftCornerW}px`;
      }
      if (ppRightCornerW > 0) {
        vars["--skin-frame-bottom-right-w"] = `${ppRightCornerW}px`;
      }

      // Position the middle strip after the left corner
      if (ppLeftCornerW > 0 || ppRightCornerW > 0) {
        if (ppLeftCornerW > 0) {
          vars["--skin-frame-bottom-x"] = `${ppLeftCornerW}px`;
        }
        vars["--skin-frame-bottom-size-w"] =
          `calc(100% - ${ppLeftCornerW + ppRightCornerW}px)`;
        vars["--skin-frame-bottom-repeat"] = "no-repeat";
      }
    }

    // Frame pixel dimension (after dual-state split)
    const px = dimKey === "width" ? activeCanvas.width : activeCanvas.height;

    if (px > 0) vars[sizeVar] = `${px}px`;

    // Split top and bottom connection pieces for side frames (9-slice)
    const doTopSlice = topSliceH > 0 && topSliceH < activeCanvas.height;
    const doBotSlice =
      botSliceH > 0 && topSliceH + botSliceH < activeCanvas.height;

    const emitFrameVars = (
      canvas: HTMLCanvasElement,
      mainVar: string,
      topVar: string,
      botVar: string,
      topHVar: string
      // eslint-disable-next-line unicorn/consistent-function-scoping
    ): void => {
      if (doTopSlice || doBotSlice) {
        let topH = doTopSlice ? topSliceH : 0;
        const botH = doBotSlice ? botSliceH : 0;

        if (doTopSlice) {
          // Crop leading fully-transparent rows from the top-slice, but only
          // when the frame has an outset.  Transparent rows from auto-color-key
          // serve as alignment padding between the frame and the titlebar; when
          // the frame sits inside the window (no outset) those rows keep the
          // frame border line aligned with the titlebar's bottom edge.  When the
          // frame extends outside the window (outset > 0), the transparent rows
          // would expose the wallpaper, so they must be cropped.
          let cropTop = 0;

          if (frameHasOutset) {
            const topCtx = canvas.getContext("2d");

            if (topCtx) {
              const topData = topCtx.getImageData(0, 0, canvas.width, topH);
              const td = topData.data;

              for (let y = 0; y < topH; y++) {
                let allTransparent = true;

                for (let x = 0; x < canvas.width; x++) {
                  if (td[(y * canvas.width + x) * 4 + 3] !== 0) {
                    allTransparent = false;
                    break;
                  }
                }

                if (!allTransparent) break;

                cropTop++;
              }
            }
          }

          const adjustedTopH = topH - cropTop;

          if (adjustedTopH > 0) {
            const topC = extractCanvasRegion(
              canvas,
              0,
              cropTop,
              canvas.width,
              adjustedTopH
            );

            fillInteriorTransparentPixels(topC);
            vars[topVar] = `url("${canvasToDataUrl(topC)}")`;
          }

          topH = adjustedTopH;

          if (topHVar) {
            vars[topHVar] = `${topH}px`;
          }
        }

        const midH = canvas.height - topSliceH - (doBotSlice ? botSliceH : 0);

        if (midH > 0) {
          const midC = extractCanvasRegion(
            canvas,
            0,
            topSliceH,
            canvas.width,
            midH
          );

          fillInteriorTransparentPixels(midC);
          vars[mainVar] = `url("${canvasToDataUrl(midC)}")`;
        }

        if (doBotSlice) {
          const botC = extractCanvasRegion(
            canvas,
            0,
            canvas.height - botH,
            canvas.width,
            botH
          );

          // Fill interior transparent pixels (e.g. col 6 in left frame, col 1
          // in right frame) that became transparent from auto-color-key.  The
          // function skips edge columns 0 and width-1, so the L-shaped corner
          // cutout at col 0 is preserved.  Fully-transparent rows (e.g. the
          // original bottom CYN row) have no opaque pixels to fill from, so
          // they also stay transparent.
          fillInteriorTransparentPixels(botC);
          vars[botVar] = `url("${canvasToDataUrl(botC)}")`;
        }
      } else {
        vars[mainVar] = `url("${canvasToDataUrl(canvas)}")`;
      }
    };

    emitFrameVars(
      activeCanvas,
      urlVar,
      `${urlVar}-top`,
      `${urlVar}-bot`,
      doTopSlice ? `${urlVar}-top-h` : ""
    );

    if (inactiveCanvas) {
      emitFrameVars(
        inactiveCanvas,
        inactiveVar,
        `${urlVar}-top-i`,
        `${urlVar}-bot-i`,
        ""
      );
    }

    if (doBotSlice) {
      vars[`${urlVar}-bot-h`] = `${botSliceH}px`;
    }

    // Save full-frame canvases for Left/Right so the corner overlay section
    // can extract a captionHeight-tall piece after the loop.
    if (key === "Left") {
      leftSavedCanvas = activeCanvas;
      leftSavedInactive = inactiveCanvas;
      leftSavedIsPerPixel = isPerPixelFrame;
    } else if (key === "Right") {
      rightSavedCanvas = activeCanvas;
      rightSavedInactive = inactiveCanvas;
      rightSavedIsPerPixel = isPerPixelFrame;
    }
  }

  // Frame mid-section sizing: always stretch to fill the area between top/bot
  // slices to prevent the repeat-y upward-tiling artifact where tile content
  // bleeds through transparent rows in the top slice.  When no slices exist,
  // honour the Stretch flag (1 = stretch, 0 = tile).
  const leftStretch = personality.LeftStretch === "1";
  const rightStretch = personality.RightStretch === "1";
  const bottomStretch = personality.BottomStretch === "1";

  if (vars["--skin-frame-left"]) {
    const topH = vars["--skin-frame-left-top-h"];
    const botH = vars["--skin-frame-left-bot-h"];

    if (topH || botH || leftStretch) {
      const parts = [topH, botH].filter(Boolean);

      vars["--skin-frame-left-size-h"] =
        parts.length > 0 ? `calc(100% - ${parts.join(" - ")})` : "100%";
      vars["--skin-frame-left-repeat"] = "no-repeat";
    }
  }

  if (vars["--skin-frame-right"]) {
    const topH = vars["--skin-frame-right-top-h"];
    const botH = vars["--skin-frame-right-bot-h"];

    if (topH || botH || rightStretch) {
      const parts = [topH, botH].filter(Boolean);

      vars["--skin-frame-right-size-h"] =
        parts.length > 0 ? `calc(100% - ${parts.join(" - ")})` : "100%";
      vars["--skin-frame-right-repeat"] = "no-repeat";
    }
  }

  if (vars["--skin-frame-bottom"] && bottomStretch) {
    // Full-width bottom frame; side frame bot-slices (listed earlier in the
    // background-image stack) render on top and handle the corner transitions.
    vars["--skin-frame-bottom-size-w"] = "100%";
    vars["--skin-frame-bottom-repeat"] = "no-repeat";
  }

  // When the bottom frame uses PerPixel alpha (rounded corners), the side
  // frame bottom slices would show straight vertical lines through those
  // rounded corners.  Remove the side frame bottom slices and recalculate
  // the middle section height so it stops where the bottom frame begins.
  // The bottom PerPixel corner pieces (--skin-frame-bottom-left/right)
  // handle the corner transition area.
  if (bottomIsPerPixel && vars["--skin-frame-bottom"]) {
    const bottomW = vars["--skin-frame-bottom-width"] || "0px";

    if (vars["--skin-frame-left"]) {
      const topH = vars["--skin-frame-left-top-h"] || "0px";

      vars["--skin-frame-left-size-h"] = `calc(100% - ${topH} - ${bottomW})`;
      vars["--skin-frame-left-repeat"] = "no-repeat";
      // Hide bot slice — bottom corners handle this area
      delete vars["--skin-frame-left-bot"];
      delete vars["--skin-frame-left-bot-i"];
      vars["--skin-frame-left-bot-h"] = "0px";
    }

    if (vars["--skin-frame-right"]) {
      const topH = vars["--skin-frame-right-top-h"] || "0px";

      vars["--skin-frame-right-size-h"] = `calc(100% - ${topH} - ${bottomW})`;
      vars["--skin-frame-right-repeat"] = "no-repeat";
      delete vars["--skin-frame-right-bot"];
      delete vars["--skin-frame-right-bot-i"];
      vars["--skin-frame-right-bot-h"] = "0px";
    }
  }

  // Compute frame content insets and outsets
  const leftImageWidth = Number.parseInt(
    vars["--skin-frame-left-width"]?.replace("px", "") || "0",
    10
  );
  const rightImageWidth = Number.parseInt(
    vars["--skin-frame-right-width"]?.replace("px", "") || "0",
    10
  );
  const bottomImageHeight = Number.parseInt(
    vars["--skin-frame-bottom-width"]?.replace("px", "") || "0",
    10
  );

  // Content inset: use explicit frame size if specified, otherwise full image width
  const leftInset = leftFrameSize > 0 ? leftFrameSize : leftImageWidth;
  const rightInset = rightFrameSize > 0 ? rightFrameSize : rightImageWidth;
  const bottomInset = bottomFrameSize > 0 ? bottomFrameSize : bottomImageHeight;

  if (vars["--skin-frame-left"] && leftInset > 0) {
    vars["--skin-frame-left-inset"] = `${leftInset}px`;
  }
  if (vars["--skin-frame-right"] && rightInset > 0) {
    vars["--skin-frame-right-inset"] = `${rightInset}px`;
  }
  if (vars["--skin-frame-bottom"] && bottomInset > 0) {
    vars["--skin-frame-bottom-inset"] = `${bottomInset}px`;
  }

  // Outset: how much frame extends outside the window boundary
  const leftOutset = Math.max(0, leftImageWidth - leftInset);
  const rightOutset = Math.max(0, rightImageWidth - rightInset);
  const bottomOutset = Math.max(0, bottomImageHeight - bottomInset);

  if (leftOutset > 0) vars["--skin-frame-left-offset"] = `-${leftOutset}px`;
  if (rightOutset > 0) vars["--skin-frame-right-offset"] = `-${rightOutset}px`;
  if (bottomOutset > 0) {
    vars["--skin-frame-bottom-offset"] = `-${bottomOutset}px`;
  }

  // When frames extend outside, allow visible overflow
  if (leftOutset > 0 || rightOutset > 0 || bottomOutset > 0) {
    vars["--skin-window-contain"] = "size layout style";
    vars["--skin-window-overflow"] = "visible";
  }

  // Extend the titlebar to cover the frame outset area so that the corner
  // overlay backgrounds align with the frame's top-slice in the ::before.
  // Negative margins expand the titlebar box; padding compensates so content
  // (title text, buttons) stays in the original position.
  // For PerPixel side frames, pad by the full frame width (outset + inset)
  // so the BMP titlebar (content-box clipped) doesn't bleed through the
  // semi-transparent side frame pixels in the inset area.
  if (leftOutset > 0) {
    vars["--skin-tb-margin-left"] = `-${leftOutset}px`;
    vars["--skin-tb-pad-left"] = leftSavedIsPerPixel
      ? `${leftImageWidth}px`
      : `${leftOutset}px`;
  }
  if (rightOutset > 0) {
    vars["--skin-tb-margin-right"] = `-${rightOutset}px`;
    vars["--skin-tb-pad-right"] = rightSavedIsPerPixel
      ? `${rightImageWidth}px`
      : `${rightOutset}px`;
  }

  // Clip the titlebar background image to the content-box so it doesn't
  // extend into the negative-margin outset area (which would protrude 1px
  // past the side frame's transparent outer column).
  if (leftOutset > 0 || rightOutset > 0) {
    vars["--skin-tb-clip"] = "content-box";
    vars["--skin-tb-origin"] = "content-box";
  }

  // Trim the bottom frame by 1px on each side so it doesn't extend past
  // the visible side frame edge (transparent outer columns from color-key).
  // Only when side frames have outset — the outset area's outer column is
  // typically color-keyed transparent.  Without outset the outer columns
  // are opaque body pixels and no trim is needed.
  if (
    !bottomIsPerPixel &&
    vars["--skin-frame-bottom"] &&
    (vars["--skin-frame-left"] || vars["--skin-frame-right"]) &&
    (leftOutset > 0 || rightOutset > 0)
  ) {
    vars["--skin-frame-bottom-x"] = "1px";
    vars["--skin-frame-bottom-size-w"] = "calc(100% - 2px)";
  }

  // Expose frame top-zone (corner) pieces as titlebar overlay backgrounds.
  // In WindowBlinds, the left/right frames "own the corners" and render on top
  // of the titlebar.  By adding these as foreground background layers on the
  // titlebar header, the corner gradient blends the titlebar into the side frames.
  //
  // Extract captionHeight pixels (full titlebar height) from the saved frame canvas
  // so the overlay covers the entire titlebar, not just topSliceH.  For PerPixel
  // TGA frames, fillInteriorTransparentPixels is skipped to preserve native
  // anti-aliased alpha; the function would otherwise corrupt semi-transparent
  // corner pixels in the outset zone (columns 1–6 for a 8px/6px-outset frame).
  const buildCornerOverlay = (
    canvas: HTMLCanvasElement | undefined,
    isPerPixel: boolean,
    frameW: number,
    activeVar: string,
    sizeVar: string,
    inactiveCanvas: HTMLCanvasElement | undefined,
    inactiveVar: string
  ): void => {
    if (!canvas || frameW === 0) return;

    const clampedH = Math.min(
      Math.max(1, captionHeight > 0 ? captionHeight : canvas.height),
      canvas.height
    );

    const extractCorner = (src: HTMLCanvasElement): HTMLCanvasElement => {
      const c = extractCanvasRegion(src, 0, 0, src.width, clampedH);

      if (!isPerPixel) fillInteriorTransparentPixels(c);

      return c;
    };

    vars[activeVar] = `url("${canvasToDataUrl(extractCorner(canvas))}")`;
    vars[sizeVar] = `${frameW}px auto`;

    if (inactiveCanvas) {
      vars[inactiveVar] =
        `url("${canvasToDataUrl(extractCorner(inactiveCanvas))}")`;
    }
  };

  if (vars["--skin-frame-left-top"] || leftSavedCanvas) {
    const frameW = Number.parseInt(
      vars["--skin-frame-left-width"]?.replace("px", "") || "0",
      10
    );

    buildCornerOverlay(
      leftSavedCanvas,
      leftSavedIsPerPixel,
      frameW,
      "--skin-tb-corner-left",
      "--skin-tb-corner-left-size",
      leftSavedInactive,
      "--skin-tb-corner-left-i"
    );
  }
  // Skip right corner overlay when the right frame was mirrored from the left.
  // The mirrored frame has left-side colours that don't match the titlebar's
  // right-edge gradient, so letting the titlebar bg-image show through
  // produces a cleaner blend.  The frame border still renders in the outset
  // area via ::before.
  if (vars["--skin-frame-right-top"] || rightSavedCanvas) {
    const frameW = Number.parseInt(
      vars["--skin-frame-right-width"]?.replace("px", "") || "0",
      10
    );

    buildCornerOverlay(
      rightSavedCanvas,
      rightSavedIsPerPixel,
      frameW,
      "--skin-tb-corner-right",
      "--skin-tb-corner-right-size",
      rightSavedInactive,
      "--skin-tb-corner-right-i"
    );
  }
  if (vars["--skin-frame-right-top-i"]) {
    vars["--skin-tb-corner-right-i"] = vars["--skin-frame-right-top-i"];
  }

  // Frame images alone (without titlebar) also warrant outline/shadow suppression
  if (
    !vars["--skin-window-outline"] &&
    (vars["--skin-frame-left"] ||
      vars["--skin-frame-right"] ||
      vars["--skin-frame-bottom"])
  ) {
    vars["--skin-window-outline"] = "none";
    vars["--skin-window-shadow"] = "none";
  }

  // Re-apply border-radius after frame processing may have detected a larger
  // corner from the side frame images (the initial value from fillTransparentEdges
  // only considers the titlebar image).
  if (detectedCornerRadius > 0 && vars["--skin-tb-active-bg"]) {
    vars["--skin-window-border-radius"] = `${detectedCornerRadius}px`;
  }

  // [WindowFrame.TopPerPixel] provides a 32-bit TGA with per-pixel alpha that
  // defines the titlebar's rounded corners and glass transparency.  The TGA's
  // LeftWidth/RightWidth corner pieces are extracted and set as titlebar corner
  // overlays, replacing the side-frame top slices.  The TGA's own alpha channel
  // provides natural anti-aliased rounding — no CSS border-radius needed for
  // the visual curve.  A border-radius is still set on the window section and
  // ::before as a backup clip so that solid backgrounds behind the titlebar
  // don't show through the TGA's transparent corners.
  const topPP = ini["WindowFrame.TopPerPixel"] || {};

  if (topPP.PerPixel === "1" && topPP.Image) {
    const ppExt = pathExt(topPP.Image);
    const ppCands = normalizeSkinPath(topPP.Image, zipFolder);
    const ppData = findEntry(zipEntries, ppCands);

    if (ppData && ppData.length > 0) {
      const ppLExt = ppExt.toLowerCase();
      const ppCanvas =
        ppLExt === ".tga"
          ? decodeTgaToCanvas(ppData)
          : ppLExt === ".bmp"
            ? decodeBmpToCanvas(ppData)
            : undefined;

      if (ppCanvas && ppCanvas.width > 0 && ppCanvas.height > 0) {
        const ppLeftW = Math.max(
          0,
          Number.parseInt(topPP.LeftWidth || "0", 10)
        );
        const ppRightW = Math.max(
          0,
          Number.parseInt(topPP.RightWidth || "0", 10)
        );

        // Active state = top half of the dual-state TGA
        const ppActiveH =
          captionHeight > 0 ? captionHeight : Math.round(ppCanvas.height / 2);
        const ppActiveCanvas = extractCanvasRegion(
          ppCanvas,
          0,
          0,
          ppCanvas.width,
          ppActiveH
        );

        // Extract corner pieces from the TopPerPixel TGA only when the side
        // frames are also PerPixel.  PerPixel side frames have uniform alpha
        // in their top slices (no useful corner content), so the TGA corners
        // with native rounded alpha are the proper replacement.  BMP side
        // frames already have painted corner transitions and don't need (or
        // want) overlapping TGA corner overlays on the titlebar.
        const ppUseSideCorners = leftSavedIsPerPixel || rightSavedIsPerPixel;

        if (ppUseSideCorners) {
          // Extract left corner piece from the TGA
          if (ppLeftW > 0 && ppLeftW < ppCanvas.width) {
            const leftCorner = extractCanvasRegion(
              ppActiveCanvas,
              0,
              0,
              ppLeftW,
              ppActiveH
            );

            vars["--skin-tb-corner-left"] =
              `url("${canvasToDataUrl(leftCorner)}")`;
            vars["--skin-tb-corner-left-size"] = `${ppLeftW}px auto`;

            if (leftSavedIsPerPixel) {
              delete vars["--skin-frame-left-top"];
              delete vars["--skin-frame-left-top-i"];
              // Push the side frame middle start down to the header bottom
              // so it doesn't overlap with the TGA corner on the header
              // (double-layering semi-transparent pixels causes a visible
              // rectangle behind the transparent side frame).
              vars["--skin-frame-left-top-h"] = `${ppActiveH}px`;
              const bottomW = vars["--skin-frame-bottom-width"] || "0px";

              vars["--skin-frame-left-size-h"] =
                `calc(100% - ${ppActiveH}px - ${bottomW})`;
            }
          }

          // Extract right corner piece from the TGA
          if (ppRightW > 0 && ppRightW < ppCanvas.width) {
            const rightCorner = extractCanvasRegion(
              ppActiveCanvas,
              ppCanvas.width - ppRightW,
              0,
              ppRightW,
              ppActiveH
            );

            vars["--skin-tb-corner-right"] =
              `url("${canvasToDataUrl(rightCorner)}")`;
            vars["--skin-tb-corner-right-size"] = `${ppRightW}px auto`;

            if (rightSavedIsPerPixel) {
              delete vars["--skin-frame-right-top"];
              delete vars["--skin-frame-right-top-i"];
              vars["--skin-frame-right-top-h"] = `${ppActiveH}px`;
              const bottomW = vars["--skin-frame-bottom-width"] || "0px";

              vars["--skin-frame-right-size-h"] =
                `calc(100% - ${ppActiveH}px - ${bottomW})`;
            }
          }

          // Extract inactive state corners (bottom half of TGA)
          if (ppCanvas.height > ppActiveH) {
            const ppInactiveCanvas = extractCanvasRegion(
              ppCanvas,
              0,
              ppActiveH,
              ppCanvas.width,
              Math.min(ppActiveH, ppCanvas.height - ppActiveH)
            );

            if (ppLeftW > 0 && ppLeftW < ppCanvas.width) {
              const leftCornerI = extractCanvasRegion(
                ppInactiveCanvas,
                0,
                0,
                ppLeftW,
                ppInactiveCanvas.height
              );

              vars["--skin-tb-corner-left-i"] =
                `url("${canvasToDataUrl(leftCornerI)}")`;
            }

            if (ppRightW > 0 && ppRightW < ppCanvas.width) {
              const rightCornerI = extractCanvasRegion(
                ppInactiveCanvas,
                ppCanvas.width - ppRightW,
                0,
                ppRightW,
                ppInactiveCanvas.height
              );

              vars["--skin-tb-corner-right-i"] =
                `url("${canvasToDataUrl(rightCornerI)}")`;
            }
          }
        } // end ppUseSideCorners

        // Detect corner radius from the TGA's alpha gradient for the backup
        // border-radius clip on the window section and ::before.
        const ppCtx = ppCanvas.getContext("2d");

        if (ppCtx) {
          const ppImgData = ppCtx.getImageData(
            0,
            0,
            ppCanvas.width,
            ppCanvas.height
          ).data;
          const ppBodyRow = Math.min(
            Math.floor(ppCanvas.height / 4),
            ppCanvas.height - 1
          );
          const ppBodyAlpha =
            ppImgData[(ppBodyRow * ppCanvas.width + 0) * 4 + 3];
          let ppCornerRows = 0;

          for (let y = 0; y < ppCanvas.height; y++) {
            if (ppImgData[(y * ppCanvas.width + 0) * 4 + 3] < ppBodyAlpha) {
              ppCornerRows++;
            } else {
              break;
            }
          }

          if (ppCornerRows > detectedCornerRadius) {
            detectedCornerRadius = ppCornerRows;
          }
        }
      }
    }
  }

  // Detect bottom corner radius from [WindowFrame.BottomPerPixel] TGA.
  // Scan from the bottom of the active state upward for transparent rows.
  let detectedBottomRadius = 0;
  const botPP = ini["WindowFrame.BottomPerPixel"] || {};

  if (botPP.PerPixel === "1" && botPP.Image) {
    const bppExt = pathExt(botPP.Image);
    const bppCands = normalizeSkinPath(botPP.Image, zipFolder);
    const bppData = findEntry(zipEntries, bppCands);

    if (bppData && bppData.length > 0) {
      const bppLExt = bppExt.toLowerCase();
      const bppCanvas =
        bppLExt === ".tga"
          ? decodeTgaToCanvas(bppData)
          : bppLExt === ".bmp"
            ? decodeBmpToCanvas(bppData)
            : undefined;

      if (bppCanvas && bppCanvas.width > 0 && bppCanvas.height > 0) {
        const bppCtx = bppCanvas.getContext("2d");

        if (bppCtx) {
          const bppImgData = bppCtx.getImageData(
            0,
            0,
            bppCanvas.width,
            bppCanvas.height
          ).data;

          // Bottom frame is dual-state split by height; active = top half
          const perStateH = Math.round(bppCanvas.height / 2);

          // Sample body alpha from the middle of the active state
          const bppBodyRow = Math.floor(perStateH / 2);
          const bppBodyAlpha =
            bppImgData[(bppBodyRow * bppCanvas.width + 0) * 4 + 3];

          // Scan from the bottom row of the active state upward
          for (let y = perStateH - 1; y >= 0; y--) {
            if (bppImgData[(y * bppCanvas.width + 0) * 4 + 3] < bppBodyAlpha) {
              detectedBottomRadius++;
            } else {
              break;
            }
          }
        }
      }
    }
  }

  // Apply detected corner radii to both the window section and ::before
  if (detectedCornerRadius > 0 || detectedBottomRadius > 0) {
    const topR = detectedCornerRadius > 0 ? `${detectedCornerRadius}px` : "0";
    const botR = detectedBottomRadius > 0 ? `${detectedBottomRadius}px` : "0";

    vars["--skin-window-border-radius"] = topR;
    vars["--skin-window-border-radius-bottom"] = botR;
    vars["--skin-frame-border-radius"] = `${topR} ${topR} ${botR} ${botR}`;
  }

  // ── System colours from [Colours] / [Colors] ──
  const colourMap: Record<string, string> = {
    ButtonDkShadow: "--skin-color-button-dk-shadow",
    ButtonFace: "--skin-color-button-face",
    ButtonHilight: "--skin-color-button-hilight",
    ButtonShadow: "--skin-color-button-shadow",
    ButtonText: "--skin-color-button-text",
    GrayText: "--skin-color-gray-text",
    Hilight: "--skin-color-hilight",
    HilightText: "--skin-color-hilight-text",
    Menu: "--skin-color-menu",
    MenuText: "--skin-color-menu-text",
    Scrollbar: "--skin-color-scrollbar",
    Window: "--skin-color-window",
    WindowText: "--skin-color-window-text",
  };

  for (const [iniKey, cssVar] of Object.entries(colourMap)) {
    const colorVal =
      parseIniColor(colours[iniKey]) || parseIniColor(colors[iniKey]);

    if (colorVal) vars[cssVar] = colorVal;
  }

  // ── Scrollbar width from [Metrics] ──
  const scrollWidth = Number.parseInt(metrics.ScrollWidth || "0", 10);

  if (scrollWidth > 0) {
    vars["--skin-scrollbar-width"] = `${scrollWidth}px`;
  }

  // Case-insensitive INI section lookup (some skins use all-caps section names)
  const iniSection = (name: string): Record<string, string> => {
    if (ini[name]) return ini[name];

    const lower = name.toLowerCase();

    for (const key of Object.keys(ini)) {
      if (key.toLowerCase() === lower) return ini[key];
    }

    return {};
  };

  // ── Scrollbar arrow buttons from [Scrollbar].Image ──
  const scrollbarSection = iniSection("Scrollbar");
  const scrollbarImagePath = scrollbarSection.Image;

  if (scrollbarImagePath) {
    const sbExt = pathExt(scrollbarImagePath);
    const sbCandidates = normalizeSkinPath(scrollbarImagePath, zipFolder);
    const sbData = findEntry(zipEntries, sbCandidates);

    if (sbData && sbData.length > 0) {
      const sbCanvas =
        sbExt.toLowerCase() === ".tga"
          ? decodeTgaToCanvas(sbData)
          : decodeBmpToCanvas(sbData);

      // Load GlyphImage (arrow glyphs overlaid on button background)
      let glyphCanvas: HTMLCanvasElement | undefined;
      const glyphPath = scrollbarSection.GlyphImage;

      if (glyphPath) {
        const glyphExt = pathExt(glyphPath);
        const glyphCandidates = normalizeSkinPath(glyphPath, zipFolder);
        const glyphData = findEntry(zipEntries, glyphCandidates);

        if (glyphData && glyphData.length > 0) {
          glyphCanvas =
            glyphExt.toLowerCase() === ".tga"
              ? decodeTgaToCanvas(glyphData)
              : decodeBmpToCanvas(glyphData);

          // BMP glyphs need color-key applied for transparency
          if (glyphCanvas && glyphExt.toLowerCase() === ".bmp") {
            applyAutoColorKey(glyphCanvas);
          }
        }
      }

      if (sbCanvas) {
        const hasMouse = scrollbarSection.MouseOver === "1";
        const statesPerDir = hasMouse ? 4 : 3;
        const frameW = sbCanvas.height; // Square frames (height = frame size)
        // Total frames: 4 directions × statesPerDir + 3 horiz dots + 3 vert dots + 1 corner
        // Arrow layout: Left(0..N-1), Right(N..2N-1), Up(2N..3N-1), Down(3N..4N-1)

        // Glyph frame size may differ from arrow frame size
        const glyphFrameW = glyphCanvas ? glyphCanvas.height : 0;

        const extractFrame = (frameIndex: number): string | undefined => {
          const sx = frameIndex * frameW;

          if (sx + frameW > sbCanvas.width) return undefined;

          const frame = extractCanvasRegion(
            sbCanvas,
            sx,
            0,
            frameW,
            sbCanvas.height
          );

          // Composite glyph on top of button background (centered)
          if (glyphCanvas && glyphFrameW > 0) {
            const glyphSx = frameIndex * glyphFrameW;

            if (glyphSx + glyphFrameW <= glyphCanvas.width) {
              const ctx = frame.getContext("2d");

              if (ctx) {
                const glyphFrame = extractCanvasRegion(
                  glyphCanvas,
                  glyphSx,
                  0,
                  glyphFrameW,
                  glyphCanvas.height
                );
                // Center the glyph within the arrow button
                const dx = Math.round((frameW - glyphFrameW) / 2);
                const dy = Math.round(
                  (sbCanvas.height - glyphCanvas.height) / 2
                );

                ctx.drawImage(glyphFrame, dx, dy);
              }
            }
          }

          return canvasToDataUrl(frame);
        };

        // Arrow indices: Normal=0, Pressed=1, Disabled=2, Hover=3 (within each direction)
        const directions = [
          { name: "left", offset: 0 },
          { name: "right", offset: statesPerDir },
          { name: "up", offset: statesPerDir * 2 },
          { name: "down", offset: statesPerDir * 3 },
        ];

        for (const { name, offset } of directions) {
          const normal = extractFrame(offset);
          const pressed = extractFrame(offset + 1);
          const hover = hasMouse ? extractFrame(offset + 3) : undefined;

          if (normal) {
            vars[`--skin-scrollbar-arrow-${name}`] = `url("${normal}")`;
          }
          if (pressed) {
            vars[`--skin-scrollbar-arrow-${name}-active`] = `url("${pressed}")`;
          }
          if (hover) {
            vars[`--skin-scrollbar-arrow-${name}-hover`] = `url("${hover}")`;
          }
        }

        // Corner frame (last frame)
        const dotFrames = 6; // 3 horiz + 3 vert
        const cornerIdx = statesPerDir * 4 + dotFrames;
        const corner = extractFrame(cornerIdx);

        if (corner) {
          vars["--skin-scrollbar-corner"] = `url("${corner}")`;
        }
      }
    }
  }

  // ── Scrollbar track from [HorzScroll] / [VertScroll] ──
  const extractScrollTrack = (sectionName: string, varPrefix: string): void => {
    const section = iniSection(sectionName);

    if (!section?.Image) return;

    const ext = pathExt(section.Image);
    const candidates = normalizeSkinPath(section.Image, zipFolder);
    const data = findEntry(zipEntries, candidates);

    if (!data || data.length === 0) return;

    const canvas =
      ext.toLowerCase() === ".tga"
        ? decodeTgaToCanvas(data)
        : decodeBmpToCanvas(data);

    if (!canvas) return;

    // States always arranged horizontally (side by side), typically 4.
    const numStates =
      canvas.width % 4 === 0 ? 4 : canvas.width % 3 === 0 ? 3 : 4;
    const stateW = Math.round(canvas.width / numStates);
    const stateH = canvas.height;
    const isVert = sectionName === "VertScroll";

    // 3-slice: caps stay fixed, middle stretches/tiles
    const capStart = Number.parseInt(
      (isVert ? section.TopHeight : section.LeftWidth) || "0",
      10
    );
    const capEnd = Number.parseInt(
      (isVert ? section.BottomHeight : section.RightWidth) || "0",
      10
    );

    if (capStart > 0 && capEnd > 0) {
      // Extract 3 pieces from the normal (first) state
      const topCap = canvasToDataUrl(
        extractCanvasRegion(
          canvas,
          0,
          0,
          isVert ? stateW : capStart,
          isVert ? capStart : stateH
        )
      );
      const mid = canvasToDataUrl(
        extractCanvasRegion(
          canvas,
          isVert ? 0 : capStart,
          isVert ? capStart : 0,
          isVert ? stateW : 1,
          isVert ? 1 : stateH
        )
      );
      const botCap = canvasToDataUrl(
        extractCanvasRegion(
          canvas,
          isVert ? 0 : stateW - capEnd,
          isVert ? stateH - capEnd : 0,
          isVert ? stateW : capEnd,
          isVert ? capEnd : stateH
        )
      );

      if (topCap) {
        vars[`--skin-scrollbar-track-${varPrefix}-top`] = `url("${topCap}")`;
      }

      if (mid) {
        vars[`--skin-scrollbar-track-${varPrefix}-mid`] = `url("${mid}")`;
      }

      if (botCap) {
        vars[`--skin-scrollbar-track-${varPrefix}-bot`] = `url("${botCap}")`;
      }

      if (capStart > 0) {
        vars[`--skin-scrollbar-track-${varPrefix}-cap-start`] = `${capStart}px`;
      }

      if (capEnd > 0) {
        vars[`--skin-scrollbar-track-${varPrefix}-cap-end`] = `${capEnd}px`;
      }
    } else {
      // No caps — use full state as single repeating image
      const normalTrack = canvasToDataUrl(
        extractCanvasRegion(canvas, 0, 0, stateW, stateH)
      );

      if (normalTrack) {
        vars[`--skin-scrollbar-track-${varPrefix}-mid`] =
          `url("${normalTrack}")`;
      }
    }
  };

  extractScrollTrack("HorzScroll", "h");
  extractScrollTrack("VertScroll", "v");

  // ── Scrollbar thumb from [HorzScrollThumb] / [VertScrollThumb] ──
  // Extracts 3-slice pieces (top/bottom caps + stretchable middle) per state.
  // CSS border-image doesn't work on ::-webkit-scrollbar-thumb, so we use
  // multiple CSS backgrounds to simulate 3-slice rendering.
  const extractScrollThumb = (sectionName: string, varPrefix: string): void => {
    const section = iniSection(sectionName);

    if (!section?.Image) return;

    const ext = pathExt(section.Image);
    const candidates = normalizeSkinPath(section.Image, zipFolder);
    const data = findEntry(zipEntries, candidates);

    if (!data || data.length === 0) return;

    const canvas =
      ext.toLowerCase() === ".tga"
        ? decodeTgaToCanvas(data)
        : decodeBmpToCanvas(data);

    if (!canvas) return;

    if (ext.toLowerCase() === ".bmp" && section.Trans !== "1") {
      applyAutoColorKey(canvas, 3);
    }

    // 3 states always arranged horizontally (Normal, Pressed, Hover)
    const stateW = Math.round(canvas.width / 3);
    const stateH = canvas.height;
    const isVert = varPrefix === "v";

    // Slice values: for vertical thumb, top/bottom caps; for horizontal, left/right caps
    const capStart = Number.parseInt(
      (isVert ? section.TopHeight : section.LeftWidth) || "0",
      10
    );
    const capEnd = Number.parseInt(
      (isVert ? section.BottomHeight : section.RightWidth) || "0",
      10
    );

    const states = ["", "-active", "-hover"];

    for (let i = 0; i < 3; i++) {
      const sx = stateW * i;

      if (capStart > 0 && capEnd > 0) {
        // 3-slice: extract top/left cap, 1px middle strip, bottom/right cap
        const midY = isVert ? capStart : 0;
        const midX = isVert ? 0 : capStart;
        const midW = isVert ? stateW : 1;
        const midH = isVert ? 1 : stateH;

        const topCap = canvasToDataUrl(
          extractCanvasRegion(
            canvas,
            sx,
            0,
            isVert ? stateW : capStart,
            isVert ? capStart : stateH
          )
        );
        const mid = canvasToDataUrl(
          extractCanvasRegion(canvas, sx + midX, midY, midW, midH)
        );
        const botCap = canvasToDataUrl(
          extractCanvasRegion(
            canvas,
            sx + (isVert ? 0 : stateW - capEnd),
            isVert ? stateH - capEnd : 0,
            isVert ? stateW : capEnd,
            isVert ? capEnd : stateH
          )
        );

        if (topCap && mid && botCap) {
          vars[`--skin-scrollbar-thumb-${varPrefix}-top${states[i]}`] =
            `url("${topCap}")`;
          vars[`--skin-scrollbar-thumb-${varPrefix}-mid${states[i]}`] =
            `url("${mid}")`;
          vars[`--skin-scrollbar-thumb-${varPrefix}-bot${states[i]}`] =
            `url("${botCap}")`;
        }
      } else {
        // No slice info — use full image as single background
        const region = canvasToDataUrl(
          extractCanvasRegion(canvas, sx, 0, stateW, stateH)
        );

        if (region) {
          vars[`--skin-scrollbar-thumb-${varPrefix}-mid${states[i]}`] =
            `url("${region}")`;
        }
      }
    }

    // Emit cap sizes for CSS calc()
    if (capStart > 0) {
      vars[`--skin-scrollbar-thumb-${varPrefix}-cap-start`] = `${capStart}px`;
    }

    if (capEnd > 0) {
      vars[`--skin-scrollbar-thumb-${varPrefix}-cap-end`] = `${capEnd}px`;
    }

    // Signal that a skin thumb image exists — override default thumb styling
    vars[`--skin-scrollbar-thumb-${varPrefix}-bg`] = "transparent";
    vars[`--skin-scrollbar-thumb-${varPrefix}-clip`] = "border-box";
    vars[`--skin-scrollbar-thumb-${varPrefix}-border`] = "0";
  };

  extractScrollThumb("HorzScrollThumb", "h");
  extractScrollThumb("VertScrollThumb", "v");

  // ── ExplorerBmp (file manager window background) ──
  const explorerBmpUrl = resolveSkinImage(
    personality.ExplorerBmp,
    zipEntries,
    zipFolder
  );

  if (explorerBmpUrl) {
    vars["--skin-explorer-bg"] = `url("${explorerBmpUrl}")`;
  }

  return vars;
};

export const applySkinVars = (vars: SkinCssVars): void => {
  const root = document.documentElement;

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
};

export const resetSkinVars = (): void => {
  const root = document.documentElement;
  // Remove ALL --skin-* custom properties so no stale vars persist
  // when switching between skins with different feature sets.
  const propsToRemove: string[] = [];

  for (const prop of root.style) {
    if (prop.startsWith("--skin-")) propsToRemove.push(prop);
  }

  for (const key of propsToRemove) {
    root.style.removeProperty(key);
  }
};
