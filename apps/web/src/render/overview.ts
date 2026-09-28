/** Overview camera: straight above the track, the whole lap in frame. */

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Placement {
  position: [number, number, number];
  target: [number, number, number];
  /** Camera up vector: the world direction that points up on screen. */
  up: [number, number, number];
}

const MARGIN = 1.12;

export function overviewPlacement(bounds: Bounds, fovDegrees: number, aspect: number): Placement {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const sizeX = bounds.maxX - bounds.minX;
  const sizeZ = bounds.maxZ - bounds.minZ;

  // Turn the long side of the track along the long side of the screen.
  const xAlongScreen = aspect < 1 ? sizeX >= sizeZ : sizeX < sizeZ;
  const vertical = (xAlongScreen ? sizeX : sizeZ) * MARGIN;
  const horizontal = (xAlongScreen ? sizeZ : sizeX) * MARGIN;

  const tan = Math.tan((fovDegrees * Math.PI) / 360);
  const height = Math.max(vertical / 2 / tan, horizontal / 2 / (tan * aspect));

  return {
    position: [cx, height, cz],
    target: [cx, 0, cz],
    up: xAlongScreen ? [1, 0, 0] : [0, 0, -1],
  };
}
