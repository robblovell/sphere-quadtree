import { MathUtils, PerspectiveCamera } from "three";

export class GlobeControls {
  private distance: number;
  private last: [number, number] | undefined;
  private phi: number;
  private theta: number;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.distance = camera.position.length();
    this.theta = Math.atan2(camera.position.y, camera.position.x);
    this.phi = Math.acos(camera.position.z / this.distance);
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.last = [event.clientX, event.clientY];
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.last) return;
      this.theta -= (event.clientX - this.last[0]) * 0.006;
      this.phi = MathUtils.clamp(
        this.phi + (event.clientY - this.last[1]) * 0.006,
        0.01,
        Math.PI - 0.01,
      );
      this.last = [event.clientX, event.clientY];
      this.update();
    });
    const stop = (): void => {
      this.last = undefined;
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.distance = MathUtils.clamp(
          this.distance * Math.exp(event.deltaY * 0.001),
          1.25,
          12,
        );
        this.update();
      },
      { passive: false },
    );
    this.update();
  }

  private update(): void {
    const horizontal = this.distance * Math.sin(this.phi);
    this.camera.position.set(
      horizontal * Math.cos(this.theta),
      horizontal * Math.sin(this.theta),
      this.distance * Math.cos(this.phi),
    );
    this.camera.lookAt(0, 0, 0);
  }
}
