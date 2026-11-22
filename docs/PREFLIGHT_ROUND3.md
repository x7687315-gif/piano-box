# 开工前调研 · 第三轮：踏板映射 + 新手引导 + 实测曲目

> 2026-11-22 · 快速核查模式（github-preflight）

## 0. 检索台账（必填）

| # | 查询原文 | 面 / 工具 | 采用的 URL |
|---|---------|----------|-----------|
| 1 | `piano three pedals names sustain soft una corda sostenuto function keyboard mapping web piano app` | 外部 / WebSearch | https://indipiano.com/what-are-piano-pedals ; https://musescore.com/articles/all-about-piano/how-to-use-the-pedals ; https://www.epiano.org/guides/piano-pedals |
| 2 | `Tone.js sustain pedal keyboard space key mapping web piano Tone.Sampler sustain implementation github` | 仓库+代码 / WebSearch | https://github.com/dimamik/live_piano ; https://github.com/sayanjc3639q/interective_piano ; https://tonejs.github.io/docs/r11/Sampler |
| 3 | `is:issue in:comments sustain pedal sampler CC64`（评论正文检索） | Issues 评论 / WebFetch | 无有效命中（如实记录） |
| 4 | `MIDI CC64 sustain pedal CC67 soft pedal CC66 sostenuto standard control change numbers` | 外部（MIDI 官方）/ WebSearch | https://midi.org/?p=7438 ; https://craiganderton.org/?p=3353/ ; https://nektartech.com/article/blog/all-you-need-to-know-about-midi/ |
| 5 | `is:issue is:closed in:comments sustain pedal`（评论检索） | Issues 评论 / WebFetch | 无有效命中（如实记录） |
| 6 | `web piano app beginner tutorial highlight next key guide keyboard learning UX pattern github` | 仓库 / WebSearch | https://github.com/uset82/keylit ; https://github.com/sarahxu0205/kid-piano ; https://github.com/pleabargain/piano-app |

> 六面：仓库 ✓ / 代码 ✓ / Issues 评论（两次无命中，如实记录）/ Discussions（本轮未找到有效来源）/ PR（本轮未找到有效来源）/ 外部官方文档 ✓。三角验证：三踏板定义由 4 个独立来源印证；CC 号由 MIDI 官方 Piano Profile + 2 个 CC 表印证。

## 1. 三踏板答案（用户所问）

| 位置 | 名称 | 作用 | MIDI CC | 用户理解纠正 |
|---|---|---|---|---|
| 右 | **Sustain 延音（damper）** | 抬起所有制音器，松键后继续响 | CC64 | 你说的"延长"是对的 |
| 中 | **Sostenuto 持音** | 只保持"按下踏板瞬间已按住"的音，之后弹的不保持 | CC66 | — |
| 左 | **Una Corda 柔音（soft）** | 三角钢琴移击弦点，音色更轻柔朦胧（不只是音量小） | CC67 | 你说的"空灵效果"就是这个 |

**没有"暂停"踏板** —— 用户记忆有偏差，实际是上面三个。

## 2. 可选方向与倾向

| 决策 | 方向 A | 方向 B | 倾向 |
|---|---|---|---|
| Sustain 实现 | Tone.js 无内置踏板类；用 note tracking（held notes 到踏板抬起才 release） | 改每个音符 release 时间 | A：live_piano 项目现成做法（来源 #2） |
| 键盘映射 | 空格=常用 sustain 事实标准（社区惯例） | 自定义键 | A：空格给 sustain；额外 Z/X/C 给三踏板，避免与弹琴键位冲突 |
| 新手引导 | 下一音高亮 + 弹对才前进（keylit/kid-piano） | 定时自动推进 | A：音乐盒模式本来任意键推进，引导层只加"高亮 + 下一步提示 + 首次引导卡片" |

## 3. 已知坑

- 踏板键位不能与弹琴键位、空格"下一步"冲突 → 三踏板用独立键（Z/X/C）且只在自由钢琴模式/按住时生效；音乐盒模式空格仍是下一步。
- Sustain 与 88 键高亮/triggerRelease 的 voice 管理要共用同一 key，避免 stuck notes。
- CC64/66/67 若 MIDI 文件本身带踏板事件，自动播放应尊重（可后续支持，本轮先做键盘手动控制）。

## 4. 实测曲目

- 坂本龙一《Merry Christmas Mr. Lawrence》：有版权，MIDI 文件仅本地测试使用，**不入库、不推送**（遵守用户"真实数据自测但不入库"纪律）。
