/**
 * A deslot on screen: the image of the car flies off the lane and fades, the
 * car itself disappears for a moment, then a ring of the magnetic capture
 * sets it back on the lane.
 */

import type { Pose, Vec3 } from '@limitlap/tracks';
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
  type ColorRepresentation,
  type Group,
  type Material,
  type Scene,
} from 'three';
import { createCarMesh } from './car-mesh.ts';

const FLY = 0.7;
const HIDDEN = 0.3;
const RING_FROM = 0.3;
const RING = 0.5;
const GRAVITY = 25;

export interface DeslotFx {
  readonly debris: Group;
  readonly ring: Mesh;
  /** The real car stays hidden while its image flies off. */
  readonly carHidden: boolean;
  trigger(options: { position: Vec3; velocity: Vec3; capture: Pose }): void;
  update(dt: number): void;
}

export function createDeslotFx(scene: Scene, color: ColorRepresentation): DeslotFx {
  const debris = createCarMesh(color, { ghost: true }).object;
  debris.visible = false;
  const materials: { material: Material & { opacity: number }; base: number }[] = [];
  debris.traverse((node) => {
    const material = (node as Mesh).material as (Material & { opacity: number }) | undefined;
    if (material) materials.push({ material, base: material.opacity });
  });

  const ringMaterial = new MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
  });
  const ring = new Mesh(new RingGeometry(0.8, 1.15, 40), ringMaterial);
  ring.visible = false;
  scene.add(debris, ring);

  const velocity = new Vector3();
  const spinAxis = new Vector3(0, 1, 0);
  const normal = new Vector3();
  const fromZ = new Vector3(0, 0, 1);
  const turn = new Quaternion();
  let age = Infinity;

  const fx: DeslotFx = {
    debris,
    ring,
    get carHidden() {
      return age < HIDDEN;
    },
    trigger({ position, velocity: v, capture }) {
      age = 0;
      debris.position.set(...position);
      debris.rotation.set(0, Math.atan2(-v[2], v[0]), 0);
      velocity.set(...v);
      spinAxis.set(capture.up[0], capture.up[1], capture.up[2]);
      debris.visible = true;

      normal.set(...capture.up);
      ring.quaternion.setFromUnitVectors(fromZ, normal);
      ring.position.set(
        capture.position[0] + capture.up[0] * 0.3,
        capture.position[1] + capture.up[1] * 0.3,
        capture.position[2] + capture.up[2] * 0.3,
      );
    },
    update(dt) {
      if (age === Infinity) return;
      age += dt;

      debris.visible = age < FLY;
      if (debris.visible) {
        velocity.y -= GRAVITY * dt;
        debris.position.addScaledVector(velocity, dt);
        turn.setFromAxisAngle(spinAxis, 9 * dt);
        debris.quaternion.premultiply(turn);
        for (const { material, base } of materials) material.opacity = base * (1 - age / FLY);
      }

      const ringAge = age - RING_FROM;
      ring.visible = ringAge >= 0 && ringAge < RING;
      if (ring.visible) {
        const k = ringAge / RING;
        ring.scale.setScalar(0.6 + 3 * k);
        ringMaterial.opacity = 1 - k;
      }
      if (!debris.visible && ringAge >= RING) age = Infinity;
    },
  };
  return fx;
}
