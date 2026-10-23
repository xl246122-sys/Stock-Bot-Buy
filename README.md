# Stock-G / Stock-Bot-Buy

个人美股量化交易项目，当前源码版本 **1.36**。包含 React / TypeScript 前端、Android WebView 客户端和 Python / FastAPI 后端。

## 目录

- `src/`：移动端界面、行情展示、订单面板和个人设备绑定。
- `app/`、`gradle/`：Android 原生壳、通知与后台服务。
- `server/`：行情采集、量化策略、订单执行、资金保护和鉴权。
- `tests/`：后端自动化测试。
- `tools/`：研究、数据处理和验证工具。
- `docs/`：设计与研究文档；部分历史方案不代表当前运行配置。

## 前端

需要 Node.js 和 npm。

```powershell
npm ci
npm run lint
npm run dev
npm run build
```

`dist/` 为生产构建结果。Vite 仅公开 `VITE_PUBLIC_` 前缀环境变量，不应把交易凭据加入前端环境变量。复制 `.env.example` 到 `.env` 后按需配置后端服务。

## 后端

需要 Python 3.11 或兼容版本。

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r server/requirements.txt
cd server
..\.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Linux 使用对应的 `.venv/bin/python`。Firebase 服务账户和交易平台密钥需由部署者单独提供；源码不包含生产配置或数据。具体外部服务配置见 `server/config.py` 和 `server/v2/` 的凭据加载模块。缺少外部服务凭据时，相关行情、通知或交易能力不可用。

```powershell
python -m unittest discover -s tests
```

首次启动会创建运行数据库，但不会自动生成个人设备绑定码。`personal_binding` 需由管理员配置指定设备 ID 与私人绑定码的 SHA-256 摘要；不要在源码中保存原始绑定码。生产数据库、持仓和实时交易授权不随源码发布，不能通过克隆仓库恢复。

## Android 构建

需要 JDK 17、Android SDK 35 和本机 `local.properties` 中的 SDK 路径。自行提供对应 Firebase 项目的 `app/google-services.json`，生产签名材料由部署者自行管理。

```powershell
npm run build
New-Item -ItemType Directory -Force .local/package-assets
Copy-Item -Recurse -Force dist .local/package-assets/
.\gradlew.bat :app:assembleRelease '-PradarAssets=.local/package-assets' '-PpersonalApp=true'
```

APK 输出到 `release/`。当前构建配置使用调试签名，不包含生产私钥。可另行运行 `python tools/build_radar_apk.py` 构建隔离的离线雷达测试版本。

## 当前行为与边界

- 本地量化策略独立决策，入场窗口为美东正常开盘后 30 分钟；实际开关和额度由服务器配置控制。
- 订单面板区分当前持仓、进行中委托和已结束委托，委托展示最近 40 条记录。
- 设置页不再显示模拟交易模块，采用指定设备与私人绑定码校验。
- 盈利目标、止损和胜率不是收益保证；设备编号与秘密码校验不是硬件证明或自然人身份认证。
- 项目保留既有服务器地址及 HTTP 连接方式。独立部署需检查所有端点并配置 HTTPS。

## 此仓库不包含

环境变量实值、API 密钥、Firebase 私钥、设备绑定码、生产数据库、交易记录、SSH 记录、历史构建、APK、依赖缓存、本地运维备份以及仅服务于原生产环境的部署脚本。

本次首次导入仅包含经筛选的当前源码快照，不包含本地旧 Git 历史。
