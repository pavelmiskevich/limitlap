import { Command, DEFAULT_PROFILE, fx } from '@limitlap/sim';
import { afterEach, describe, expect, test } from 'vitest';
import { combine, type InputContext, type InputSource } from './input.ts';
import { createKeyboard } from './keyboard.ts';

const ctx: InputContext = { speed: fx.ZERO, profile: DEFAULT_PROFILE };
const fixed = (command: Command): InputSource => ({ command: () => command, dispose() {} });

describe('combine', () => {
  test('brake wins over throttle', () => {
    expect(combine([fixed(Command.Accel), fixed(Command.Brake)]).command(ctx)).toBe(Command.Brake);
  });

  test('throttle wins over hold', () => {
    expect(combine([fixed(Command.Hold), fixed(Command.Accel)]).command(ctx)).toBe(Command.Accel);
  });

  test('no sources means hold', () => {
    expect(combine([]).command(ctx)).toBe(Command.Hold);
  });
});

describe('keyboard', () => {
  const target = new EventTarget();
  let keyboard = createKeyboard(target);
  const press = (code: string) => target.dispatchEvent(new KeyboardEvent('keydown', { code }));
  const release = (code: string) => target.dispatchEvent(new KeyboardEvent('keyup', { code }));

  afterEach(() => {
    keyboard.dispose();
    keyboard = createKeyboard(target);
  });

  test('without keys the speed is held', () => {
    expect(keyboard.command(ctx)).toBe(Command.Hold);
  });

  test('arrow up and W accelerate', () => {
    for (const code of ['ArrowUp', 'KeyW']) {
      press(code);
      expect(keyboard.command(ctx)).toBe(Command.Accel);
      release(code);
    }
  });

  test('arrow down, S and space brake', () => {
    for (const code of ['ArrowDown', 'KeyS', 'Space']) {
      press(code);
      expect(keyboard.command(ctx)).toBe(Command.Brake);
      release(code);
    }
  });

  test('throttle and brake together give brake', () => {
    press('ArrowUp');
    press('Space');
    expect(keyboard.command(ctx)).toBe(Command.Brake);
    release('Space');
    expect(keyboard.command(ctx)).toBe(Command.Accel);
  });

  test('losing focus releases every key', () => {
    press('ArrowUp');
    target.dispatchEvent(new Event('blur'));
    expect(keyboard.command(ctx)).toBe(Command.Hold);
  });

  test('R asks for a restart once per press', () => {
    let restarts = 0;
    keyboard.dispose();
    keyboard = createKeyboard(target, { onRestart: () => restarts++ });
    press('KeyR');
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', repeat: true }));
    expect(restarts).toBe(1);
  });

  test('after dispose the keyboard stops listening', () => {
    keyboard.dispose();
    press('ArrowUp');
    expect(keyboard.command(ctx)).toBe(Command.Hold);
  });
});
