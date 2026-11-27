import { useEffect, useRef, useState } from "react";
import { RuneLoader } from "@/components/layout/RuneLoader";
import { DEFAULT_SCENE_ASSETS } from "./assets";
import { MonolithScene, type BootQuality, type SceneAssets, type SceneColors } from "./MonolithScene";

/** Read a CSS color token as RGB in 0..1, through a 2D canvas so any CSS color works. */
function readColor(token: string, fallback: [number, number, number]): [number, number, number] {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const context = document.createElement("canvas").getContext("2d");
  if (!value || !context) return fallback;
  context.fillStyle = "#000";
  context.fillStyle = value;
  const normalized = context.fillStyle;
  const hex = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (hex) {
    const number = parseInt(hex[1], 16);
    return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
  }
  const rgb = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/i.exec(normalized);
  return rgb ? [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255] : fallback;
}

function readColors(): SceneColors {
  return {
    primary: readColor("--primary", [0.44, 0.81, 0.75]),
    base: readColor("--bg", [0.075, 0.086, 0.082]),
  };
}

/**
 * Properties for the {@link MonolithLoader} component.
 */
interface MonolithLoaderProps {
  /** Boot progress from 0 to 100. */
  percent: number;
  /** The boot finished: the runes flare before the screen fades out. */
  complete: boolean;
  /** Download activity from 0 to 1; rocks and embers move faster with it. */
  activity?: number;
  /** Detail of the scene. */
  quality: BootQuality;
  /** Model and textures; the launcher monolith by default. */
  assets?: SceneAssets;
}

/**
 * Full-screen boot scene: a floating rune monolith that lights up with the boot progress.
 *
 * Falls back to the rune ring when WebGL or the assets are not available, or when the
 * system asks for reduced motion.
 */
export function MonolithLoader({ percent, complete, activity = 0, quality, assets = DEFAULT_SCENE_ASSETS }: MonolithLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<MonolithScene | null>(null);
  const [failed, setFailed] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || failed) return;
    let cancelled = false;
    let scene: MonolithScene | null = null;
    MonolithScene.create(canvas, assets, quality)
      .then((created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        scene = created;
        sceneRef.current = created;
        created.setColors(readColors());
        created.start();
        setReady(true);
      })
      .catch((error: unknown) => {
        console.error("Could not start the boot scene; using the rune ring", error);
        if (!cancelled) setFailed(true);
      });

    // The theme may load while the boot runs: follow its colors.
    const colors = window.setInterval(() => scene?.setColors(readColors()), 1000);
    const visibility = () => (document.hidden ? scene?.stop() : scene?.start());
    document.addEventListener("visibilitychange", visibility);
    const lost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => {
      cancelled = true;
      window.clearInterval(colors);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", lost);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [assets, quality, failed]);

  useEffect(() => {
    sceneRef.current?.setProgress(percent / 100);
  }, [percent, ready]);

  useEffect(() => {
    sceneRef.current?.setActivity(activity);
  }, [activity, ready]);

  useEffect(() => {
    sceneRef.current?.setComplete(complete);
  }, [complete, ready]);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center pb-24">
        <RuneLoader percent={percent} complete={complete} activity={activity} />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
      aria-hidden="true"
    />
  );
}
