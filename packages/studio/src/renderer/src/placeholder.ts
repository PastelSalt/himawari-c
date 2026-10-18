/**
 * The procedural placeholder maker (plan §11.3, P5): labeled color cards for
 * backgrounds and event pictures, and simple layered silhouettes for
 * characters. Drawn with a canvas from a name and a color; never AI (§1.5).
 */

export type PlaceholderKind = "bg" | "cg" | "character";

function hsl(hex: string, dl: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.max(0, Math.min(100, Math.round(l * 100 + dl)))}%)`;
}

async function png(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

/** A 1920×1080 card: a soft gradient, a horizon, and the name. */
export async function makeCard(label: string, color: string, sub: string): Promise<Uint8Array> {
  const c = new OffscreenCanvas(1920, 1080);
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 1080);
  grad.addColorStop(0, hsl(color, 18));
  grad.addColorStop(1, hsl(color, -22));
  g.fillStyle = grad;
  g.fillRect(0, 0, 1920, 1080);
  g.fillStyle = hsl(color, -30);
  g.globalAlpha = 0.35;
  g.beginPath();
  g.moveTo(0, 760);
  for (let x = 0; x <= 1920; x += 160) g.lineTo(x, 740 + Math.sin(x / 300) * 40);
  g.lineTo(1920, 1080);
  g.lineTo(0, 1080);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.textAlign = "center";
  g.font = "600 96px 'Noto Sans', 'Noto Sans JP', sans-serif";
  g.fillText(label, 960, 520);
  g.font = "400 40px 'Noto Sans', 'Noto Sans JP', sans-serif";
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.fillText(sub, 960, 590);
  return png(c);
}

/** A layered placeholder character: body/base, plus eyes and mouth so expressions, blink, and lip-flap work. */
export async function makeCharacter(name: string, color: string): Promise<Record<string, Uint8Array>> {
  const W = 800;
  const H = 1400;
  const layer = async (draw: (g: OffscreenCanvasRenderingContext2D) => void) => {
    const c = new OffscreenCanvas(W, H);
    draw(c.getContext("2d")!);
    return png(c);
  };
  const out: Record<string, Uint8Array> = {};
  out["body/base.png"] = await layer((g) => {
    g.fillStyle = hsl(color, 0);
    g.beginPath();
    g.ellipse(400, 420, 190, 220, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(120, 1400);
    g.bezierCurveTo(120, 820, 680, 820, 680, 1400);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.textAlign = "center";
    g.font = "600 64px 'Noto Sans', 'Noto Sans JP', sans-serif";
    g.fillText(name, 400, 1180);
  });
  const eyes = (shape: "open" | "half" | "closed" | "smile") => (g: OffscreenCanvasRenderingContext2D) => {
    g.fillStyle = "#1c1c26";
    g.strokeStyle = "#1c1c26";
    g.lineWidth = 12;
    g.lineCap = "round";
    for (const x of [330, 470]) {
      g.beginPath();
      if (shape === "open") g.ellipse(x, 400, 22, 34, 0, 0, Math.PI * 2);
      else if (shape === "half") g.ellipse(x, 410, 24, 14, 0, 0, Math.PI * 2);
      if (shape === "open" || shape === "half") g.fill();
      else if (shape === "closed") {
        g.moveTo(x - 26, 410);
        g.lineTo(x + 26, 410);
        g.stroke();
      } else {
        g.arc(x, 415, 26, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
    }
  };
  out["eyes/neutral.png"] = await layer(eyes("open"));
  out["eyes/neutral_half.png"] = await layer(eyes("half"));
  out["eyes/neutral_closed.png"] = await layer(eyes("closed"));
  out["eyes/smile.png"] = await layer(eyes("smile"));
  const mouth = (shape: "neutral" | "open" | "smile" | "smile_open") => (g: OffscreenCanvasRenderingContext2D) => {
    g.strokeStyle = "#1c1c26";
    g.fillStyle = "#5a2330";
    g.lineWidth = 10;
    g.lineCap = "round";
    g.beginPath();
    if (shape === "neutral") {
      g.moveTo(370, 520);
      g.lineTo(430, 520);
      g.stroke();
    } else if (shape === "smile") {
      g.arc(400, 495, 40, Math.PI * 0.2, Math.PI * 0.8);
      g.stroke();
    } else {
      g.ellipse(400, 525, shape === "open" ? 22 : 34, shape === "open" ? 26 : 22, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  out["mouth/neutral.png"] = await layer(mouth("neutral"));
  out["mouth/neutral_open.png"] = await layer(mouth("open"));
  out["mouth/smile.png"] = await layer(mouth("smile"));
  out["mouth/smile_open.png"] = await layer(mouth("smile_open"));
  return out;
}
