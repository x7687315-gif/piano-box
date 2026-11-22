/**
 * 统一乐曲数据结构与纯函数工具。
 *
 * Song = {
 *   id, title, bpm, duration(beat), ppq,
 *   tracks: [{ id, name, channel, instrument, noteCount }],
 *   events: [{ index, startBeat, durationBeat, notes:[{midi, velocity, durationBeat, channel}] }]
 * }
 *
 * 所有时间单位为 beat。seconds = beat * 60 / bpm。
 * 本模块不依赖任何 MIDI 解析库或音频库——播放引擎只见 Song。
 */

export const DEFAULT_BPM = 120;

export function beatToSeconds(beat, bpm = DEFAULT_BPM) {
  return beat * 60 / bpm;
}

/** 从 notes 列表构建按时序排列的 events（同一 startBeat 聚合为和弦）。
 * @param {Array<{midi:number, velocity:number, startBeat:number, durationBeat:number, channel?:number, trackId?:number}>} notes
 * @param {number} [totalDurationBeat] 覆盖的乐曲总时长（beat）
 * @returns {Array} events
 */
export function buildEvents(notes, totalDurationBeat = 0) {
  if (!Array.isArray(notes) || notes.length === 0) return [];
  const sorted = [...notes].sort((a, b) =>
    a.startBeat - b.startBeat || a.midi - b.midi || (a.trackId ?? 0) - (b.trackId ?? 0)
  );
  const events = [];
  let cur = null;
  for (const n of sorted) {
    if (!cur || Math.abs(n.startBeat - cur.startBeat) > 1e-7) {
      cur = {
        index: events.length,
        startBeat: n.startBeat,
        durationBeat: 0,
        notes: [],
      };
      events.push(cur);
    }
    cur.notes.push({
      midi: n.midi,
      velocity: clamp01(n.velocity ?? 0.8),
      durationBeat: Math.max(1e-6, n.durationBeat ?? 0.25),
      channel: n.channel ?? 0,
      trackId: n.trackId ?? 0,
    });
    // event 的时长取该时刻所有音符中最长的（和弦整体持续时间）
    cur.durationBeat = Math.max(cur.durationBeat, n.durationBeat ?? 0.25);
  }
  if (totalDurationBeat > 0) {
    const last = events[events.length - 1];
    const end = last.startBeat + last.durationBeat;
    if (end > totalDurationBeat) {
      // 允许最后一个音超出（正常），不裁切
    }
  }
  return events;
}

export function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

/** 计算 Song 的统计信息 */
export function songStats(song) {
  const allNotes = song.events.flatMap((e) => e.notes);
  const pitches = allNotes.map((n) => n.midi);
  return {
    eventCount: song.events.length,
    noteCount: allNotes.length,
    minMidi: pitches.length ? Math.min(...pitches) : null,
    maxMidi: pitches.length ? Math.max(...pitches) : null,
    durationSeconds: beatToSeconds(song.duration, song.bpm),
  };
}

/** 按轨道 id 集合筛选一个 Song，返回新的 Song（events 重新聚合）；空集合=合并全部轨道。
 * @returns {Object} 新的 Song
 */
export function filterSongByTracks(song, selectedTrackIds) {
  const merged = !Array.isArray(selectedTrackIds) || selectedTrackIds.length === 0;
  const chosen = merged ? song.tracks.map((t) => t.id) : selectedTrackIds;
  const set = new Set(chosen);
  const notes = [];
  for (const ev of song.events) {
    for (const n of ev.notes) {
      if (set.has(n.trackId ?? 0)) {
        notes.push({
          midi: n.midi,
          velocity: n.velocity,
          startBeat: ev.startBeat,
          durationBeat: n.durationBeat,
          channel: n.channel,
          trackId: n.trackId,
        });
      }
    }
  }
  const events = buildEvents(notes, song.duration);
  return {
    ...song,
    events,
    tracks: merged ? song.tracks : song.tracks.filter((t) => set.has(t.id)),
    activeTracks: merged ? song.tracks.map((t) => t.id) : chosen,
    merged,
  };
}

/** 循环逻辑：给定当前 index 与总数、是否循环，返回下一个 index 或 null（结束）。 */
export function nextIndex(current, total, loop) {
  if (total <= 0) return null;
  const next = current + 1;
  if (next < total) return next;
  return loop ? 0 : null;
}

/** 生成Song的简易唯一 id */
export function makeSongId() {
  return 'song_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}
