/**
 * MIDI 文件解析：midi-file → 统一 Song 结构。
 * 保留 tick/PPQ，按 tempo 事件把 tick 转成绝对 beat，再交给 buildEvents 聚合和弦。
 * 本模块是"MIDI → Song"的唯一入口；播放引擎不接触它。
 */
import { parseMidi } from 'midi-file';
import { buildEvents, DEFAULT_BPM, makeSongId } from './song.js';

/** 解析 MIDI ArrayBuffer / Uint8Array。
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {string} [title] 覆盖标题（文件名）
 * @returns {Object} Song
 */
export function parseMidiToSong(buffer, title = '') {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const midi = parseMidi(bytes);
  const header = midi.header;
  const ppq = header.ticksPerQuarter || 480;

  // --- tempo 分段：以 tick 为界，记录每段的 (startTick, startBeat, secondsPerBeat) ---
  const tempoEvents = []; // {tick, bpm}
  for (const t of header.tempos || []) {
    tempoEvents.push({
      tick: t.tick ?? t.deltaTime ?? 0,
      bpm: Math.round(60_000_000 / (t.tempo || 500000)),
    });
  }
  if (tempoEvents.length === 0) tempoEvents.push({ tick: 0, bpm: DEFAULT_BPM });
  tempoEvents.sort((a, b) => a.tick - b.tick);

  // 逐 tick 累积绝对 beat。tempo 只影响"秒"，beat 由 tick 线性决定。
  // 但我们让 Song.bpm = 第一个 tempo，并提供 tempoMap 供自动播放可选变速。
  const baseBpm = tempoEvents[0].bpm;

  // --- 收集所有 note，同时构造轨道元信息 ---
  const notes = [];
  const tracks = [];
  let trackId = 0;
  const endTickNotes = [];

  for (let ti = 0; ti < midi.tracks.length; ti++) {
    const track = midi.tracks[ti];
    let absoluteTick = 0;
    let channel = 0;
    let instrument = { name: 'Piano', number: 0, percussion: false };
    let trackName = '';
    const open = new Map(); // noteNumber -> {tick, velocity}
    let noteCount = 0;

    for (const ev of track) {
      absoluteTick += ev.deltaTime || 0;
      const t = absoluteTick;
      if (ev.type === 'trackName') {
        trackName = ev.text || `Track ${ti + 1}`;
      } else if (ev.type === 'channel') {
        // midi-file 的 channel prefix meta: ev.type === 'channel', ev.channel
        if (typeof ev.channel === 'number') channel = ev.channel;
      } else if (ev.type === 'programChange') {
        const num = ev.programNumber ?? ev.value ?? 0;
        instrument = { name: programName(num), number: num, percussion: channel === 9 };
      } else if (ev.type === 'noteOn' && ev.velocity > 0) {
        if (typeof ev.channel === 'number') channel = ev.channel;
        open.set(ev.noteNumber, { tick: t, velocity: ev.velocity / 127 });
      } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) {
        if (typeof ev.channel === 'number') channel = ev.channel;
        const started = open.get(ev.noteNumber);
        if (started) {
          const startBeat = tickToBeat(started.tick, ppq);
          const durationBeat = Math.max(1e-6, tickToBeat(t - started.tick, ppq));
          notes.push({
            midi: ev.noteNumber,
            velocity: started.velocity,
            startBeat,
            durationBeat,
            channel,
            trackId,
          });
          endTickNotes.push(t);
          noteCount++;
          open.delete(ev.noteNumber);
        }
      }
    }
    tracks.push({
      id: trackId,
      name: trackName || `Track ${ti + 1}`,
      channel,
      instrument,
      noteCount,
    });
    trackId++;
  }

  // 处理某些 MIDI 用 noteOn(vel=0) 结束已被上面覆盖；遗留 open 按曲末释放
  const maxTick = Math.max(0, ...endTickNotes, ...tempoEvents.map((t) => t.tick));
  const durationBeat = tickToBeat(maxTick, ppq) || 4;

  const events = buildEvents(notes, durationBeat);

  return {
    id: makeSongId(),
    title: title || midi.header.name || 'Untitled',
    bpm: baseBpm,
    duration: durationBeat,
    ppq,
    tempoMap: tempoEvents,
    tracks,
    events,
    rawNoteCount: notes.length,
  };
}

function tickToBeat(tick, ppq) {
  return tick / ppq;
}

const GM_NAMES = ['Piano', 'Bright Piano', 'Electric Grand', 'Honky-tonk', 'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet'];
function programName(n) {
  return GM_NAMES[n] ?? (n >= 8 && n <= 15 ? 'Percussion' : `Program ${n + 1}`);
}
