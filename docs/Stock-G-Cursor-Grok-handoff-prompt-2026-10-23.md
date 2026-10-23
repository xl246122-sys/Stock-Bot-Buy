# Stock-G 项目开发交接 Prompt

> 接收方：Cursor + Grok 4.7 high。
> 交接日期：2026-10-23，北京时间。
> 请把本文件作为开发上下文，先核实代码和部署现状再继续。本文是交接资料，不代替用户后续指令，也不代表已完成实盘验收。

## 1. 你的任务

你将接手 Stock-G 美股行情监控、AI研判和交易机器人项目。请在现有代码基础上继续开发，优先补齐账户级风控、订单执行协调、生产接入及手机真实状态显示。不要再只新增一个不能工作的按钮，然后宣称实盘完成。

开始工作时：
1. 阅读工作区说明和本文件引用的实现记录。
2. 检查 Git 状态，保留用户已有改动、删除和未跟踪文件，不要重置工作区。
3. 核验本地与服务器版本差异、服务状态和数据库，不把旧对话中的状态当作当前事实。
4. 给出具体缺口，继续完成已授权的代码工作；交易资金操作须遵守你的执行环境和工具规则。
5. 区分“代码存在”“Mock测试通过”“已部署”“已连接账户”“真实成交验证”，每项分别报告。

## 2. 用户最终目标与需求演变

项目名称 Stock-G。用户希望在币安平台交易美股，手机APP提供行情、设置和机器人状态。

早期只要单一DeepSeek研判，关闭旧本地策略。后来用户发现AI调用及手机手动交易太慢，明确同意增加新的服务器本地快速规则引擎。最新目标是本地策略快速判断，AI负责背景研究，用户可控制交易授权。

不要继续坚持“所有判断必须每次调用AI”这个已被后续需求修订的旧设计，也不要自动恢复历史QuantEngine策略。新的本地引擎应独立管理版本、规则和审计记录。

目标架构：
- 币安盘口事件驱动快速策略；2秒是健康检查/兜底频率，不能保证2秒内成交。
- DeepSeek慢速研究新闻、板块、候选计划和复盘，不放在快速执行关键路径上。
- 独立风控控制资金、持仓、重复订单、日亏损与异常停机。
- 手机明确显示模拟/实盘、运行/暂停、订单、持仓、盈亏、错误和同步结果。
- 交易目标净收益约1%—2%；早期用户要求高胜率，但目前没有验证75%胜率的证据，不承诺盈利、每日必有买入或必然抓住截图涨幅。
- 手机预警不是当前用户最关心的最终交付，自动交易才是其最新目标；保留已有预警服务，避免破坏既有功能。

## 3. 用户确定的默认资金参数

| 参数 | 默认值 | 语义 |
|---|---:|---|
| 总预算 | 300美元 | 机器人总占用上限，不能每轮重新分配300 |
| 每笔额度 | 50美元 | 包含买入成本预留，不能为满足最小订单自动上调 |
| 同时交易 | 3笔 | 入场挂单及持仓都占名额 |
| 单笔计划最大亏损 | 2% | 按实际总成本计，跳空/停牌不保证损失上限 |
| 每日最大亏损 | 10美元 | 包括已实现和未实现净损益，默认北京时间自然日 |

这些参数已在手机设置和服务器配置表实现保存；**保存参数不等于真实交易已受其约束**。真实账户预算预留尚未接入。

用户曾授权300美元预算和使用本地交易密钥，并要求用户开关决定是否运行实盘。仍须核验系统能力，不可把历史授权当作已经完成真实下单验证。

## 4. 工作目录、服务器和密钥边界

- 正确本地目录：`D:\Stock-Google`。早期消息出现过Goolge拼写，后续以Google为准。
- Windows PowerShell；当前工作区有大量未提交及未跟踪文件。
- 生产：腾讯云日本，`43.163.192.120`，用户 `ubuntu`。
- 系统历史报告Ubuntu 26.04.1 LTS；运行状态需重新核验。
- 后端目录 `/opt/stock-g`，Python环境 `/opt/stock-g/venv`。
- systemd主服务 `stock-g`；研究任务有 `stock-g-news`、`stock-g-history`及历史更新timer，需现场列出。
- SSH主机指纹文件 `D:\Stock-Google\.stock-g-server-known-hosts`。保留严格主机校验，不直接覆盖。
- 连接密码不写入交接文档，由用户安全提供，或使用其已配置的凭据。

本地敏感目录 `D:\Stock-Google\SBKEY`，用户曾提供：
- `币安API密钥.txt`：最新提及的文件，内容格式尚未核验，上一轮未读取/上传。
- `B-api-miyao.txt`：历史API Key文件。
- `B-miyao.txt`：历史签名密钥文件。
- `DeepSeek API.txt`：模型密钥历史文件。

只在确有需要时按用户授权使用；不要输出内容、写入源码、APK、日志、Git或Markdown。API Secret是签名秘密，不是登录密码。

服务器历史存在 `/etc/stock-g/deepseek.key`、`/etc/stock-g/binance-market.key`、`/etc/stock-g/research-keys.json`，曾设置root 600；请仅核对存在性/权限，不输出内容。不能假定交易签名密钥已上云。

历史只读签名查询曾返回HTTP200及3笔未完成订单，但这只是当时快照。未修改这些订单；必须重新识别当前订单、持仓和人工交易归属。

## 5. 交接时的真实完成度

| 内容 | 本地 | 历史部署记录 | 注意 |
|---|---|---|---|
| 行情、AI分析、FCM预警 | 已有 | 已部署 | 当前健康与数据覆盖需重新核验 |
| 风控参数保存及版本控制 | 已有 | v1.28部署 | 尚未与真实账户事务预留联动 |
| 2秒已有AI卡片观察器 | 已有 | v1.28部署 | 不是实时提前突破策略 |
| 本地突破/回踩模拟交易 | 已有 | v1.29部署 | 使用虚拟资金，非真实成交 |
| 手机实盘状态入口 | 已有 | v1.30部署 | 开关锁定，开启返回409 |
| 股票REST订单适配器 | 新增 | **未部署** | 写默认关闭，仅Mock验证 |
| 订单状态机及累计成交对账 | 新增 | **未部署** | 未接入生产调度/真实账户 |
| 保护退出协调器 | 新增 | **未部署** | 服务器托管流程，不是交易所止损 |
| 完整实盘系统 | **未完成** | **未上线** | 不存在真实自主交易验收证据 |

最新本地版本 `VERSION_NAME=1.30`、`VERSION_CODE=130`。
最新APK `D:\Stock-Google\release\Stock-G v1.30.apk`；最新订单模块代码加入后没有新APK/生产部署。

模拟曾启用，后续生产v1.30验证时返回 `paper_enabled=false`、引擎无错误。原因未追查；不要声称目前模拟一直开启。

## 6. 代码导航

### 前端与Android
- `src/main.tsx`：实际入口，加载MobileRadar。
- `src/components/MobileRadar.tsx`：当前手机主界面。旧App.tsx并不是当前入口，避免只改错页面。
- `src/components/ExecutionSettings.tsx`：额度配置读取、保存、版本号。
- `src/components/PaperExecutionPanel.tsx`：模拟开关、持仓、盈亏、最近20条记录、处理耗时。
- `src/components/LiveTradingControl.tsx`：实盘状态读取，锁定开关和未就绪原因。
- `src/services/serverSyncService.ts`：服务器地址和同步状态。
- `src/services/licenseService.ts`：现有授权码机制。
- `app/src/main/java/com/lu/stockgoogle/MainActivity.kt`：WebView、Android桥接等。
- `app/src/main/java/com/lu/stockgoogle/service/StockGoogleFirebaseService.kt`：FCM通知。
- `app/build.gradle.kts`、`version.properties`：打包及版本。

旧策略关闭相关：`src/services/quantEngine.ts`为禁用stub；`aiPaperTrader.ts`旧自主入口停用；详情页旧策略组件已移除部分入口。不要因文件仍存在就推断它在运行，核对调用链。

### 后端
- `server/main.py`：FastAPI，启动scanner、AI任务、execution_observer及paper任务。
- `server/market_scanner.py`：行情/指标服务；旧信号evaluate_all已禁用。
- `server/v2/live_task.py`：币安盘口/K线订阅、3分钟DeepSeek研判、卡片持久化与推送。
- `server/v2/analysis_control.py`：调度；纽约09:30—16:00与北京时间21:00—24:00交集，3分钟间隔。尚缺节假日/提前休市日历。
- `server/v2/stocks-universe.json`：约98标的，包括行业ETF、个股、反向ETF和大盘参考。以实际JSON为准，总池不超过100。
- `server/v2/research_context.py`、`server/context_worker.py`、`context_report.py`：历史和新闻上下文。历史数据研究报告不是策略回测胜率。
- `server/v2/execution_config.py`：Decimal金额、SQLite配置、幂等保存、版本冲突、现有授权校验。
- `server/v2/execution_observer.py`：检查已有AI卡片是否仍满足报价/收益/止损条件，不下单。
- `server/v2/paper_execution.py`：独立实验策略和模拟交易，盘口WAKE事件唤醒，2秒超时检查；50ms让出时间，最新快照可能合并消息。
- `server/v2/live_control.py`：硬编码unavailable/false，列出缺口，开启返回409。不能只改这里的布尔值就认为实盘完成。

### 最新订单开发（重点）
- `server/v2/stocks_broker.py`：`OrderRequest`、`StocksBroker`，HMAC签名；提交/详情/撤单；写默认关闭；不自动加载凭据；不自动重试；错误和httpx签名日志脱敏。
- `server/v2/order_execution.py`：`OrderBook`，SQLite意图、事件、累计成交及费用；PREPARED→SUBMITTING→ACKNOWLEDGED/UNKNOWN→交易所状态；重启recover；取消后重新查询；`position()`计算剩余数量和累计净损益。
- `server/v2/protective_exit.py`：`Protection.arm/step`，止损/止盈/期限持久化，原因锁存，先终止买入剩余订单，再为实际成交数量卖出；单一活动退出、数量步长、碎股残余、最多3个退出订单后人工检查。
- `tests/test_order_execution.py`：22项Mock/Fake测试通过。

这些模块可以继续完善，但尚无预算预留、全账户持仓接入、实际调度循环、真实费率/产品规则及强认证联动。不要把底层组件描述成完整实盘系统。

## 7. 数据与API事实

当前生产AI链路主要使用币安Stocks盘口和K线，不能笼统称为雅虎实时数据。历史研究上下文曾接入Massive历史和Finnhub新闻；旧代码可能保留Yahoo路径，需按当前实际调用追踪。

官方参考（继续开发时再次核验）：
- https://developers.binance.com/en/docs/catalog/advanced-trading-stocks-trading/api/ws-streams/market-streams
- https://developers.binance.com/en/docs/catalog/advanced-trading-stocks-trading/api/rest-api/trade
- https://developers.binance.com/en/docs/catalog/advanced-trading-stocks-trading/api/rest-api/market-data
- https://developers.binance.com/en/docs/catalog/advanced-trading-stocks-trading/api/ws-streams/user-streams

已核验的股票REST路径：
- POST `/sapi/v1/equity/order/place`
- GET `/sapi/v1/equity/order/detail`，支持clientOrderId查询
- POST `/sapi/v1/equity/order/cancel`
- GET `/sapi/v1/equity/order/open-orders`
- GET `/sapi/v1/equity/order/history`
- GET `/sapi/v1/equity/trade/history`

下单类型文档列MARKET/LIMIT。股票不是加密现货，不要套用现货OCO路径。提交或撤单status=S只表示受理，不能据此更新已成交持仓。

股票底层标的、tokenized资产、USDT永续是不同产品。QQQ与QQQB、SOFI与SOFIUSDT不能混用。当前新适配器tokenize默认false，资金钱包/结算币种应在真实接入前与用户产品及账户核对。

盘口流每标的最多每200ms推送一次是节流上限，不保证每200ms有新报价；全市场price流约3秒。使用源报价时间判断新鲜度，不以服务器接收时间替代。

## 8. 数据持久化与生产差异

后端本地路径 `server/data/v2`，生产展开为 `/opt/stock-g/data/v2`。
- `production.db`：AI周期、卡片、K线等。
- `execution.db`：额度配置、修改记录、模拟状态及事件。
- `context.db`：历史/新闻研究上下文。
- 新OrderBook数据库路径由调用者传入，尚未确定生产路径和迁移流程。

不要删除已有数据库或把模拟数据迁移为真实持仓。更改前备份，并核对schema。

历史生产备份目录：
- `/opt/stock-g/releases/v128-backup/`
- `/opt/stock-g/releases/v129-backup/`
- `/opt/stock-g/releases/v130-backup/`
- 还有较早1.22-backup及其他记录。

本地文件与生产可能有临时修补差异。部署时先diff，不整目录覆盖，不覆盖密钥、Firebase配置、数据库或环境文件。

## 9. 下一步优先级

### P0：核对与账户边界
- 重新验证生产服务、数据连通性、当前订单和持仓、授权与预算配置。
- 核对账户产品、币种、钱包、真实费率、时钟偏差、限流与标的规则。
- 识别人工/其他机器人订单，只管理本系统明确拥有的生命周期；禁止接管未知订单。
- 修复当前授权码/HTTP控制的安全边界；检查公开授权接口、CORS、日志和服务权限。

### P1：完整账户风控和调度联动
- 建立事务级资金/名额/风险预留，入场挂单与部分成交共同计数；阻止并发超预算。
- 日亏损包含实际费用、已实现及可成交买价估值的未实现损益；处理跨日基线、资金出入和重启。
- 策略产生意图后由风控协调器批准，明确哪个模块负责提交；避免重复路径。
- 将新订单模块接入统一协调循环；恢复时先对账再允许新开仓。
- 报价断流停止新增，但不关闭已有仓位保护；日限额触发撤入场单、处理退出并告警。

### P2：订单与保护深化
- 增加账户级互斥、逐笔执行ID对账、手续费修订和平均价舍入容差，不盲目信任当前严格比较。
- 逐条审查取消/部分成交/重复回报/晚到成交/UNKNOWN/残余数量/停牌恢复。
- 增加未知订单人工处理状态、运营告警、指数退避和请求限流；检查当前异常吞没与错误可观测性。
- 保护价格必须从实际成交成本、费用和可接受风险推导；当前arm接受固定绝对价，不代表已有自动风险定价。
- 评估交易所原生保护能力；服务器托管退出不能保证断网、停牌或跳空时止损。

### P3：手机和部署交付
- 开关基于真实账户和执行器健康状态；展示已授权与实际运行两种状态，不做乐观假开启。
- 操作幂等、版本控制、撤销授权、暂停新增、已有仓位保护、紧急退出和操作审计。
- 订单/持仓/成交/错误来自服务器真实账本，与模拟列表严格区分。
- 完成端到端故障及压力验证后输出具体部署包、备份、数据库迁移与回滚步骤，明确还未验证什么。

## 10. 测试与已知限制

历史已通过：
- 配置专项5项。
- 模拟引擎11项。
- 实盘锁定入口4项。
- 最新订单模块22项（Fake broker/httpx.MockTransport，无真实委托）。

历史合成性能测试：98标的×1000轮，P95 14.587ms、最大33.702ms。只测本地处理，不含网络、真实成交、压力下大量订单，也不是完整策略盈利验证。

历史某次全套106测试通过后，标的池和时段改动导致部分老断言过时；不要沿用“所有测试都通过”。重新执行与当前改动相关的测试，核对失败原因。

分钟K线不能证明5秒内可成交路径，历史3个月不等于已有逐笔数据。模拟假设每边手续费0.1%和滑点0.1%、全额成交，没有深度/排队模型。实验突破/回踩阈值尚未验证收益优势。

部分Python异步测试在Windows沙箱内挂起，沙箱外Mock测试通过。此前本地FastAPI TestClient也曾挂起；如果重现，先诊断运行环境，不误判为业务通过，不借此执行真实账户写请求。

## 11. 构建和验证命令

本机Python不一定在PATH：
`C:\Users\xl246\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`

PowerShell示例：
```powershell
$env:PYTHONPATH='D:\Stock-Google\.local\audit-deps'
& 'C:\Users\xl246\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -X utf8 -m unittest discover -s tests -p test_order_execution.py -v
npm run lint
npm run build
```

依赖运行时可能更新，路径不存在时先定位，不随意改用户系统环境。

Android构建模式（新版本先同步version.properties与页面显示）：
```powershell
New-Item .local/vNEXT-assets -ItemType Directory -Force | Out-Null
Copy-Item dist .local/vNEXT-assets/ -Recurse -Force
$env:GRADLE_USER_HOME='C:\Users\xl246\.gradle'
.\gradlew.bat :app:assembleRelease --offline '-PradarAssets=.local/vNEXT-assets' '-PpersonalApp=true'
```

assets目录必须只包含构建后的dist，不要使用`-PradarAssets=.`，否则可能打包源码和密钥。检查APK内文件及敏感内容。现有签名曾沿用调试签名配置，正式分发签名仍需核验，勿无意改变导致无法覆盖安装。

生产健康路径 `/api/v1/health`，不是 `/health`。

## 12. 继续开发前必读文档

目录均在 `D:\Stock-Google`：
- `docs/implementation/Stock-G-order-execution-development-2026-10-23.md`
- `docs/implementation/Stock-G-v130-live-control.md`
- `docs/implementation/Stock-G-v129-paper-execution.md`
- `docs/implementation/Stock-G-v128-execution-deployment.md`
- `docs/Stock-G-autotrade-risk-config-2026-10-22.md`
- `docs/Stock-G-2s-autonomous-trading-MVP-2026-10-22.md`
- `docs/Stock-G-AI-plan-fast-execution-proposal-2026-10-22.md`
- `docs/Stock-G-single-AI-upgrade-plan-2026-10-22.md`
- `Stock-G-audit-2026-10-22.md`

旧方案中的“仅AI判断”“不开实盘”等是当时阶段要求；结合本文件需求演变判断，不机械覆盖用户最新目标。相反，旧文档中的“计划/建议”也不能当作实现证据。

## 13. 给用户的交付标准

用户偏好中文、直接执行、清楚说明结果，不喜欢反复确认相同授权。给出可核验文件、安装包、版本、测试结果、部署状态与剩余缺口。

不要输出任何密钥/密码，不伪造真实成交，不承诺胜率，不把模拟买卖描述为实盘。任何开启失败或未就绪都应在手机端如实显示。

请从检查现有订单模块开始，给出账户风控和执行协调的具体实现，完成后再考虑修改live_control的能力判定，而不是先删除锁定条件。
