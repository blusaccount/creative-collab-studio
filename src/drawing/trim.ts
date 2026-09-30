/**
 * Crops a canvas to the bounding box of its non-transparent pixels.
 * Returns the original canvas unchanged when it is fully transparent.
 */
export function trimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const { width, height } = canvas;
  if (width === 0 || height === 0) return canvas;

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return canvas;
  }

  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[rowStart + x * 4 + 3] !== 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right < left || bottom < top) return canvas;

  const trimmedWidth = right - left + 1;
  const trimmedHeight = bottom - top + 1;
  if (trimmedWidth === width && trimmedHeight === height) return canvas;

  const out = document.createElement('canvas');
  out.width = trimmedWidth;
  out.height = trimmedHeight;
  const outCtx = out.getContext('2d');
  if (!outCtx) return canvas;
  outCtx.drawImage(canvas, left, top, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
  return out;
}
