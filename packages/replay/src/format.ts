/**
 * Binary replay format.
 *
 *   u8       format version
 *   str      track id            str = varint length + ASCII bytes
 *   varint   track version
 *   str      profile id
 *   varint   profile version
 *   u32      seed
 *   u8       lane
 *   u8       flags
 *   varint   tick count
 *   varint   run count
 *   varint×  runs: (length << 2) | command
 *   u32      checksum of the final car state
 *   u32      CRC-32 of everything above
 *
 * Integers are little-endian; varints are unsigned LEB128 up to 2^53.
 */

import { Command, type CarState } from '@limitlap/sim';
import { REPLAY_FORMAT_VERSION } from './version.ts';

export interface ReplayHeader {
  trackId: string;
  trackVersion: number;
  profileId: string;
  profileVersion: number;
  seed: number;
  lane: number;
  /** Reserved bits, e.g. "rewind was used". */
  flags: number;
}

export interface Replay {
  header: ReplayHeader;
  /** One command per tick. */
  commands: Uint8Array;
  /** `stateChecksum` of the car after the last command. */
  checksum: number;
}

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayError';
  }
}

const ID = /^[a-z0-9-]{1,64}$/;
const MAX_COMMAND = Math.max(...Object.values(Command));
const TWO_32 = 2 ** 32;

// ---------------------------------------------------------------- CRC-32

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array, end: number): number {
  let crc = 0xffffffff;
  for (let i = 0; i < end; i++) {
    crc = (CRC_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------- writer

class Writer {
  private bytes: number[] = [];

  u8(value: number) {
    this.bytes.push(value & 0xff);
  }

  u32(value: number) {
    for (let i = 0; i < 4; i++) this.u8(value >>> (8 * i));
  }

  varint(value: number) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ReplayError(`cannot store ${value} in a replay`);
    }
    let rest = value;
    while (rest >= 0x80) {
      this.u8((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.u8(rest);
  }

  str(value: string) {
    if (!ID.test(value)) throw new ReplayError(`invalid id in a replay: ${value}`);
    this.varint(value.length);
    for (let i = 0; i < value.length; i++) this.u8(value.charCodeAt(i));
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.bytes.length + 4);
    out.set(this.bytes);
    const crc = crc32(out, this.bytes.length);
    new DataView(out.buffer).setUint32(this.bytes.length, crc, true);
    return out;
  }
}

// ---------------------------------------------------------------- reader

const damaged = () => new ReplayError('replay is damaged');

class Reader {
  private readonly bytes: Uint8Array;
  private readonly end: number;
  private offset: number;

  constructor(bytes: Uint8Array, start: number, end: number) {
    this.bytes = bytes;
    this.offset = start;
    this.end = end;
  }

  u8(): number {
    if (this.offset >= this.end) throw damaged();
    return this.bytes[this.offset++] ?? 0;
  }

  u32(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) value += this.u8() * 2 ** (8 * i);
    return value;
  }

  varint(): number {
    let value = 0;
    for (let scale = 1; ; scale *= 0x80) {
      if (scale > 2 ** 53) throw damaged();
      const byte = this.u8();
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) break;
    }
    if (!Number.isSafeInteger(value)) throw damaged();
    return value;
  }

  str(): string {
    const length = this.varint();
    if (length > 64) throw damaged();
    let value = '';
    for (let i = 0; i < length; i++) value += String.fromCharCode(this.u8());
    if (!ID.test(value)) throw damaged();
    return value;
  }

  get done(): boolean {
    return this.offset === this.end;
  }
}

// ---------------------------------------------------------------- replay

export function encodeReplay(replay: Replay): Uint8Array {
  const { header, commands } = replay;
  const out = new Writer();
  out.u8(REPLAY_FORMAT_VERSION);
  out.str(header.trackId);
  out.varint(header.trackVersion);
  out.str(header.profileId);
  out.varint(header.profileVersion);
  out.u32(header.seed);
  out.u8(header.lane);
  out.u8(header.flags);
  out.varint(commands.length);

  const runs: number[] = [];
  for (let i = 0; i < commands.length;) {
    const command = commands[i] ?? 0;
    if (command > MAX_COMMAND) throw new ReplayError(`unknown command ${command} at tick ${i}`);
    let length = 1;
    while (commands[i + length] === command) length++;
    runs.push(length * 4 + command);
    i += length;
  }
  out.varint(runs.length);
  for (const run of runs) out.varint(run);

  out.u32(replay.checksum);
  return out.finish();
}

export function decodeReplay(bytes: Uint8Array): Replay {
  if (bytes.length < 5) throw damaged();
  if (bytes[0] !== REPLAY_FORMAT_VERSION) {
    throw new ReplayError(`unsupported replay format ${bytes[0]}`);
  }
  const body = bytes.length - 4;
  const stored = new DataView(bytes.buffer, bytes.byteOffset, bytes.length).getUint32(body, true);
  if (crc32(bytes, body) !== stored) throw damaged();

  const input = new Reader(bytes, 1, body);
  const header: ReplayHeader = {
    trackId: input.str(),
    trackVersion: input.varint(),
    profileId: input.str(),
    profileVersion: input.varint(),
    seed: input.u32(),
    lane: input.u8(),
    flags: input.u8(),
  };

  const ticks = input.varint();
  const commands = new Uint8Array(ticks);
  const runCount = input.varint();
  let at = 0;
  for (let r = 0; r < runCount; r++) {
    const run = input.varint();
    const command = run % 4;
    const length = Math.floor(run / 4);
    if (command > MAX_COMMAND || length === 0 || at + length > ticks) throw damaged();
    commands.fill(command, at, at + length);
    at += length;
  }
  if (at !== ticks) throw damaged();

  const checksum = input.u32();
  if (!input.done) throw damaged();
  return { header, commands, checksum };
}

// ---------------------------------------------------------------- state checksum

/** FNV-1a over every field of the car state, in a fixed order. */
export function stateChecksum(state: CarState): number {
  const fields = [
    state.tick,
    state.lap,
    state.distance,
    state.speed,
    state.segment,
    state.grip,
    state.slip,
    state.pause,
    state.sector,
    state.sectorStart,
    state.lapStart,
    state.pedal,
    state.pedalCommand,
  ];
  let hash = 0x811c9dc5;
  for (const value of fields) {
    const low = ((value % TWO_32) + TWO_32) % TWO_32;
    const high = Math.floor(value / TWO_32);
    for (const word of [low, high >>> 0]) {
      for (let i = 0; i < 4; i++) {
        hash ^= (word >>> (8 * i)) & 0xff;
        hash = Math.imul(hash, 0x01000193);
      }
    }
  }
  return hash >>> 0;
}
