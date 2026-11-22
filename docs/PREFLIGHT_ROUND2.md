# 开工前调研 · 第二轮：MusicXML 导入 + 变化性编辑

> 2026-11-22 · 快速核查模式（github-preflight）· 工程进行中的选型决策

## 0. 检索台账（必填）

| # | 查询原文 | 面 / 工具 | 采用的 URL |
|---|---------|----------|-----------|
| 1 | `MusicXML parse javascript library notes pitch duration divisions chord lightweight OSMD musicxml-interfaces github` | 仓库+外部 / WebSearch | https://github.com/opensheetmusicdisplay/opensheetmusicdisplay ; https://github.com/stringsync/musicxml ; https://www.musicxml.com/ |
| 2 | `MusicXML divisions duration chord element tie voice partwise pitch step alter octave example specification` | 外部（官方文档）/ WebSearch | https://wpmedia.musicxml.com/wp-content/uploads/2017/12/musicxml-tutorial.pdf ; https://www.musicxml.com/?p=769 ; http://usermanuals.musicxml.com/MusicXML/Content/TutMusicXML4-1.htm ; http://usermanuals.musicxml.com/MusicXML/Content/EL-MusicXML-alter.htm |
| 3 | `is:issue in:comments transpose semitones Frequency` | Issues 评论 / WebFetch | 无有效命中（如实记录） |
| 4 | `music theory transpose midi notes semitones velocity scale duration javascript tonal library github in:comments best practice` | 仓库+外部 / WebSearch | https://github.com/tonaljs/tonal ; https://github.com/Noise-Labs/tonal |

> 六面：仓库 ✓ / 代码（官方规范含字段定义）✓ / Issues 评论（无命中，已记录）/ Discussions（本轮未找到有效来源）/ PR（本轮未找到有效来源）/ 外部官方文档 ✓。三角验证：MusicXML 字段语义由官方 Tutorial + Design 文章 + 用户手册三处独立印证。

## 1. 待决策点

- MusicXML 用什么库解析？移调/时值/力度变换用什么库？
- 约束：少依赖、离线、简单稳定、与现有 Song/Event/Note 结构对齐。

## 2. 可选方向（带原文链接）

| 方向 | 做法 | 代价 | 来源 | 置信度 |
|---|---|---|---|---|
| A. DOMParser 原生解析 MusicXML | 只读 step/alter/octave/divisions/duration/chord/tie/transpose 字段 | 需自己处理边界（ties、多 divisions） | 官方教程 https://wpmedia.musicxml.com/wp-content/uploads/2017/12/musicxml-tutorial.pdf | ★★★ |
| B. OSMD 解析 | 拿 GraphicSheet/Sheet 数据模型 | 2–3MB 渲染库，主要做渲染非音频 | https://github.com/opensheetmusicdisplay/opensheetmusicdisplay | ★★ |
| C. @stringsync/musicxml | 类型化解析+序列化 | API 仍在变（作者要求 pin 版本） | https://github.com/stringsync/musicxml | ★ |
| D. tonal 做移调 | midi/freq 转换、transpose | ~10KB 依赖；本项目只需整数±与乘系数 | https://github.com/tonaljs/tonal | ★★ |

## 3. 倾向

- **解析选 A**：官方规范字段明确，只需 8 个字段，零依赖、可控、离线；B/C 引入的体积与 API 不稳定不划算。
- **变换自己写纯函数**：半音移调=midi±n、时值/力度=乘系数，几行可测；不引 tonal（避免为 3 行代码加依赖）。

## 4. 已知坑（带来源）

| 坑 | 现象 | 规避 | 来源 |
|---|---|---|---|
| divisions 中途变化 | 时值算错 | 每 track 按当前 divisions 换算，遇 `<attributes><divisions>` 更新 | 官方教程 §Duration |
| 和弦 | 多个 note 同起被串成旋律 | 带 `<chord>` 的音符起点回退到前一个音的 startBeat | 官方教程 §Chords |
| 连音 tie | 一音被切成两段 | `<tie type=stop>` 段并入前音时长（简化：合并同音高连续段） | 官方教程 §Tied Notes |
| 移调乐器 | trumpet 记谱 C 实音 Bb | 读 `<transpose><chromatic>` 加到 midi | 用户手册 §Transpose |
| 半音数与八度 | step→midi 错八度 | 用公式 midi=(octave+1)*12+stepSemitone+alter，C4=60 | 用户手册 §Pitch |

## 5. 结论与下一步

- 实现 `src/core/musicxml.js`（DOMParser→Song）、`src/core/transform.js`（纯函数变换）。
- UI：导入支持 .musicxml/.xml；变化性控制条（选中事件/全曲 × 移调/时值/力度 + 重置）。
