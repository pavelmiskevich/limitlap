/**
 * Application shell: a Three.js renderer sized to the screen and the frame
 * loop — fixed simulation steps first, then a draw with interpolation.
 */

import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createTrackGeometry, PROTO_RING, type TrackGeometry } from '@limitlap/tracks';
import { createFixedStep } from './loop.ts';
import { overviewPlacement, type Bounds } from './render/overview.ts';
import { createTrackMesh } from './render/track-mesh.ts';

export interface Game {
  /** One simulation step (1/60 s). */
  update(): void;
  /** Draw; `alpha` is the share of the next step already elapsed. */
  render(alpha: number): void;
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
  const tick = (now: number) => {
    const { steps, alpha } = clock.advance(now);
    for (let i = 0; i < steps; i++) game.update();
    game.render(alpha);
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

  const bounds = trackBounds(geometry);
  const placeOverview = () => {
    const { position, target, up } = overviewPlacement(
      bounds,
      stage.camera.fov,
      stage.camera.aspect,
    );
    stage.camera.up.set(...up);
    stage.camera.position.set(...position);
    stage.camera.lookAt(...target);
  };

  runLoop(stage, {
    update() {},
    render() {
      placeOverview();
    },
  });
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
