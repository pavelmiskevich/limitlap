/**
 * One race on the stage: track meshes, the car and its ghost, the session
 * and the cameras. Rebuilt from scratch when the track or lane changes.
 */

import {
  fx,
  type Command,
  type DeslotCause,
  type PhysicsProfile,
  type SimEvent,
} from '@limitlap/sim';
import {
  compileTrack,
  createTrackGeometry,
  type TrackGeometry,
  type TrackSpec,
  type Vec3,
} from '@limitlap/tracks';
import { Vector3, type Object3D, type PerspectiveCamera, type Scene } from 'three';
import { vibrate } from '../haptics.ts';
import type { HudModel } from '../hud/hud.ts';
import { WARN_FROM } from '../hud/warning.ts';
import { createCarMesh } from '../render/car-mesh.ts';
import { createDeslotFx } from '../render/deslot-fx.ts';
import { chaseTarget } from '../render/chase.ts';
import { overviewPlacement, type Bounds } from '../render/overview.ts';
import { createTrackMesh, LANE_COLORS } from '../render/track-mesh.ts';
import { outwardSign } from '../render/turn.ts';
import {
  buildGhost,
  ghostDistanceAt,
  ghostKey,
  ghostTimeAt,
  loadGhost,
  recordBestLap,
  saveGhost,
  type Ghost,
  type GhostRecord,
} from './ghost.ts';
import { createSession, type Session } from './session.ts';

export type View = 'chase' | 'overview';

const SHAKE = 0.35;

export interface RaceOptions {
  scene: Scene;
  spec: TrackSpec;
  lane: number;
  profile: PhysicsProfile;
}

export interface Race {
  readonly session: Session;
  update(command: Command): void;
  /** Draws the car and ghost, moves the camera and returns what the HUD shows. */
  render(alpha: number, dt: number, camera: PerspectiveCamera, view: View): HudModel;
  /** New attempt on the same track. */
  restart(): void;
  /** Switch physics; the attempt restarts and the ghost of that profile is loaded. */
  setProfile(profile: PhysicsProfile): void;
  dispose(): void;
}

export function createRace({ scene, spec, lane: laneIndex, profile }: RaceOptions): Race {
  const geometry = createTrackGeometry(spec);
  const path = geometry.lanes[laneIndex];
  if (!path) throw new Error(`track ${spec.id} has no lane ${laneIndex}`);
  const session = createSession({ track: compileTrack(spec), lane: laneIndex, profile });

  const trackMesh = createTrackMesh(spec, geometry);
  const color = LANE_COLORS[laneIndex] ?? '#ffffff';
  const car = createCarMesh(color);
  const deslotFx = createDeslotFx(scene, color);
  const ghostCar = createCarMesh('#ffffff', { ghost: true });
  const objects: Object3D[] = [
    trackMesh,
    car.object,
    car.marker,
    ghostCar.object,
    ghostCar.marker,
    deslotFx.debris,
    deslotFx.ring,
  ];
  scene.add(...objects);

  let storeKey = '';
  let ghost: Ghost | null = null;
  const loadBest = () => {
    storeKey = ghostKey(`${spec.id}@${spec.version}`, session.profile.key, laneIndex);
    const stored = loadGhost(storeKey);
    ghost = stored ? tryBuildGhost(stored, session) : null;
  };
  loadBest();

  const bounds = trackBounds(geometry);
  const lookAt = new Vector3();
  const desired = new Vector3();
  const desiredLook = new Vector3();
  const desiredUp = new Vector3();
  let snapCamera = true;
  let lastView: View | null = null;
  let pendingDeslot: DeslotCause | null = null;
  let shakeLeft = 0;
  let previousGrip = fx.ZERO;
  const WARN = fx.fromFloat(WARN_FROM);

  const showDeslot = (event: Extract<SimEvent, { type: 'deslot' }>) => {
    const at = fx.toNumber(event.distance);
    const pose = path.sample(at);
    const speed = fx.toNumber(session.previous.speed);
    const out = outwardSign(path, at);
    // Off the outside of the turn, or straight on and down when the car falls from a loop.
    const side = event.cause === 'too-slow' ? 0 : out * 0.35;
    const along = event.cause === 'too-slow' ? 0.6 : 1;
    deslotFx.trigger({
      position: [
        pose.position[0] + pose.up[0] * 0.4,
        pose.position[1] + pose.up[1] * 0.4,
        pose.position[2] + pose.up[2] * 0.4,
      ],
      velocity: [0, 1, 2].map(
        (k) => speed * (along * (pose.forward[k] ?? 0) + side * (pose.left[k] ?? 0)),
      ) as unknown as Vec3,
      capture: path.sample(fx.toNumber(session.state.distance)),
    });
    pendingDeslot = event.cause;
    shakeLeft = SHAKE;
    vibrate([60, 40, 120]);
  };

  const takeDeslot = () => {
    const cause = pendingDeslot;
    pendingDeslot = null;
    return cause;
  };

  return {
    session,

    update(command) {
      session.update(command);
      if (previousGrip < WARN && session.state.grip >= WARN) vibrate(25);
      previousGrip = session.state.grip;
      for (const event of session.lastEvents) {
        if (event.type === 'deslot') showDeslot(event);
        if (event.type === 'lap' && (ghost === null || event.time < ghost.record.lapTime)) {
          const record = recordBestLap(session, event);
          saveGhost(storeKey, record);
          ghost = tryBuildGhost(record, session);
        }
      }
    },

    render(alpha, dt, camera, view) {
      const distance = session.renderDistance(alpha);
      car.update(path, distance, fx.toNumber(session.state.slip), dt);
      deslotFx.update(dt);
      car.object.visible = !deslotFx.carHidden;

      const sinceLapStart = session.previous.tick + alpha - fx.toNumber(session.state.lapStart);
      const ghostDistance = ghost ? ghostDistanceAt(ghost, sinceLapStart) : null;
      ghostCar.object.visible = ghostDistance !== null;
      if (ghostDistance !== null) ghostCar.update(path, ghostDistance, 0, dt);

      if (view !== lastView) snapCamera = true;
      lastView = view;
      if (view === 'overview') {
        const { position, target, up } = overviewPlacement(bounds, camera.fov, camera.aspect);
        camera.up.set(...up);
        camera.position.set(...position);
        camera.lookAt(...target);
        car.showMarker(position[1]);
        ghostCar.showMarker(ghostDistance === null ? null : position[1]);
      } else {
        car.showMarker(null);
        ghostCar.showMarker(null);
        const target = chaseTarget(path, distance);
        desired.set(...target.position);
        desiredLook.set(...target.lookAt);
        desiredUp.set(...target.up);
        // Exponential smoothing, independent of the frame rate; snap after a jump.
        const k = snapCamera ? 1 : 1 - Math.exp(-10 * dt);
        camera.position.lerp(desired, k);
        lookAt.lerp(desiredLook, k);
        camera.up.lerp(desiredUp, k).normalize();
        camera.lookAt(lookAt);
        snapCamera = false;
        // A short shake on a deslot, fading out.
        shakeLeft = Math.max(0, shakeLeft - dt);
        if (shakeLeft > 0) {
          const a = (shakeLeft / SHAKE) * 0.35;
          camera.position.x += (Math.random() - 0.5) * a;
          camera.position.y += (Math.random() - 0.5) * a;
          camera.position.z += (Math.random() - 0.5) * a;
        }
      }

      const { state } = session;
      const lapTicks = state.tick - fx.toNumber(state.lapStart);
      const ghostTime = ghost ? ghostTimeAt(ghost, fx.toNumber(state.distance)) : null;
      return {
        lapTime: Math.max(0, lapTicks),
        best: ghost ? ghost.lapTime : null,
        delta: ghostTime === null ? null : lapTicks - ghostTime,
        speed: fx.toNumber(state.speed),
        grip: fx.toNumber(state.grip),
        deslots: session.events.filter((e) => e.type === 'deslot').length,
        deslot: takeDeslot(),
      };
    },

    restart() {
      pendingDeslot = null;
      session.reset();
      snapCamera = true;
    },

    setProfile(next) {
      session.profile = next;
      loadBest();
      session.reset();
      snapCamera = true;
    },

    dispose() {
      scene.remove(...objects);
      for (const object of objects) {
        object.traverse((node) => {
          const mesh = node as { geometry?: { dispose(): void }; material?: unknown };
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials)
            (material as { dispose?(): void } | undefined)?.dispose?.();
        });
      }
    },
  };
}

/** A stored ghost that no longer replays (e.g. after a format change) is ignored. */
function tryBuildGhost(record: GhostRecord, session: Session): Ghost | null {
  try {
    return buildGhost(record, session.lane, session.profile);
  } catch {
    return null;
  }
}

function trackBounds(geometry: TrackGeometry): Bounds {
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let s = 0; s < geometry.centre.length; s += 5) {
    const [x, , z] = geometry.centre.sample(s).position;
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  }
  return bounds;
}
