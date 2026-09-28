/**
 * Procedural antigravity car: a dark wedge with neon edges and an underglow
 * that turns red in the edge zone and flashes white on a deslot.
 */

import type { LanePath } from '@limitlap/tracks';
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type ColorRepresentation,
} from 'three';
import { outwardSign } from './turn.ts';

const HOVER = 0.4;
const MAX_YAW = (14 * Math.PI) / 180;
const MAX_DRIFT = 0.6;
const FLASH_SECONDS = 0.4;

function wedge(): BufferGeometry {
  // Local axes: +X forward, +Y up, +Z right.
  const v = [
    [-2, 0, -0.8],
    [-2, 0, 0.8],
    [-2, 0.55, -0.7],
    [-2, 0.55, 0.7],
    [2, 0, -0.5],
    [2, 0, 0.5],
    [2, 0.15, -0.4],
    [2, 0.15, 0.4],
  ];
  const quads = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
    [2, 3, 7, 6],
    [0, 4, 5, 1],
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(v.flat()), 3));
  geometry.setIndex(quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]) as number[]);
  return geometry;
}

export interface CarView {
  readonly object: Group;
  /** Flat disc that marks the car in the overview; hidden in other views. */
  readonly marker: Mesh;
  /** Shows the marker at a size readable from `cameraHeight`, or hides it. */
  showMarker(cameraHeight: number | null): void;
  /** Places the car at `distance` along its lane; `slip` is 0…1 from the simulation. */
  update(lane: LanePath, distance: number, slip: number, dt: number): void;
  flash(): void;
}

export interface CarOptions {
  /** A see-through car for the ghost. */
  ghost?: boolean;
}

export function createCarMesh(
  color: ColorRepresentation,
  { ghost = false }: CarOptions = {},
): CarView {
  const object = new Group();
  const body = wedge();
  const see = ghost ? { transparent: true, opacity: 0.28, depthWrite: false } : {};
  object.add(new Mesh(body, new MeshBasicMaterial({ color: '#0d1426', ...see })));
  object.add(new LineSegments(new EdgesGeometry(body), new LineBasicMaterial({ color, ...see })));

  const glowMaterial = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
    side: DoubleSide,
  });
  const glow = new Mesh(new PlaneGeometry(3.6, 1.4), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.2;
  object.add(glow);

  const marker = new Mesh(
    new CircleGeometry(1, 24),
    new MeshBasicMaterial({
      color,
      side: DoubleSide,
      depthTest: false,
      transparent: ghost,
      opacity: ghost ? 0.6 : 1,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 10;
  marker.visible = false;

  const base = new Color(color);
  const hot = new Color('#ff3b1f');
  const white = new Color('#ffffff');
  let flashLeft = 0;

  const forward = new Vector3();
  const up = new Vector3();
  const right = new Vector3();
  const basis = new Matrix4();

  return {
    object,
    marker,
    showMarker(cameraHeight) {
      marker.visible = cameraHeight !== null;
      if (cameraHeight !== null) marker.scale.setScalar(cameraHeight * (ghost ? 0.011 : 0.014));
    },
    flash() {
      flashLeft = FLASH_SECONDS;
    },
    update(lane, distance, slip, dt) {
      const pose = lane.sample(distance);
      forward.set(...pose.forward);
      up.set(...pose.up);
      const outward = outwardSign(lane, distance); // along `left`

      // Oversteer: the nose swings inward, the car drifts outward.
      forward.applyAxisAngle(up, -outward * slip * MAX_YAW);
      right.crossVectors(forward, up).normalize();
      basis.makeBasis(forward, up, right);
      object.quaternion.setFromRotationMatrix(basis);

      const drift = outward * slip * MAX_DRIFT;
      object.position.set(
        pose.position[0] + pose.up[0] * HOVER + pose.left[0] * drift,
        pose.position[1] + pose.up[1] * HOVER + pose.left[1] * drift,
        pose.position[2] + pose.up[2] * HOVER + pose.left[2] * drift,
      );

      marker.position.set(pose.position[0], pose.position[1] + 1, pose.position[2]);

      flashLeft = Math.max(0, flashLeft - dt);
      glowMaterial.color.copy(base).lerp(hot, Math.min(1, slip * 1.2));
      if (flashLeft > 0) glowMaterial.color.lerp(white, flashLeft / FLASH_SECONDS);
      glow.scale.setScalar(1 + (flashLeft / FLASH_SECONDS) * 0.6);
    },
  };
}
