# Hindsight 中文说明

Hindsight 是一个面向 AI Agent 的长期记忆系统。它不只是保存和检索聊天记录，还会把输入内容加工为事实、实体、关系、观察和心智模型，帮助 Agent 在后续交互中持续学习。

> **能力边界**：Hindsight 负责记忆的写入、检索和基于记忆的生成，不替代业务系统的权限、事实核验或最终决策。

英文原版：[README.md](./README.md) · 官方文档：[hindsight.vectorize.io](https://hindsight.vectorize.io)

## 目录

- [项目结构](#项目结构)
- [最快启动方式](#最快启动方式)
- [验证服务](#验证服务)
- [连接 API](#连接-api)
- [核心概念](#核心概念)
- [部署方式](#部署方式)
- [中文文档](#中文文档)
- [开发与贡献](#开发与贡献)

## 项目结构

| 目录 | 作用 |
| --- | --- |
| `hindsight-api-slim/` | FastAPI API 服务和核心记忆引擎 |
| `hindsight-control-plane/` | Next.js 管理控制台 |
| `hindsight-cli/` | Rust CLI |
| `hindsight-clients/` | Python、TypeScript、Go、Rust 客户端 |
| `hindsight-docs/` | Docusaurus 官方文档站 |
| `hindsight-integrations/` | Agent 框架和工具集成 |
| `scripts/dev/` | 本地安装、启动和辅助脚本 |

默认数据存储使用本地嵌入式 PostgreSQL（pg0），适合开发和试用；生产环境建议配置外部 PostgreSQL，并启用受支持的向量扩展。

## 最快启动方式

### 1. 准备依赖

推荐使用仓库自带的一键脚本。它会检查并安装 `uv`、Node.js/npm、Rust/cargo，安装工作区依赖，并按配置预热本地模型：

```bash
./scripts/dev/setup.sh
```

如果只想安装依赖、不构建 CLI/SDK：

```bash
./scripts/dev/setup.sh --skip-build
```

如果不希望下载本地 embedding/reranker 模型：

```bash
./scripts/dev/setup.sh --skip-models
```

如果依赖下载出现 `Failed to download` 或 `Failed to extract archive`，可先增加 uv 的网络超时和重试次数：

```bash
UV_HTTP_TIMEOUT=600 UV_HTTP_RETRIES=5 uv sync
./scripts/dev/setup.sh --skip-models
```

### 2. 创建并配置环境文件

```bash
cp .env.example .env
```

最小配置示例（以 OpenAI 为例）：

```dotenv
HINDSIGHT_API_LLM_PROVIDER=openai
HINDSIGHT_API_LLM_API_KEY=替换为你的_API_Key
HINDSIGHT_API_LLM_MODEL=gpt-4o-mini
```

也可以使用 Anthropic、Gemini、Groq、Ollama、LM Studio、Vertex AI、MiniMax、DeepSeek 等 provider。完整变量和注释以 [.env.example](./.env.example) 为准，详细说明见 [`docs/zh-CN/configuration.md`](./docs/zh-CN/configuration.md)。

### 3. 启动 API 和管理控制台

```bash
./scripts/dev/start.sh
```

启动成功后：

- API：<http://localhost:8888>
- API 文档：<http://localhost:8888/docs>
- Control Plane 管理控制台：<http://localhost:9999>

脚本会先等待 API 的 `/health` 检查通过，再启动控制台。按 `Ctrl+C` 会同时停止两个服务。

端口冲突时，可以在 `.env` 中设置：

```dotenv
HINDSIGHT_API_PORT=8888
HINDSIGHT_CP_PORT=9999
```

或者临时使用随机端口：

```bash
./scripts/dev/start.sh --random-port
```

## 验证服务

```bash
curl -fsS http://localhost:8888/health
```

能返回成功响应，说明 API 已经启动。若控制台无法访问，先确认 API 已就绪，并查看启动终端中 Next.js 的错误信息。

## 连接 API

安装 Python 客户端：

```bash
pip install -U hindsight-client
```

最小 Python 示例：

```python
from hindsight_client import Hindsight

client = Hindsight(base_url="http://localhost:8888")

client.retain(
    bank_id="my-bank",
    content="Alice works at Google as a software engineer",
)

memories = client.recall(
    bank_id="my-bank",
    query="Where does Alice work?",
)

answer = client.reflect(
    bank_id="my-bank",
    query="Tell me about Alice",
)
```

Node.js/TypeScript 客户端：

```bash
npm install @vectorize-io/hindsight-client
```

```javascript
const { HindsightClient } = require("@vectorize-io/hindsight-client");

const client = new HindsightClient({ baseUrl: "http://localhost:8888" });
await client.retain("my-bank", "Alice likes hiking in Yosemite");
const results = await client.recall("my-bank", "What does Alice like?");
console.log(results);
```

## 核心概念

- **Retain（写入）**：接收文本或结构化内容，提取事实、实体和关系并保存到 memory bank。
- **Recall（召回）**：结合语义、关键词、图关系和时间等策略检索相关记忆。
- **Reflect（反思）**：结合召回结果、任务目标、指令和 disposition 生成回答。
- **Memory bank（记忆库）**：隔离不同用户、Agent、项目或租户的数据和配置。
- **Observation（观察）**：基于多条记忆形成的、带证据的综合判断。
- **Mental model（心智模型）**：对常见问题或领域知识的进一步归纳。

服务同时提供 MCP endpoint，可供 MCP 客户端接入：

```text
http://localhost:8888/mcp/<bank_id>/
```

## 部署方式

### Docker（最简单）

```bash
export OPENAI_API_KEY=sk-xxx

docker run -it --pull always --name hindsight --restart unless-stopped \
  --shm-size=1g -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_API_KEY="$OPENAI_API_KEY" \
  -v hindsight-data:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest
```

### API 单独启动

```bash
./scripts/dev/start-api.sh
```

只启动控制台：

```bash
./scripts/dev/start-control-plane.sh
```

只启动独立 Worker：

```bash
./scripts/dev/start-worker.sh
```

### 外部 PostgreSQL / Kubernetes / 生产部署

这些场景涉及数据库、反向代理、持久化、worker 身份和资源规划，请先阅读 [`docs/zh-CN/installation.md`](./docs/zh-CN/installation.md)，不要直接把嵌入式 pg0 当作生产数据库。

## 中文文档

- [启动与部署](./docs/zh-CN/installation.md)：本地、Docker、外部 PostgreSQL、端口、停止和排障。
- [配置说明](./docs/zh-CN/configuration.md)：LLM、数据库、embedding、reranker、worker 和反向代理配置。
- [API 快速开始](./docs/zh-CN/api-quickstart.md)：Retain、Recall、Reflect 和客户端调用。
- [开发与维护](./docs/zh-CN/development.md)：仓库初始化、代码结构、测试、lint 和代码生成。

## 开发与贡献

```bash
# 完整初始化
./scripts/dev/setup.sh

# 本地启动 API + 控制台
./scripts/dev/start.sh

# 启动文档站
./scripts/dev/start-docs.sh
```

提交代码前请遵循 [CLAUDE.md](./CLAUDE.md) 和项目现有约定。许可证为 MIT，详见 [LICENSE](./LICENSE)。
