**其他语言版本:[ENGLISH](README.md),[中文](README_zh.md).**
# Research Update

Research Update 是一个在本地运行的个人科研雷达，用于追踪 arXiv 和 NASA ADS 上的天文学论文。它会根据已确认的研究画像生成每日排序阅读列表和具有证据支持的主题雷达，同时保留完整、可搜索的论文信息流。

## 环境要求

- Node.js 22 或更高版本
- 可选的 [NASA ADS API Token](https://ui.adsabs.harvard.edu/help/api/)
- 可选的 OpenAI-compatible 分析接口凭据

使用 arXiv 不需要账号或 Token。只有配置 ADS Token 后，ADS 相关功能才会启用。

## 安装与运行

```powershell
cd RFU
npm install
Copy-Item .env.example .env
npm run dev
```

打开 `http://localhost:5173`。开发模式下，Vite 运行在 5173 端口，本地 API 运行在 4173 端口。

如需运行构建后的单进程版本：

```powershell
npm run build
npm start
```

打开 `http://localhost:4173`。

## ADS 配置

在 `.env` 中添加 Token：

```dotenv
ADS_API_TOKEN=your_token_here
PORT=4173
```

Token 仅由本地服务端读取，不会返回浏览器、写入 SQLite、记录到日志或包含在迁移归档中。修改 `.env` 后需要重启服务。

## 界面使用

- 首次使用时，输入你的研究方向，检查系统解析出的主题、天体、方法、数据类型、作者和排除项，然后确认研究画像。
- **研究雷达**显示每日精选和主题趋势。每条推荐都会展示评分依据；未配置 AI 或 AI 调用失败时，系统仍可使用纯规则模式。
- 将推荐标记为“相关”或“不相关”并选择原因，可影响后续排序。
- 在顶部输入临时查询词，然后选择**搜索**。
- 临时搜索成功后，可将它保存到**关注词**。
- 打开界面时，系统会刷新已启用的关注词；刷新完成后会重新生成每日精选和研究雷达。选择**更新**可手动执行相同流程。
- 可以按关注词、来源、已读或收藏状态筛选论文，并按时间或引用量排序。
- 论文标题和摘要保持来源语言；应用界面控件可以在中文和英文之间切换。

首次请求会从每个可用来源获取最多 50 条最新结果。后续刷新会以各来源上次成功时间为起点，保留 24 小时重叠窗口，然后对重叠结果进行去重。

## 可选 AI 分析

在 `.env` 中配置任意 OpenAI-compatible 接口：

```dotenv
AI_BASE_URL=https://your-provider.example/v1
AI_MODEL=your-model
AI_API_KEY=your-secret-key
```

API Key 仅保存在服务端环境中，不会写入 SQLite、返回浏览器或包含在导出文件中。如果三个配置项不完整，研究雷达会使用确定性、可解释的规则评分。AI 服务调用失败时也会降级为纯规则排序。

## 备份与迁移

打开**数据迁移**，选择**导出 ZIP**。v2 归档包含关注词、设置、缓存的论文元数据、用户状态、研究画像、主题证据、评分、反馈和每日精选。已有的 v1 归档仍可导入。

在新设备上安装 Research Update，打开数据迁移面板，选择 ZIP 文件，检查数据数量后确认恢复。恢复操作具有事务性：无效或不兼容的归档不会改变当前数据库。ADS Token 不会写入归档，必须在新设备上重新配置。

## 本地数据

默认数据库位于 `RFU/data/research-update.db`。可以通过 `DATABASE_PATH` 指定其他位置。数据库文件、`.env`、日志、构建产物和依赖目录均被 Git 忽略。

Research Update 仅在本地运行：没有账号系统、云同步、关闭应用后的通知、机器翻译或 PDF 存储功能。

## 验证

```powershell
npm test
npm run build
npm run test:e2e
```

自动化测试使用固定的 arXiv 和 ADS 测试数据，不依赖实时第三方服务。
