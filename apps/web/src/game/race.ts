/**
 * One race on the stage: track meshes, the car and its ghost, the session
 * and the cameras. Rebuilt from scratch when the track or lane changes.
 */

import { fx, type Command, type PhysicsProfile } from '@limitlap/sim';
import {
  compileTrack,
  createTrackGeometry,
  type TrackGeometry,
  type TrackSpec,
} from '@limitlap/tracks';
import { Vector3, type Object3D, type PerspectiveCamera, type Scene } from 'three';
import type { HudModel } from '../hud/hud.ts';
import { createCarMesh } from '../render/car-mesh.ts';
import { chaseTarget } from '../render/chase.ts';
import { overviewPlacement, type Bounds } from '../render/overview.ts';
import { createTrackMesh, LANE_COLORS } from '../render/track-mesh.ts';
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
  const car = createCarMesh(LANE_COLORS[laneIndex] ?? '#ffffff');
  const ghostCar = createCarMesh('#ffffff', { ghost: true });
  const objects: Object3D[] = [trackMesh, car.object, car.marker, ghostCar.object, ghostCar.marker];
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

  return {
    session,

    update(command) {
      session.update(command);
      for (const event of session.lastEvents) {
        if (event.type === 'deslot') car.flash();
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
      };
    },

    restart() {
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
