# 交互式钢琴应用 · 开工前经验调研简报（github-preflight）

> 生成时间：2026-11-22　项目：piano-box　目标目录：`C:\Users\86159\Desktop\代码\piano-box`
> 决策方式：先给「可选方向 + 原文链接」，用户已授权"分析完直接实现第一阶段"，故在简报给出倾向后即开工。

---

## 0. 检索台账（证据，必填）

| # | 查询原文 | 检索面 / 工具 | 命中 | 采用的 URL |
|---|---------|--------------|------|-----------|
| 1 | `GitHub piano web app Web Audio Tone.js keyboard piano open source repository` | 仓库 / WebSearch | 5 | https://github.com/imamfahrudin/web-based-keyboard-piano ; https://github.com/sayanjc3639q/interective_piano ; https://github.com/George2Times/piano |
| 2 | `Tone.js Transport schedule midi playback lookahead avoid setTimeout drift github issue` | Issues / WebSearch | 5 | https://github.com/Tonejs/Tone.js/issues/396 ; https://github.com/tonejs/tone.js/wiki/Performance |
| 3 | `@tonejs/midi library parse MIDI file tracks notes chords velocity ticks to seconds npm github` | 仓库+代码 / WebSearch | 5 | https://github.com/tonejs/midi ; https://www.npmjs.com/package/@tonejs/midi |
| 4 | `piano keyboard web app keydown repeat e.repeat prevent retrigger Set held keys github issue` | 代码 / WebSearch | 5 | https://wsncode.com/blog/piano-in-javascript ; https://github.com/smackey15/piano_player/blob/main/README.md |
| 5 | `Salamander grand piano CC BY samples Tone.js Sampler local bundled piano soundfont license offline` | 外部 / WebSearch | 5 | https://github.com/Tonejs/audio/tree/master/salamander ; https://github.com/ayoungh/Octave-Garden/blob/main/public/samples/ATTRIBUTION.md ; https://piano.org/credits/ |
| 6 | `site:github.com/Tonejs/Tone.js in:comments stuck note keydown repeat`（评论正文检索） | Issues 评论 / WebFetch | 1 | https://github.com/Tonejs/Tone.js/issues/426 |
| 7 | `is:issue is:pr merged transport schedule visual Draw` | PR / WebFetch | 0（该查询无命中，如实记录） | https://github.com/Tonejs/Tone.js/issues |
| 8 | `Tone.js Discussions how to sync visuals with audio` | Discussions / WebFetch | 0（页面 404，无该分类，如实记录） | https://github.com/Tonejs/Tone.js/discussions |
| 9 | `is:issue in:comments stuck note`（语义/自然语言问句式检索） | Issues 语义 / WebFetch | 1 | https://github.com/Tonejs/Tone.js/issues/426 |
| 10 | GitHub raw 音源实际下载探测 `raw.githubusercontent.com/Tonejs/audio/.../A4.mp3` | 外部 / curl | status=200 size=61148 | https://github.com/Tonejs/audio/tree/master/salamander |

> 说明：均为本次实际执行的查询。第 7、8 条该检索面无有效命中，按技能要求如实标注，不用想象填充。第 5/10 条跨源（Tone.js 官方 + 第三方署名页 + 实测下载）三角验证音源方案。

---

## 1. 待决策点（这次要定什么）

- **待决策问题**：桌面钢琴应用的运行形态、音频引擎、MIDI 解析策略、本地音源方案。
- **约束条件**：Windows 本机；Node 22 可用；离线不依赖外部音源服务器；音源需明确许可；优先简单稳定易维护、不过度设计；核心按钮必须真能用；需要可自动执行的测试。

---

## 2. 可选方向（核心——交给用户选，已给倾向）

| 方向 | 做法概要 | 适用条件 | 代价 / 风险 | 原始来源（链接） | 置信度 |
|------|---------|---------|-------------|-----------------|--------|
| **A. 浏览器应用（Vite + 原生 JS/TS + Tone.js），本地 HTTP server 运行** | 键盘/音频走浏览器 Web Audio，Tone.js 封装调度；`npm run dev` 启动，浏览器打开 | 需要最快落地、零安装、跨平台、易测试 | 需浏览器；首次要起本地服务 | https://github.com/imamfahrudin/web-based-keyboard-piano ; https://github.com/Tonejs/Tone.js/wiki/Performance | ★★★ |
| B. Electron 桌面壳 | 在 A 基础上包 Electron，双击 EXE | 强"桌面应用"体验 | 体积大、构建链复杂、离第一阶段目标远 | https://github.com/sayanjc3639q/interective_piano | ★ |
| C. Web Audio API 裸写（不用 Tone.js） | 自己实现 lookahead 调度器 | 极致控制/极简依赖 | 重复造轮子，Transport/Draw 都要自己写 | https://github.com/Tonejs/Tone.js/issues/396 | ★★ |

**MIDI 解析选型：**

| 方向 | 做法概要 | 代价 / 风险 | 来源 | 置信度 |
|------|---------|-------------|------|--------|
| **A. 用 `midi-file` 底层解析，自己转 Song（保留 tick→beat）** | 直接拿 noteOn/noteOff/tempo/PPQ，按 tick 聚合和弦 | 需自己写事件分组（本就要写，属核心数据结构） | https://github.com/tonejs/midi （其底层即 midi-file） | ★★★ |
| B. 用 `@tonejs/midi` 的 `Midi` 对象 | 开箱即用 | 它把 time/duration 直接转**秒**，BPM 调整/beat 语义会失真 | https://www.npmjs.com/package/@tonejs/midi | ★★ |

**音源选型：**

| 方向 | 做法概要 | 代价 / 风险 | 来源 | 置信度 |
|------|---------|-------------|------|--------|
| **A. 本地打包 Salamander Grand Piano 采样 + Tone.Sampler** | 8 个八度基准音 MP3 随应用分发，closest 移调覆盖全键盘，velocity→gain | 需附 CC BY 3.0 署名 | https://github.com/Tonejs/audio/tree/master/salamander ; https://github.com/ayoungh/Octave-Garden/blob/main/public/samples/ATTRIBUTION.md ; https://piano.org/credits/ | ★★★ |
| B. 纯合成器（PolySynth） | 零采样、零下载 | 音色不如真实钢琴 | https://github.com/George2Times/piano | ★★ |
| C. 运行时拉取 CDN 音源 | 实现最简 | 违反"离线不失效/不重复下载"硬要求，否决 | — | — |

---

## 3. 倾向与理由（决定权本在用户，但用户已授权直接实现）

- **运行形态选 A（浏览器 + Vite + 本地服务）**：用户目标是"电脑上跑的交互钢琴"，第一阶段核心是声音正确和架构清晰；浏览器方案零安装、跨平台、测试最容易，且 Web Audio 是所有钢琴 Web App 的成熟底座。Electron 壳后置到打包阶段，不阻塞核心。
- **引擎选 Tone.js**：官方 wiki 明确 Transport 绑定音频硬件时钟（非 setTimeout），天然防节奏漂移；Draw 解决音画同步；dispose() 解决资源释放。用户要求"可靠调度机制避免 setTimeout 漂移"——Tone.js 正是对策本身，裸写等于重复造轮子。
- **MIDI 选 `midi-file` 保留 tick**：用户明确要 `startBeat/durationBeat` 结构和 BPM 可调；@tonejs/midi 转秒会破坏 beat 语义，故用其底层库。
- **音源选 A（本地 Salamander）**：实测 raw 下载 200、单文件仅 61KB，本地打包总计数百 KB；CC BY 3.0 许可清晰；满足"离线可用 + 不重复下载 + 明确许可"三条硬要求。

---

## 4. 已知坑与 workaround（含评论区捞到的）

| 坑 | 现象 | workaround | 来源（标注是否来自评论正文） |
|----|------|-----------|-------------------------------|
| 自动播放策略 | 页面加载后 AudioContext 处于 suspended，首次点击/按键没声音 | 首次用户手势里 `context.resume()`，用 `{once:true}` 单独解锁，别和弹琴逻辑混 | https://blog.csdn.net/weixin_29474431/article/details/164793880 |
| 键盘长按自动重复 | 按住键持续触发 keydown，音符被反复 attack 成"机关枪" | `if (e.repeat) return` + `Set` 记录按下状态（双保险） | https://github.com/smackey15/piano_player/blob/main/README.md ; https://wsncode.com/blog/piano-in-javascript |
| stuck notes（音符卡住不释放） | 切后台/焦点丢失时 keyup 丢失，音一直响 | `visibilitychange` 里 `releaseAll()`；用 Map 记录 voice 便于精准 stop | https://designwithrehana.com/?p=8141 |
| 节奏漂移 | setTimeout/setInterval 受主线程阻塞，音乐越走越偏 | 用 Tone.Transport（音频硬件时钟）+ lookahead 窗口 | https://github.com/tonejs/tone.js/wiki/Performance ; https://github.com/Tonejs/Tone.js/issues/396（维护者回复：lookAhead 默认 0.1s） |
| 音画不同步 | 在 Transport 回调里直接改 DOM，视觉早于/晚于声音 | 回调里用 `Tone.getDraw().schedule(cb, time)` 对齐音频时钟 | https://github.com/tonejs/tone.js/wiki/Performance |
| file:// 下采样加载失败 | 直接双击 index.html，fetch 采样被 CORS 拦截，页面正常但没声音 | 必须用本地 HTTP server（Vite dev server）运行 | https://github.com/George2Times/piano |
| 节点资源泄漏 | 丢弃引用后节点仍连在音频图里 | 组件卸载/换曲时 `node.dispose()` | https://github.com/tonejs/tone.js/wiki/Performance |
| Polysynth 音色不一致 | 复音状态残留 | 已关闭 issue，见评论排查（评论正文检索命中）| https://github.com/Tonejs/Tone.js/issues/426 （来自 in:comments） |

---

## 5. 可选实现参考

| 名称 | 类型 | 对口方向 | 来源链接 | 注意（License / 维护度） |
|------|------|---------|----------|-------------------------|
| Tone.js | 音频引擎库 | 引擎 | https://github.com/Tonejs/Tone.js | MIT，活跃维护，事实标准 |
| midi-file | MIDI 底层解析 | MIDI | https://github.com/tonejs/midi （依赖即它） | MIT |
| Tone.js salamander 采样 | 音源资源 | 音源 | https://github.com/Tonejs/audio/tree/master/salamander | 采样 CC BY 3.0，需署名 Alexander Holm |
| web-based-keyboard-piano | 键盘映射参考 | 交互 | https://github.com/imamfahrudin/web-based-keyboard-piano | 参考其键位映射与多合成器切换 |

---

## 6. 参考论文 / 文档 / awesome

- 文档：Tone.js Performance Wiki —— lookAhead/latencyHint/Draw/dispose 权威说明 https://github.com/tonejs/tone.js/wiki/Performance
- 文档：A Tale of Two Clocks（Chris Wilson，lookahead 调度原始论文思想）—— 由 wiki 引用
- 文档：@tonejs/midi README —— MIDI 数据结构定义 https://github.com/tonejs/midi
- 署名规范：Salamander Grand Piano CC BY 3.0 https://creativecommons.org/licenses/by/3.0/

---

## 7. 风险与下一步 checklist

- [x] 选定方向：浏览器应用 + Tone.js + midi-file + 本地 Salamander 音源（用户已授权直接实现）
- [x] 音源许可已核对：CC BY 3.0，附署名文件
- [x] 音源可达性实测：raw 下载 200
- [ ] 坑 1~8 在编码时逐条落地规避
- [ ] 待验证项：velocity 分层（Salamander 官方精简集为单层，velocity 用 gain 近似，可接受）

---

## 8. 来源汇总（可追溯）

- 仓库：github.com/imamfahrudin/web-based-keyboard-piano、github.com/sayanjc3639q/interective_piano、github.com/George2Times/piano、github.com/tonejs/midi、github.com/Tonejs/Tone.js、github.com/Tonejs/audio
- Issues（含评论正文）：Tone.js#396、Tone.js#426
- 文档/外部：tone.js/wiki/Performance、npmjs @tonejs/midi、piano.org/credits、CSDN Web Audio 踩坑
- 实测：raw.githubusercontent.com 音源下载探测
