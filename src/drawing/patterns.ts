let checkerPattern: HTMLCanvasElement | null = null;
let paperPattern: HTMLCanvasElement | null = null;

export function getCheckerPattern(): HTMLCanvasElement {
  if (checkerPattern) return checkerPattern;
  const size = 16;
  const cell = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#d6d6d6';
  ctx.fillRect(0, 0, cell, cell);
  ctx.fillRect(cell, cell, cell, cell);
  checkerPattern = canvas;
  return canvas;
}

export function getPaperPattern(): HTMLCanvasElement {
  if (paperPattern) return paperPattern;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4ecdb';
  ctx.fillRect(0, 0, size, size);

  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 22;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(image, 0, 0);

  ctx.strokeStyle = 'rgba(120, 96, 60, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 120; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
    ctx.stroke();
  }

  paperPattern = canvas;
  return canvas;
}

export const BACKGROUND_COLORS = {
  white: '#ffffff',
  dark: '#1b1e26',
  paper: '#f4ecdb',
} as const;
