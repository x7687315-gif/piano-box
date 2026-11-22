/**
 * 变化性编辑：对统一 Song 施加"高低变化 / 延长缩短 / 增强减弱"的纯函数变换。
 * 不可变：每次变换返回新 Song，原始 Song 永不修改 → 可叠加、可重置。
 *
 * 变换只改 Note 数值，不改 Event 时序结构（和弦关系、排序保持）。
 * 与输入模式、音频引擎完全解耦。
 */

/** 移调：所有（或指定事件）音符 ±semitones（整数半音；12=一个八度）。
 * @param {Object} song
 * @param {number} semitones 半音数，正=升高，负=降低；自动 clamp 到 0..127
 * @param {number[]|null} eventIndices null=全曲；数组=仅这些事件
 */
export function transpose(song, semitones, eventIndices = null) {
  const n = Math.round(Number(semitones) || 0);
  if (n === 0) return song;
  return mapNotes(song, eventIndices, (note) => ({
    ...note,
    midi: Math.max(0, Math.min(127, note.midi + n)),
  }));
}

/** 时值缩放：durationBeat × factor（>1 延长，<1 缩短）。
 * 同时缩放 event.durationBeat（取该 event 内音符最大值），保持和弦整体时长一致。 */
export function scaleDuration(song, factor, eventIndices = null) {
  const f = Number(factor);
  if (!isFinite(f) || f <= 0 || f === 1) return song;
  const out = mapNotes(song, eventIndices, (note) => ({
    ...note,
    durationBeat: Math.max(1e-6, note.durationBeat * f),
  }));
  // 重算被影响 event 的 durationBeat = 其音符最大时长
  out.events = out.events.map((ev) => {
    if (eventIndices && !eventIndices.includes(ev.index)) return ev;
    return { ...ev, durationBeat: Math.max(...ev.notes.map((n) => n.durationBeat)) };
  });
  return out;
}

/** 力度缩放：velocity × factor，clamp 到 0..1（>1 增强，<1 减弱）。 */
export function scaleVelocity(song, factor, eventIndices = null) {
  const f = Number(factor);
  if (!isFinite(f) || f <= 0 || f === 1) return song;
  return mapNotes(song, eventIndices, (note) => ({
    ...note,
    velocity: Math.max(0, Math.min(1, note.velocity * f)),
  }));
}

/** 组合应用多个变换（按顺序），返回新 Song。 */
export function applyTransforms(song, ops) {
  return ops.reduce((s, op) => op(s), song);
}

/** 遍历映射：只对选中事件改音符，其余原样保留；event.index 重新编号不变。 */
function mapNotes(song, eventIndices, fn) {
  const set = eventIndices ? new Set(eventIndices) : null;
  return {
    ...song,
    events: song.events.map((ev) => {
      if (set && !set.has(ev.index)) return ev;
      return { ...ev, notes: ev.notes.map(fn) };
    }),
  };
}

/** 生成"某首曲子的重置副本"的辅助：从原始曲再施加一组新操作。
 * 使用方式：const view = applyTransforms(originalSong, ops)。 */
export function resetTo(song) { return song; }
