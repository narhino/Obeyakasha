"use client";

import { useEffect, useRef } from "react";

/**
 * Looping hypnotic spiral (PLAN §9, F6). Canvas 2D, no strobe. Honors
 * prefers-reduced-motion by rendering a still breathing gradient instead.
 * `speed` and `intensity` are 0..1.
 */
export function Spiral({
  speed = 0.5,
  intensity = 0.6,
  variant = "spiral",
}: {
  speed?: number;
  intensity?: number;
  variant?: "spiral" | "double" | "tunnel";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    let t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const c = canvas as HTMLCanvasElement;
      const rect = c.getBoundingClientRect();
      c.width = Math.max(1, Math.floor(rect.width * dpr));
      c.height = Math.max(1, Math.floor(rect.height * dpr));
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const accent =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-spiral-a")
        .trim() || "#7a1f3d";
    const gold =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-spiral-b")
        .trim() || "#c9a227";

    function draw() {
      const c = canvas as HTMLCanvasElement;
      const g = ctx as CanvasRenderingContext2D;
      const w = c.width;
      const h = c.height;
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.hypot(w, h) / 2;

      g.clearRect(0, 0, w, h);
      g.fillStyle = "#0b0a0e";
      g.fillRect(0, 0, w, h);

      const arms = variant === "double" ? 2 : 1;
      const turns = variant === "tunnel" ? 5 : 3.2;
      const alpha = 0.15 + intensity * 0.5;

      for (let a = 0; a < arms; a++) {
        g.beginPath();
        const armOffset = (a / arms) * Math.PI * 2;
        for (let i = 0; i < 720; i++) {
          const p = i / 720;
          const angle = p * Math.PI * 2 * turns + t + armOffset;
          const r = p * maxR;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, maxR);
        grad.addColorStop(0, gold);
        grad.addColorStop(1, accent);
        g.strokeStyle = grad;
        g.globalAlpha = alpha;
        g.lineWidth = (variant === "tunnel" ? 6 : 10) * dpr;
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    if (reduced) {
      draw();
      return () => {
        ro.disconnect();
      };
    }

    function frame() {
      t += 0.002 + speed * 0.02;
      draw();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [speed, intensity, variant]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      aria-hidden
      style={{ display: "block" }}
    />
  );
}
