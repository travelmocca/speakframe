<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 项目约定

- 先结论，保留证据与不确定性；按 `specs/001-expression-practice.md` 控制范围。
- `npm run dev`和`npm start`都会启动网站及worker；模型或worker代码变化后重启进程。
- 运行数据在`var/`，密钥在本地环境文件。不要提交、打印或复制凭据到前端；不要将运行数据纳入构建文件跟踪。
- 所有练习、音频、任务和比较的访问都需要验证用户归属；删除不得被并发任务写回复活。
- 保留原始音频与垫词；问题引用要核验，不能用模型生成的精确时间戳驱动定位。
- 前端按Hallmark的app screen规范；不加评分、打卡、课程、难度或训练周期。
- 交付前运行类型检查、单元测试、生产构建和真实模型浏览器端到端验证；模拟输入、真人录音、浏览器引擎验证必须区分。
