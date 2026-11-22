/**
 * 三踏板状态逻辑（纯逻辑，不依赖 Tone.js，可单测）。
 *
 * 钢琴三踏板（来源见 docs/PREFLIGHT_ROUND3.md）：
 *   sustain   右踏板 CC64 —— 延迟所有音符释放，直到抬起
 *   sostenuto 中踏板 CC66 —— 只保持"按下瞬间已在响"的音，之后的音不受影响
 *   soft      左踏板 CC67 —— 柔音(una corda)，降低力度并柔化音色，不改变释放
 *
 * 本模块只决定"noteOff 是否延迟"与力度系数；实际 release 由 AudioEngine 执行。
 */

export const PEDAL = { SOFT: 'soft', SOSTENUTO: 'sostenuto', SUSTAIN: 'sustain' };

export class PedalController {
  constructor() {
    this.state = { soft: false, sostenuto: false, sustain: false };
    this.sostenutoKeys = new Set(); // 按下 sostenuto 瞬间已在响的 voice key
  }

  /** 设置踏板通断。
   * @param {string} pedal  PEDAL.*
   * @param {boolean} down  按下=true
   * @param {string[]} [heldKeys] 按下 sostenuto 时已在响的 voice key（真实语义要求）
   * @returns {boolean} 状态是否变化
   */
  set(pedal, down, heldKeys = []) {
    if (!(pedal in this.state)) return false;
    const next = !!down;
    if (this.state[pedal] === next) return false;
    this.state[pedal] = next;
    if (pedal === PEDAL.SOSTENUTO) {
      // 只在"按下"瞬间捕获当时已响的音；抬起时清空
      this.sostenutoKeys = next ? new Set(heldKeys) : new Set();
    }
    return true;
  }

  /** 柔音踏板力度系数（真实是音色变化，这里用增益近似）。 */
  velocityScale() {
    return this.state.soft ? 0.65 : 1;
  }

  /** 该 voice 的释放是否应延迟，返回延迟来源踏板或 null。 */
  deferRelease(key) {
    if (this.state.sustain) return PEDAL.SUSTAIN;
    if (this.state.sostenuto && this.sostenutoKeys.has(key)) return PEDAL.SOSTENUTO;
    return null;
  }

  reset() {
    this.state = { soft: false, sostenuto: false, sustain: false };
    this.sostenutoKeys.clear();
  }
}
