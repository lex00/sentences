// Phase 0 bootstrap: a hi-DPI canvas with hot reload. No engine logic yet —
// the type contracts live in ir/scene/theme/anim/effects/layout and are checked by `tsc`.

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas context unavailable");

// Crisp on retina: back the canvas with devicePixelRatio and scale the drawing context.
function fitToDisplay(cssW: number, cssH: number): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function frame(): void {
  const cssW = 900;
  const cssH = 500;
  fitToDisplay(cssW, cssH);
  ctx!.clearRect(0, 0, cssW, cssH);

  // Placeholder so we can see the canvas is alive: a faint baseline where a diagram will sit.
  ctx!.strokeStyle = "#d8d2c4";
  ctx!.lineWidth = 1;
  ctx!.beginPath();
  ctx!.moveTo(120, cssH / 2);
  ctx!.lineTo(cssW - 120, cssH / 2);
  ctx!.stroke();
}

frame();

if (import.meta.hot) {
  import.meta.hot.accept();
}
