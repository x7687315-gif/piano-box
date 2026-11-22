# 技术答疑：全面性、音准一致性、乐谱导入与变化性

> 2026-11-22 · 快速核查模式（github-preflight）· 回答用户的五个核心质疑

## 0. 检索台账（证据，必填）

| # | 查询原文 | 检索面 / 工具 | 采用的 URL |
|---|---------|--------------|-----------|
| 1 | `MIDI note number to frequency formula 440 2^((n-69)/12) Tone.js Frequency midi toNote documentation` | 外部 / WebSearch | https://tonejs.github.io/docs/13.4.9/Frequency ; http://smc.dei.unipd.it/education/smc_ch9.pdf ; https://www.positioniseverything.net/piano-key-number-vs-midi-note-number-vs-frequency |
| 2 | `Tone.js Sampler few samples pitch shift closest note cover full keyboard 88 keys Salamander samples` | 仓库+外部 / WebSearch | https://tonejs.github.io/ ; https://github.com/TheSmoothRere/ReMusic ; https://deepwiki.com/izeta8/score-to-midi-nextjs/3.3-midi-playback-engine ; https://www.webkkk.net/takosenpai2687/virtual-piano |
| 3 | `MusicXML to MIDI notes javascript library opensheetmusicdisplay osmd midi conversion pitch duration accuracy github` | 仓库+外部 / WebSearch | https://github.com/opensheetmusicdisplay/opensheetmusicdisplay ; https://github.com/infojunkie/musicxml-player ; https://imagicbell.github.io/posts/2019-6-15-piano-app |
| 4 | `Velocity sample mapping for sampler instrument`（评论区检索） | Issues / WebFetch | https://github.com/Tonejs/Tone.js/issues/1034 ; https://github.com/Tonejs/Tone.js/issues/328 |
| 5 | `Tone.js Sampler velocity layer dynamics samples gain velocity sensitivity issue github in:comments` | Issues+外部 / WebSearch | https://github.com/Tonejs/Tone.js/issues/1034 ; https://tonejs.github.io/docs/r11/Sampler ; https://stackoverflow.com/questions/79259409/why-sound-disappears-in-tone-js-with-function-sampler-triggerattackrelease |

> 六面覆盖：仓库 / 代码 / Issues（含评论 1034、328）/ Discussions（未找到有效来源）/ PR（未找到有效来源）/ 外部文档。三角验证：采样移调覆盖 88 键由官方文档 + 3 个独立项目佐证。

---

## 1. "界面只有几个键，复杂乐曲怎么完整输出？"

**关键区分：界面琴键 = 可视化显示窗口；音域 = 播放引擎实际能力，两者不是一回事。**

- 音域由 MIDI 音高编号（0–127）决定，标准钢琴 88 键 = MIDI 21(A0)~108(C8)。
- 音高换算用固定的十二平均律公式：`f = 440 × 2^((p-69)/12)` Hz（来源 #1，MIDI 标准 + Tone.js 官方 API `Tone.Frequency(69,'midi').toNote() → A4`）。**这是确定的数学，不是猜测。**
- 我们本地打包了 **30 个采样点**（A0–C8 的 A/C/D#/F# 系列），Tone.js Sampler 会在采样点之间**自动移调（pitch-shift）**填补所有中间音。
  - 官方原话（来源 #2）："如果你只每 3 个音采样一个，Sampler 会 pitch shift 填补空缺，变成完整钢琴。"
  - 社区实证：virtual-piano 用 **15 个**采样点覆盖 88 键；score-to-midi 用 **25 个**（A0–C8）；ReMusic 用"小三度映射（C,D#,F#,A）+ Tone.js 移调"覆盖 88 键。我们用 30 个，密度不低于任何一者。
- **复杂编曲靠数据结构完整保留**：多轨、和弦（同一时刻音符合并为 Event）、力度、时值全部解析；播放时按时长精确释放。当前显示键盘已扩展到完整 88 键（A0–C8）。

结论：**显示几个键 ≠ 只能弹几个音**。音符完整性由 MIDI 数据决定，与画多少琴键无关。

## 2. "如何保证一致性，不会弹一个音变成另一个音、每个音又不准？"

- **不会"变音"**：音高 = MIDI 数字 → 唯一频率，公式确定（来源 #1）。同一个 MIDI 60 永远是 C4 ≈ 261.63Hz。
- **音准由采样 + 移调决定**：采样是真实钢琴录音，移调按半音比例 2^(1/12) 精确计算；不存在"随机跑调"。
- **节奏一致性**：自动模式用 Tone.Transport（音频硬件时钟），非 setTimeout，无累积漂移；手动模式按事件 beat 时长转秒精确释放。
- **诚实的边界**：Tone.js Issue #1034 明确——Sampler 的 velocity **目前只映射到增益（音量），不改变音色**（多力度分层采样仍是未合并的 feature request）。因此"强弱"通过音量体现，不是真实钢琴的"触键力度→音色变化"。这是已知限制，非 bug。

## 3. "单纯导入音频，弹奏时是否只是把音频重复一遍？"

**不是。这是本应用与"音乐播放器"的根本区别。**

- 我们**导入的是 MIDI（演奏指令）**，不是 MP3/WAV（声音波形）。
- MIDI 只描述"哪个音、多长、多响"，**不含声音**。引擎拿到指令后，用本地钢琴采样**重新合成**每一个音。
- 所以：改 BPM 不影响音高、改音量不影响音准、手动逐音触发与自动整曲播放走的是同一合成路径。
- 项目需求明确禁止"假装从普通音频提取 MIDI 音符"——我们遵守了这条：只接受 .mid/.midi。

## 4. "导入五线谱/乐谱（含联网搜索）时，如何保证每个音一致？"

**一致性链条是同一条，与乐谱来源无关：**

```
任意来源乐谱 → 解析成音符(pitch,duration,velocity) → 统一 Song 结构 → 同一音频引擎
```

- 五线谱的事实标准是 **MusicXML**。有成熟库：`musicxml-interfaces`（解析）、`opensheetmusicdisplay`/OSMD（渲染，BSD，2026 仍活跃、内置移调）、Verovio / `musicxml-midi`（转 MIDI）（来源 #3）。
- 真实项目（来源 #3.imagicbell）就是 MIDI + MusicXML 双输入、共用同一 Tone.js 引擎的先例。
- **关键点**：无论来自 MIDI 文件、MusicXML 文件还是联网下载的乐谱，最终都归约到"MIDI 音高数字 + beat 时值"，然后走那条数学公式发音。所以**音高一致性由数据格式保证，不依赖抓取来源的"音频质量"**。
- 联网乐谱的风险不在"音会变"，而在"谱面错音/排版错误"——那是数据源问题，需用户核对，不是引擎问题。
- 当前状态（v0.2.0 更新）：MusicXML 导入**已实现**（`src/core/musicxml.js`，原生 DOMParser，零依赖）；解析 pitch/divisions/chord/tie/transpose/BPM，统一进入 Song 与同一引擎。调研见 `PREFLIGHT_ROUND2.md`。

## 5. "变化性：高低变化、延长、减弱，是否考虑？"

| 你的诉求 | 当前支持 | 实现方式 / 依据 |
|---|---|---|
| 高低变化（移调/八度） | **v0.2.0 已实现**：±24 半音移调，可全曲/选中事件 | `src/core/transform.js` 纯函数 `midi±n`，clamp 0..127 |
| 延长/减弱（时值、力度） | **v0.2.0 已实现**：时长 0.25×–3×、力度 0.1×–2× | 纯函数乘系数；velocity 增益实现（音色不变，见 Issue #1034） |
| 自动化表达式（渐强渐弱曲线） | 未实现 | 需逐音改 velocity；Tone.Draw/Param.rampTo 可做渐变（来源 #5 官方文档） |

**诚实结论（v0.2.0 更新）**：交互式的"全曲/选中事件 → 移调/延长/减弱 → 一键重置"**已经实现并测试**（14 项 E2E）。仍未做的是**自动化音乐表情曲线**（crescendo/diminuendo 随时间渐变）——当前力度是逐事件静态缩放。

---

## 6. 风险与下一步 checklist

- [x] 显示琴键扩展到 88 键（本次修复）
- [x] MusicXML 导入（原生 DOMParser，零依赖，v0.2.0）
- [x] 音符级移调 / 时值 / 力度编辑（变化性交互，v0.2.0）
- [ ] 多力度分层采样（依赖 Tone.js #1034 进展或自定义 Sampler 包装）
- [ ] 联网乐谱来源的音高校验提示
