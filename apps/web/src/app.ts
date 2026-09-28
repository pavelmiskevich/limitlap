/**
 * Application shell: a Three.js renderer sized to the screen and the frame
 * loop — fixed simulation steps first, then a draw with interpolation.
 */

import { Command, DEFAULT_PROFILE, fx, parseProfile } from '@limitlap/sim';
import { PROTO_RING_SOLO } from '@limitlap/tracks';
import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createDebugPanel } from './debug/panel.ts';
import { loadTuning, saveTuning, tunedProfile } from './debug/tuning.ts';
import { createRace, type View } from './game/race.ts';
import {
  createRaceChoices,
  loadRaceSettings,
  trackById,
  type RaceSettings,
} from './game/race-settings.ts';
import { createHud } from './hud/hud.ts';
import { createControls } from './input/controls.ts';
import { combine } from './input/input.ts';
import { createKeyboard } from './input/keyboard.ts';
import { createFixedStep } from './loop.ts';
import { createTracker, loadStats, saveStats } from './stats/stats.ts';
import { createStatsView } from './stats/stats-view.ts';

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
  const debug = new URLSearchParams(location.search).has('debug');
  const tuning = debug ? loadTuning() : null;
  let profile = tuning ? parseProfile(tunedProfile(tuning)) : DEFAULT_PROFILE;

  const tracker = createTracker(loadStats());
  let savedAt = 0;
  const save = () => {
    saveStats(tracker.stats);
    savedAt = performance.now();
  };

  const build = ({ track, lane }: RaceSettings) => {
    tracker.startAttempt();
    return createRace({
      scene: stage.scene,
      spec: trackById(track) ?? PROTO_RING_SOLO,
      lane,
      profile,
    });
  };
  let race = build(loadRaceSettings());

  let view: View = 'chase';
  const restart = () => {
    race.restart();
    tracker.startAttempt();
  };
  const keyboard = createKeyboard(window, { onRestart: restart });
  const controls = createControls(root);
  const hud = createHud(root, { onRestart: restart });
  const input = combine([keyboard, controls.source]);
  createRaceChoices(controls.panel, loadRaceSettings(), (settings) => {
    race.dispose();
    race = build(settings);
  });
  createStatsView(root, controls.panel, () => tracker.stats);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else tracker.resume();
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && !event.repeat) view = view === 'chase' ? 'overview' : 'chase';
  });

  if (debug) {
    createDebugPanel(root, {
      values: profile.source,
      onChange(values) {
        saveTuning(values);
        profile = values ? parseProfile(tunedProfile(values)) : DEFAULT_PROFILE;
        race.setProfile(profile);
        tracker.startAttempt();
      },
    });
  }

  runLoop(stage, {
    update() {
      const { session } = race;
      const command = input.command({ speed: session.state.speed, profile: session.profile });
      if (command !== Command.Hold) tracker.drove();
      race.update(command);
      for (const event of session.lastEvents) {
        if (event.type === 'deslot') tracker.deslot();
        if (event.type === 'lap') {
          tracker.lap({
            track: `${session.track.id}@${session.track.version}`,
            lane: session.laneIndex,
            profile: session.profile.key,
            time: fx.toNumber(event.time),
          });
          save();
        }
      }
    },
    render(alpha, dt) {
      hud.update(race.render(alpha, dt, stage.camera, view));
      if (race.session.state.speed > 0) tracker.tick(dt);
      if (performance.now() - savedAt > 5000) save();
    },
  });
}
