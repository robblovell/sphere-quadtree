import { PerspectiveCamera } from "three";
import { describe, expect, it, vi } from "vitest";

import { GlobeControls } from "./GlobeControls";

describe("GlobeControls", () => {
  it("reverses vertical dragging while preserving horizontal rotation", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(3, 0, 0);
    const canvas = Object.assign(new EventTarget(), {
      setPointerCapture: vi.fn(),
    }) as HTMLCanvasElement;
    new GlobeControls(camera, canvas);
    const pointer = (type: string, clientX: number, clientY: number): void => {
      canvas.dispatchEvent(
        Object.assign(new Event(type), {
          button: 0,
          clientX,
          clientY,
          pointerId: 1,
        }),
      );
    };

    pointer("pointerdown", 0, 0);
    pointer("pointermove", 0, 20);
    expect(camera.position.z).toBeGreaterThan(0);
    pointer("pointermove", 0, -20);
    expect(camera.position.z).toBeLessThan(0);
    pointer("pointermove", 20, -20);
    expect(camera.position.y).toBeLessThan(0);
    pointer("pointerup", 20, -20);
    const position = camera.position.clone();
    pointer("pointermove", 20, 20);
    expect(camera.position.equals(position)).toBe(true);
  });
});
