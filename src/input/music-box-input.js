/**
 * 音乐盒输入控制层：键盘任意普通键 → player.nextEvent()。
 * 独立模块；不接触 AudioEngine，也不接触 MIDI 解析。
 *
 * 关键规则：
 *  1) 任意普通键触发下一个 event（含和弦）；不同键结果一致。
 *  2) e.repeat（系统长按自动重复）+ 按下状态 Set 双重屏蔽，避免连续误触发。
 *  3) 空格键单独绑定为"下一步"，但与普通键去重（同一次物理按下只触发一次）。
 *  4) Ctrl/Cmd/Alt 组合键不触发，保证浏览器快捷键可用。
 *  5) 焦点在输入框时不触发。
 */
export function createMusicBoxInput({ onTrigger, isEnabled }) {
  const pressed = new Set();

  function handleDown(e) {
    if (!isEnabled()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.repeat) { e.preventDefault(); return; }

    // 用 e.code 作为物理键唯一标识（同一物理键按住只算一次）
    const code = e.code || e.key;
    if (pressed.has(code)) { e.preventDefault(); return; }
    pressed.add(code);

    // 空格、Enter 等有默认行为的键阻止默认（滚动/按钮重复点击）
    if (e.code === 'Space' || e.key === ' ') e.preventDefault();

    onTrigger(e.code);
  }

  function handleUp(e) {
    const code = e.code || e.key;
    pressed.delete(code);
  }

  function clear() { pressed.clear(); }

  window.addEventListener('keydown', handleDown);
  window.addEventListener('keyup', handleUp);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });

  return {
    clear,
    dispose() {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
      window.removeEventListener('blur', clear);
    },
  };
}
