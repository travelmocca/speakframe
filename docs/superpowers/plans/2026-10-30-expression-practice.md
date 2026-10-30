# 表达练习网站开发计划

> 执行方式：使用 executing-plans 按任务顺序执行；本计划不要求并行子代理。每项完成后检查验收结果，再推进下一项。

**Goal：** 完成手机号密码登录、自选内容录音、千问五维分析、针对性重练、前后对比与删除的可运行网站。

**Architecture：** 单个 Next.js 全栈项目，三个页面类型，浏览器录音、服务端保存文件和调用千问。SQLite 保存账号、会话、练习及分析任务，独立轻量 worker 执行耗时分析；先以本机或单机常驻服务运行。

**Tech Stack（实施建议）：** Node.js 22、Next.js App Router、TypeScript、React、CSS Modules、better-sqlite3、Zod、FFmpeg；Vitest 与 Playwright 用于关键逻辑和主流程验证。版本在初始化时选择兼容的稳定版并写入锁文件，不引入额外组件库、队列服务或独立 ASR。

日期：2026-10-30。依据：`specs/001-expression-practice.md`、本聊天已确认的三页结构、`outputs/omni-audio-samples/测试报告.md`。

## 1. 已确认范围与实施假设

已确认：

- 用户自选内容与表达目标；不出题，不设训练周期、难度递进和能力总分。
- 五维框架：抓重点、排顺序、展开内容、衔接与恢复、口头禅与语气垫词。
- AI直接使用 `qwen3.8-omni-flash`，负责原音转写、分析及比较；不再以模型选型为前置条件。
- 保存录音、转写、问题及重练关联；用户可删除整组练习。
- 手机号加密码注册与登录，不用验证码。

实施假设，区别于用户确认的产品需求：

- 第一版运行在本地或一台有持久磁盘的服务器；不直接部署到临时文件系统的函数平台。
- 首版手机号按中国大陆11位号码处理；密码8—128位，首次不提供自动找回入口。
- 单次录音暂限10分钟、上传限50MB，以较先达到者为准；限制在开始录音前显示，并集中配置。
- 支持多次重练，每次选一个问题，并记录其来源录音；比较对象明确显示，不默认拿错轮次。
- 首版没有转写编辑、实时转写、精确词级定位、统计页、分享、付费或管理后台。
- 当前任务只形成计划和安装技能，不创建应用代码，不部署。

## 2. Hallmark 的应用方式

- 已安装：`/Users/faria/.codex/skills/hallmark`，版本2.0.0。
- 仓库：<https://github.com/Nutlope/hallmark>。安装时查询到的 main 提交：`4f6a46c6dc325d40ab268c93e25c7b96676ebccd`；安装文件未携带Git历史，该提交作为查询记录，不冒充文件逐项哈希验证。
- 按 `references/flow.md` 的 **App screens** 和 **Harnesses** 分支执行，采用 `--scope app`。
- 已完成一次主题抽取：Furrow、Console、Dose；三张预览已查看。推荐 Dose，以浅暖底、深绿文字和单一绿色主操作为方向；这是设计建议，不是用户已锁定的品牌系统。
- 抽取记录：`chinese-adult-spoken-expression-52c7·bc2327dd·2026-10-30·r0`，Dose为3/3。
- 主题仅提供色彩、字体层级、表面和控件风格。中文采用适配的中文无衬线字体回退；不照搬药品文案、药盒、照片或展示页布局。
- 页面共用顶部栏，无侧边导航；练习列表以行列表为主；工作台以录音、原文和问题为核心对象。
- 色彩、字体、间距使用tokens；有即时键盘焦点、足够对比度、减弱动效适配。录音状态有文字和计时，不能只靠颜色。
- 不放虚构分数、进步曲线、用户评价；不做营销大屏、装饰波形、自动展开动画和卡片套卡片。
- 三页都有加载、空白、错误、正常状态；录音、上传、分析分别显示真实状态，不假报完成。
- 框架页面使用 `sloplint --scope app --url` 检查。Codex按Hallmark自身的Harness分支做同会话复审，并如实记录；不声称使用了独立审查者。
- Node和Chrome已存在；项目中尚不能解析 `puppeteer-core`，实施时作为开发依赖安装后再做渲染检查。

## 3. 三个页面

| 页面 | 路由 | 内容与主要操作 |
| --- | --- | --- |
| 登录／注册 | `/auth` | 同页切换登录和注册，手机号、密码；注册时确认密码；显示真实校验错误；成功后进入列表。 |
| 练习列表 | `/practices` | 历史主题、更新时间、处理状态；新建、进入、确认删除；首次为空时只突出开始练习。 |
| 练习工作台 | `/practices/[id]` | 自选主题与目标、录音回听、转写、五维问题、选一个问题重练、前后比较。 |

点击新建时创建归属当前用户的空草稿，再进入工作台填写主题和目标；未填写完整前不能提交分析。草稿可从列表继续或删除。

工作台桌面布局：左侧为当前录音、文本，右侧为问题与改进动作；选中问题后，在原位置展开重练区域。比较模式并排呈现两个版本，明确来源轮次和目标问题。手机端改单列或版本切换，保留完整功能，不压缩成两列小字。

## 4. 项目文件与职责

```text
src/app/auth/page.tsx                          登录注册
src/app/practices/page.tsx                     练习列表
src/app/practices/[id]/page.tsx                工作台
src/app/layout.tsx                            全局布局
src/app/tokens.css / base.css / globals.css    Hallmark基础和应用样式
src/app/api/auth/{register,login,logout}/route.ts
src/app/api/practices/route.ts
src/app/api/practices/[id]/route.ts
src/app/api/practices/[id]/attempts/route.ts
src/app/api/attempts/[id]/{audio,analyze}/route.ts
src/app/api/comparisons/route.ts
src/app/api/jobs/[id]/route.ts
src/components/auth-form.tsx
src/components/practice-list.tsx
src/components/practice-workbench.tsx
src/components/audio-recorder.tsx
src/components/analysis-panel.tsx
src/components/comparison-panel.tsx
src/lib/db.ts / schema.sql                    数据与迁移
src/lib/auth.ts                               密码和会话
src/lib/storage.ts                            私有录音文件
src/lib/qwen.ts / analysis-schema.ts           模型调用、提示和校验
src/lib/jobs.ts                               任务领取、租约和状态
src/worker.ts                                 分析及比较任务执行
tests/auth.test.ts / access.test.ts
tests/analysis.test.ts / jobs.test.ts
e2e/practice.spec.ts
scripts/dev.mjs                               启动网站和worker
var/app.sqlite / var/audio/                    运行数据，忽略提交
.env.example / README.md                       配置与启动说明
.hallmark/preflight.json / log.json            设计依据与检查记录
```

接口方法：注册、登录、退出均为POST；练习集合GET/POST；练习详情GET/PATCH/DELETE；上传录音POST；音频GET并支持Range回听；分析POST；比较POST；任务状态GET。所有资源查询均以会话用户归属约束，不能只验证“已登录”。

## 5. 数据与处理规则

| 数据 | 最小字段 |
| --- | --- |
| User | id、唯一手机号、密码哈希、创建时间 |
| Session | token哈希、用户id、过期时间 |
| Practice | id、用户id、主题、表达目标、时间、删除状态 |
| Attempt | id、练习id、轮次、来源录音id、目标问题id、原始文件、格式、时长、转写、分析、模型原始文本、框架及提示版本、状态 |
| Job | id、类型、目标记录id、状态、领取租约、尝试次数、错误摘要、时间 |
| Comparison | id、练习id、两个录音id、目标问题id、比较结果、模型及提示版本、状态 |

- 密码使用Node内置scrypt和随机盐；会话使用随机token，数据库仅保存其哈希，Cookie设置HttpOnly、SameSite，HTTPS下Secure。注销使会话失效。
- 账号写入由数据库唯一约束兜底；登录按手机号和来源进行限速；写请求检查同源。UI校验不能替代服务端校验。
- `.env.local`只用于服务端配置：`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、`QWEN_MODEL`。继续使用已验证的北京地址；不覆盖用户现有密钥导出文件，不将Key放进前端变量。
- 原始音频存在`var/audio`，不能放`public`；随机文件名，登录鉴权后读取。转换临时文件处理结束删除。
- 上传后先保存录音，再创建分析任务；页面离开不影响任务。重复提交复用同一正在执行的任务，已成功结果不被自动重复收费。
- worker使用SQLite任务表领取租约；进程重启回收过期任务为可重试状态。外部请求超时或JSON错误均展示失败和手动重试，不无限自动调用。
- 删除先标记并取消关联任务，阻止正在运行的任务写回，再删除录音和关联数据；失败时保留可重试删除状态。不能出现删除后被worker重新写回的记录。第三方服务留存行为不冒充本地可控删除。

## 6. 录音与千问接入

1. 浏览器以`getUserMedia`与`MediaRecorder`录音；检测支持格式，优先WebM/Opus，兼容时采用MP4/AAC。停止后释放麦克风，允许回听或重新录。
2. 不依赖浏览器语音识别，不裁掉静音，不顺滑或清理垫词；格式不支持或权限拒绝时给出明确操作提示。
3. 服务端验证实际音频、时长和大小，以FFmpeg转换为16kHz单声道PCM WAV供模型使用；原始上传录音保留。FFmpeg通过参数数组调用，不拼接shell字符串。
4. 服务端直接发送原音和用户目标给Omni，一次取得转写与五维分析；保留重复、改口和垫词。不提供参考答案。
5. 输出字段固定：`transcript`、`dimensions`、`issues`、`uncertainty`；问题含稳定id、维度、原文证据、影响、一个改进动作。正常用法不能仅按关键词计数判为垫词。
6. Zod检查结构、类型和维度枚举；校验引用是否存在于转写，找不到的证据标为无法核验，不伪造引用。合法空问题表示未发现明确问题，结构错误不等同于无问题。
7. 第一版不展示模型生成的精确时间戳，不以其驱动自动定位；音频仍可正常拖动回听。问题先通过原话与对应版本关联。
8. 比较时将两次已保存的转写、分析、目标问题提交同一Omni模型，明确要求只比较本次差异，输出改善、未解决或无法判断及双方证据。这里依据文本与分析比较，不冒充重新核验原音计数。
9. 没有发现可重练问题时展示明确空状态，允许重新表达；不强制编造一个问题。

## 7. 实施任务与验收

### Task 1：初始化与设计基础

文件：`package.json`、锁文件、`tsconfig.json`、`src/app/layout.tsx`、三份全局样式、`.hallmark/*`、`.env.example`、`.gitignore`。

- [x] 在当前仓库非空目录中手动建立最小Next.js项目，不覆盖PRD、测试音频、结果、密钥和现有Git历史。
- [x] 先记录Hallmark preflight与本计划的推荐方向，再读取app范围需要的layout、craft、交互状态及gates规则；不把设计建议冒充用户品牌偏好。
- [x] 使用主题脚手架生成token及基础样式：

```bash
node /Users/faria/.codex/skills/hallmark/scripts/theme.mjs scaffold dose --scope app --dir src/app --dealt '3/3, seed chinese-adult-spoken-expression-52c7·bc2327dd·2026-10-30·r0'
```

- [x] 配置`dev`、`worker`、`build`、`typecheck`、`test`、`test:e2e`脚本；`npm run dev`同时启动网站与worker，任一退出时清理子进程。
- [x] 忽略运行数据库、录音、构建缓存及浏览器测试产物；在忽略`.env.*`后用`!.env.example`允许无密钥配置模板，生产密钥不进入源码。
- [x] 验收：`npm run typecheck`和`npm run build`退出码0；启动后可访问基本布局。

### Task 2：三个页面及真实状态结构

文件：三页及`auth-form.tsx`、`practice-list.tsx`、`practice-workbench.tsx`、`audio-recorder.tsx`、`analysis-panel.tsx`、`comparison-panel.tsx`。

- [x] 先完成录音工作台的主要区域，再复用样式到列表和登录；应用页不建营销hero。
- [x] 实现登录/注册切换、主题目标输入、录音区、原文区、五维问题、选中问题和版本比较布局。
- [x] 完成加载、空、失败、成功、禁用、键盘焦点等状态；录音中、上传中和分析中分开显示。
- [x] 视觉开发样例仅在开发预览中明确标“示例”；未接通的提交操作禁用并说明，不用假成功替代后端。
- [x] 验收：桌面与手机均能顺序完成操作；无横向溢出；长中文原文、长主题和多个问题不会撑破布局。

### Task 3：账号、持久化与归属校验

文件：`schema.sql`、`db.ts`、`auth.ts`、账号及练习接口；测试：`auth.test.ts`、`access.test.ts`。

- [x] 先为重复手机号、密码正确/错误、会话过期、跨用户读写及删除写测试，确认缺少实现时失败。
- [x] 实现数据库初始化、scrypt密码、Cookie会话、注册登录退出；所有练习相关服务以当前用户id查询。
- [x] 实现草稿创建、列表、详情、主题目标保存，列表时间与状态来自实际数据。
- [x] 验收：`npm run test -- tests/auth.test.ts tests/access.test.ts`通过；用两个账号验证直接访问资源id也无法越权；重启后数据仍在。

### Task 4：真实录音、上传与回听

文件：`audio-recorder.tsx`、`storage.ts`、录音上传及读取接口；测试：`access.test.ts`、`practice.spec.ts`。

- [x] 实现权限请求、计时、停止、回听、重录、离开时提示未保存录音和麦克风释放。
- [x] 实现受限上传、实际文件解码验证、私有保存、时长与大小限制、鉴权和Range播放。
- [x] Chrome虚拟麦克风实际执行MediaRecorder、上传和回听；第一版本机验收范围为Chrome。物理麦克风、真实Safari未验证，保留在验收边界中。
- [x] 验收：刷新或退出登录后再进入仍可回听；无权限、空录音、损坏文件、超限文件均有明确提示；其他账号拿到音频URL仍不可访问。

### Task 5：Omni分析与任务恢复

文件：`qwen.ts`、`analysis-schema.ts`、`jobs.ts`、`worker.ts`、分析及任务状态接口；测试：`analysis.test.ts`、`jobs.test.ts`。

- [x] 先覆盖无效JSON、引用缺失、非法维度、空问题、超时、重复提交、租约过期的失败场景。
- [x] 将已有测试脚本中验证过的音频输入和流式响应方式移入服务端；配置从环境变量读取，不直接依赖带密钥CSV文件。
- [x] 实现格式转换、任务入队、领取、状态轮询、结果持久化与手动重试；模型失败时原始录音仍存在。
- [x] 固化五维提示词、结构及版本，保存原始模型文本与用量，面向用户的错误信息不包含凭证或内部路径。
- [x] 验收：`npm run test -- tests/analysis.test.ts tests/jobs.test.ts`通过；以现有02、14、23三条样本做一次小规模真实API烟测，确认接通与结果可呈现，不要求模型计数被证明完全正确。

### Task 6：针对性重练、比较与完整删除

文件：`practice-workbench.tsx`、`comparison-panel.tsx`、比较接口、删除接口与worker；测试：`jobs.test.ts`、`practice.spec.ts`。

- [x] 用户选择一个问题后重录，保存来源录音、目标问题及新轮次；不能覆盖第一次录音。
- [x] 实现双版本回听与文本切换、围绕目标问题的AI比较，明确提示依据及不确定性，不强行宣布进步。
- [x] 删除整组练习时确认范围，取消任务并清理全部关联数据和文件；测试正在分析、分析失败和含多次重练三种删除情况。
- [x] 验收：重练关系准确，换版本不会对应错问题；刷新后比较结果保留；删除后资源不可读、文件已移除、worker不能复活记录。

### Task 7：联调、Hallmark检查与交付

文件：`README.md`、`e2e/practice.spec.ts`、`outputs/uat/`、`.hallmark/log.json`。

- [x] 自动化走通注册、创建、录音上传、分析、重练、比较、删除；模型响应可替身测试错误与确定性流程，明确与真实API烟测区分。
- [x] 完成Chrome麦克风API允许及拒绝、真实编码、手机尺寸模拟和服务重启恢复；WebKit启动失败，物理手机及真实Safari如实标记未验证。
- [x] 类型检查、关键逻辑测试、E2E与生产构建通过后，执行Hallmark三页渲染检查；鉴权页通过工具支持的会话Cookie检查，不为了截图开放私人页面。

```bash
npm run typecheck
npm run test
npm run test:e2e
npm run build
node /Users/faria/.codex/skills/hallmark/scripts/sloplint.mjs src/app src/components --scope app --genre modern-minimal --render --url http://localhost:3000/auth
```

- [x] 核实sloplint对受保护路由的会话支持，再以相同检查覆盖列表和工作台；如工具无法注入会话，静态检查继续执行，使用已登录Playwright补充真实截图，并明确工具渲染未覆盖的部分。
- [x] 修复全部Floor失败项；Reflex项修复或记录具体理由；逐张查看截图并同会话复审；不伪造通过结论。
- [x] README写清配置、FFmpeg依赖、`npm run dev`、常驻worker、数据库文件、备份方式及已知限制；本轮不自动发布或购买云资源。
- [x] 按PRD验收表保存通过/失败、证据路径、验证人、日期和未覆盖项。以真实端到端流程和可回看记录作为交付依据。

## 8. 需求覆盖

| PRD | 对应任务 |
| --- | --- |
| FR-01 自选内容、录音 | Task 2、3、4 |
| FR-02 保存、转写、回看 | Task 3、4、5 |
| FR-03 五维分析和证据 | Task 2、5 |
| FR-04 重练关联 | Task 6 |
| FR-05 前后比较 | Task 6 |
| FR-06 完整删除 | Task 3、6、7 |
| FR-07 注册、登录、数据隔离 | Task 3、4、7 |
| 异常恢复、界面状态、视觉规范 | Task 2、4、5、7 |

## 9. 完成标准

三页可用；真实账号、录音、转写、分析、重练和比较形成闭环；记录刷新与重启后保留；越权被拒绝；删除清理完整；失败可恢复；关键检查有证据。模型有遗漏、评价变化和时间定位不可靠的已知边界如实保留，不能把网站接通等同于模型效果已验收。

## 10. 实施记录（2026-10-30）

- 三页、真实录音、直接Omni分析、重练、比较、删除及账号隔离已实现。
- 为减少重复，数据与会话归并为`src/lib/store.ts`，API归并为`src/app/api/[...path]/route.ts`；不改变功能和鉴权边界。
- 运行端口改为3118，避免占用已有3000服务。`npm start`同时启动正式网站与worker。
- 百炼Base64音频限制小于10MB；改用16kHz单声道96kbps MP3作为模型输入，原始录音保留。600秒边界有编码及大小回归验证。
- 增加会话内未保存录音草稿及取消／重录竞态保护；不将其宣称为服务端持久保存。
- 完成23项单元测试、4项Chrome浏览器端到端测试、真实模型失败重试与整站重启保留验证。证据见`outputs/uat/验收报告.md`。
- WebKit启动失败，尚未完成真实Safari或物理手机验证，不计为通过。Hallmark受保护页面使用已登录Playwright补充截图，未开放私有页面供检查。
