# 配置说明

完整配置模板请直接查看仓库根目录的 [.env.example](../../.env.example)。本文只列出启动服务最常用、最容易出错的配置。

## 最小配置

```dotenv
HINDSIGHT_API_LLM_PROVIDER=openai
HINDSIGHT_API_LLM_API_KEY=替换为你的_API_Key
HINDSIGHT_API_LLM_MODEL=gpt-4o-mini
```

API 启动时会读取仓库根目录 `.env`。不要把真实密钥提交到 Git。

## 常用变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `HINDSIGHT_API_LLM_PROVIDER` | LLM provider，如 `openai`、`anthropic`、`gemini`、`groq`、`ollama` | `openai` |
| `HINDSIGHT_API_LLM_API_KEY` | LLM API key；本地或订阅型 provider 可能不需要 | 无 |
| `HINDSIGHT_API_LLM_MODEL` | 使用的模型名称 | `gpt-4o-mini` |
| `HINDSIGHT_API_LLM_BASE_URL` | OpenAI-compatible 服务或代理的 base URL | provider 默认值 |
| `HINDSIGHT_API_PORT` | API 监听端口 | `8888` |
| `HINDSIGHT_CP_PORT` | Control Plane 端口 | `9999` |
| `HINDSIGHT_API_DATABASE_URL` | 外部 PostgreSQL 连接串；不设置则使用 pg0 | pg0 |
| `HINDSIGHT_API_EMBEDDINGS_PROVIDER` | embedding provider，常用 `local`、`onnx`、`tei` | `local` |
| `HINDSIGHT_API_RERANKER_PROVIDER` | reranker provider，常用 `local`、`tei` | `local` |
| `HINDSIGHT_API_WORKER_ID` | Worker 稳定身份；生产环境建议显式设置 | 容器 hostname |
| `HINDSIGHT_API_BASE_PATH` | API 反向代理路径前缀 | 空 |
| `NEXT_PUBLIC_BASE_PATH` | 控制台对应的路径前缀 | 空 |

## LLM provider

### OpenAI-compatible

```dotenv
HINDSIGHT_API_LLM_PROVIDER=openai
HINDSIGHT_API_LLM_API_KEY=你的密钥
HINDSIGHT_API_LLM_MODEL=gpt-4o-mini
# HINDSIGHT_API_LLM_BASE_URL=https://api.openai.com/v1
```

### 本地 Ollama / LM Studio

```dotenv
HINDSIGHT_API_LLM_PROVIDER=ollama
HINDSIGHT_API_LLM_MODEL=gemma3:12b
# HINDSIGHT_API_LLM_BASE_URL=http://localhost:11434/v1
```

具体 provider、推理强度、结构化输出和多模型路由配置，以 `.env.example` 和英文模型文档为准。

## 数据库

开发环境可直接使用默认 pg0。需要外部 PostgreSQL 时：

```dotenv
HINDSIGHT_API_DATABASE_URL=postgresql://用户名:密码@主机:5432/数据库名
```

生产环境还应规划备份、连接池、磁盘容量、向量扩展和迁移策略。API 启动时会自动执行数据库迁移；不要在多个不兼容版本之间直接复用生产数据目录。

## Embedding 和 Reranker

本地 provider 最省配置，但会下载模型并占用内存：

```dotenv
HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
HINDSIGHT_API_RERANKER_PROVIDER=local
```

需要把模型独立部署时，可改用 TEI 等远程 provider，并设置对应 URL 和 provider-specific credentials。slim 包不自带完整本地模型，适合将 embedding/reranker 外置。

## 反向代理和多实例

如果部署在 `https://example.com/hindsight/`：

```dotenv
HINDSIGHT_API_BASE_PATH=/hindsight
NEXT_PUBLIC_BASE_PATH=/hindsight
```

Docker 或多实例部署建议设置稳定的 Worker ID：

```dotenv
HINDSIGHT_API_WORKER_ID=hindsight-prod
```

否则容器 hostname 变化后，异常退出前认领的任务可能停留在旧 Worker 身份下。

## 配置检查清单

- [ ] `.env` 已创建，真实密钥未提交；
- [ ] LLM provider、model、base URL 和 key 相互匹配；
- [ ] `/health` 已返回成功；
- [ ] 生产环境已改用外部 PostgreSQL 并规划备份；
- [ ] 本地模型下载、远程 embedding/reranker URL 均已验证；
- [ ] 多实例环境设置了稳定的 `HINDSIGHT_API_WORKER_ID`；
- [ ] 反向代理路径同时配置 API 和 UI 的 base path。
