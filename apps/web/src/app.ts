/**
 * Application shell: a Three.js renderer sized to the screen and the frame
 * loop — fixed simulation steps first, then a draw with interpolation.
 */

import { Color, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { DEFAULT_PROFILE, fx } from '@limitlap/sim';
import {
  compileTrack,
  createTrackGeometry,
  PROTO_RING,
  type TrackGeometry,
} from '@limitlap/tracks';
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
} from './game/ghost.ts';
import { createSession, type Session } from './game/session.ts';
import { createHud } from './hud/hud.ts';
import { createControls } from './input/controls.ts';
import { combine } from './input/input.ts';
import { createKeyboard } from './input/keyboard.ts';
import { createFixedStep } from './loop.ts';
import { createCarMesh } from './render/car-mesh.ts';
import { chaseTarget } from './render/chase.ts';
import { overviewPlacement, type Bounds } from './render/overview.ts';
import { createTrackMesh, LANE_COLORS } from './render/track-mesh.ts';

export interface Game {
  /** One simulation step (1/60 s). */
  update(): void;
  /** Draw; `alpha` is the share of the next step already elapsed, `dt` the frame time in seconds. */
  render(alpha: number, dt: number): void;
}

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
}

export function createStage(root: HTMLElement): Stage {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  root.append(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#05060a');
  const camera = new PerspectiveCamera(60, 1, 0.1, 5000);

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = root;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(root);
  resize();

  return { renderer, scene, camera };
}

export function runLoop(stage: Stage, game: Game): () => void {
  const clock = createFixedStep();
  let frame = 0;
  let last: number | null = null;
  const tick = (now: number) => {
    const { steps, alpha } = clock.advance(now);
    for (let i = 0; i < steps; i++) game.update();
    const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
    last = now;
    game.render(alpha, dt);
    stage.renderer.render(stage.scene, stage.camera);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  // A hidden tab stops requestAnimationFrame; restart the clock on return.
  const onVisibility = () => {
    if (!document.hidden) clock.reset();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function startApp(root: HTMLElement): void {
  const stage = createStage(root);
  const spec = PROTO_RING;
  const geometry = createTrackGeometry(spec);
  stage.scene.add(createTrackMesh(spec, geometry));

  const laneIndex = 1;
  const session = createSession({
    track: compileTrack(spec),
    lane: laneIndex,
    profile: DEFAULT_PROFILE,
  });
  const path = geometry.lanes[laneIndex];
  if (!path) throw new Error('no lane path');

  const color = LANE_COLORS[laneIndex] ?? '#ffffff';
  const car = createCarMesh(color);
  const ghostCar = createCarMesh('#ffffff', { ghost: true });
  stage.scene.add(car.object, car.marker, ghostCar.object, ghostCar.marker);

  const storeKey = ghostKey(`${spec.id}@${spec.version}`, session.profile.key, laneIndex);
  const stored = loadGhost(storeKey);
  let ghost = stored ? tryBuildGhost(stored, session) : null;

  let view: 'chase' | 'overview' = 'chase';
  let snapCamera = true;
  const restart = () => {
    session.reset();
    snapCamera = true;
  };
  const keyboard = createKeyboard(window, { onRestart: restart });
  const controls = createControls(root);
  const hud = createHud(root, { onRestart: restart });
  const input = combine([keyboard, controls.source]);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && !event.repeat) {
      view = view === 'chase' ? 'overview' : 'chase';
      snapCamera = true;
    }
  });

  const bounds = trackBounds(geometry);
  const lookAt = new Vector3();
  const desired = new Vector3();
  const desiredLook = new Vector3();
  const desiredUp = new Vector3();

  runLoop(stage, {
    update() {
      session.update(input.command({ speed: session.state.speed, profile: session.profile }));
      for (const event of session.lastEvents) {
        if (event.type === 'deslot') car.flash();
        if (event.type === 'lap' && (ghost === null || event.time < ghost.record.lapTime)) {
          const record = recordBestLap(session, event);
          saveGhost(storeKey, record);
          ghost = tryBuildGhost(record, session);
        }
      }
    },
    render(alpha, dt) {
      const distance = session.renderDistance(alpha);
      car.update(path, distance, fx.toNumber(session.state.slip), dt);

      const { state } = session;
      const lapTicks = state.tick - fx.toNumber(state.lapStart);
      const ghostTime = ghost ? ghostTimeAt(ghost, fx.toNumber(state.distance)) : null;
      hud.update({
        lapTime: Math.max(0, lapTicks),
        best: ghost ? ghost.lapTime : null,
        delta: ghostTime === null ? null : lapTicks - ghostTime,
        speed: fx.toNumber(state.speed),
        grip: fx.toNumber(state.grip),
        deslots: session.events.filter((e) => e.type === 'deslot').length,
      });

      const sinceLapStart = session.previous.tick + alpha - fx.toNumber(session.state.lapStart);
      const ghostDistance = ghost ? ghostDistanceAt(ghost, sinceLapStart) : null;
      ghostCar.object.visible = ghostDistance !== null;
      if (ghostDistance !== null) ghostCar.update(path, ghostDistance, 0, dt);

      const camera = stage.camera;
      if (view === 'overview') {
        const { position, target, up } = overviewPlacement(bounds, camera.fov, camera.aspect);
        camera.up.set(...up);
        camera.position.set(...position);
        camera.lookAt(...target);
        car.showMarker(position[1]);
        ghostCar.showMarker(ghostDistance === null ? null : position[1]);
        return;
      }
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
    },
  });
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
