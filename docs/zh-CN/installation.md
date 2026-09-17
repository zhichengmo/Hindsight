# 启动与部署

本文档说明如何启动当前仓库中的 Hindsight API、Control Plane 和可选的独立 Worker。

## 一、前置条件

- Python 3.11+；
- `uv`；
- Node.js 20+ 和 npm；
- Rust/cargo（仅在需要构建 CLI 时必需）；
- Docker（Docker 部署或本地使用外部 PostgreSQL 时必需）；
- 一个支持结构化输出的 LLM provider 和对应凭证。

默认情况下，API 使用本地 pg0 作为嵌入式 PostgreSQL，并使用本地 embedding/reranker provider。首次运行可能下载模型。

## 二、本地开发启动（推荐）

在仓库根目录执行：

```bash
./scripts/dev/setup.sh
cp .env.example .env
```

编辑 `.env`，至少填写：

```dotenv
HINDSIGHT_API_LLM_PROVIDER=openai
HINDSIGHT_API_LLM_API_KEY=替换为你的_API_Key
HINDSIGHT_API_LLM_MODEL=gpt-4o-mini
```

启动 API 和 UI：

```bash
./scripts/dev/start.sh
```

服务地址：

| 服务 | 默认地址 |
| --- | --- |
| API | `http://localhost:8888` |
| Swagger/OpenAPI | `http://localhost:8888/docs` |
| 健康检查 | `http://localhost:8888/health` |
| Control Plane | `http://localhost:9999` |

`start.sh` 会从 `.env` 读取配置，启动 API，轮询 `/health`，确认 API 就绪后再启动 Next.js 控制台。按 `Ctrl+C` 可同时停止两个进程。

### 端口配置

```dotenv
HINDSIGHT_API_PORT=8888
HINDSIGHT_CP_PORT=9999
```

端口临时随机分配：

```bash
./scripts/dev/start.sh --random-port
```

### 分别启动

```bash
# 只启动 API
./scripts/dev/start-api.sh

# 只启动控制台；默认连接 http://localhost:8888
./scripts/dev/start-control-plane.sh

# 启动独立 Worker（需要 API 使用相同数据库和环境配置）
./scripts/dev/start-worker.sh

# 启动本地文档站
./scripts/dev/start-docs.sh
```

文档站默认地址为 `http://localhost:3000`。

## 三、Docker 启动

### 嵌入式 pg0

```bash
export OPENAI_API_KEY=sk-xxx

docker run -it --pull always --name hindsight --restart unless-stopped \
  --shm-size=1g -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_API_KEY="$OPENAI_API_KEY" \
  -v hindsight-data:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest
```

### 外部 PostgreSQL

仓库提供 Docker Compose 变体，适合需要独立 PostgreSQL 的场景：

```bash
export HINDSIGHT_API_LLM_API_KEY=你的_LLM_API_Key
export HINDSIGHT_DB_PASSWORD=设置一个数据库密码
docker compose -f docker/docker-compose/external-pg/docker-compose.yaml up -d
```

生产环境建议使用外部 PostgreSQL 14+，并配置 `pgvector`、`pgvectorscale`、`vchord` 或 AlloyDB ScaNN 等受支持的向量扩展。不要把未备份的 pg0 卷作为生产数据保护方案。

## 四、停止和清理

本地脚本前台运行时按 `Ctrl+C`。Docker 容器可执行：

```bash
docker stop hindsight
docker rm hindsight
```

数据卷 `hindsight-data` 不会因为删除容器自动删除。如需删除开发数据：

```bash
docker volume rm hindsight-data
```

## 五、启动排障

### `.env` 不存在

```bash
cp .env.example .env
```

`start-api.sh` 和 `start-worker.sh` 要求仓库根目录存在 `.env`。

### API 未就绪

依次检查：

```bash
curl -v http://localhost:8888/health
uv --version
uv run hindsight-api --help
```

确认 LLM provider、模型名和 API key 正确；如果使用本地 embedding/reranker，确认首次模型下载已经完成。

### uv 下载依赖超时

如果看到 `Failed to download`、`Failed to extract archive` 或提示当前超时为 `30s`，通常是依赖源网络读取超时，不是 `narwhals` 或项目代码本身的问题。先提高 uv 的 HTTP 读取超时并增加重试次数：

```bash
UV_HTTP_TIMEOUT=600 UV_HTTP_RETRIES=5 uv sync
```

依赖同步完成后，再继续执行：

```bash
./scripts/dev/setup.sh --skip-models
```

`UV_HTTP_TIMEOUT` 控制 HTTP 读取超时，`UV_HTTP_RETRIES` 控制 HTTP 请求重试次数；也可以将这两个变量写入当前 shell 环境后再运行 setup。若所在网络需要内部 PyPI 镜像，请改用组织提供的 index URL，而不要提交带凭证的配置文件。

### 端口被占用

修改 `.env` 中的 `HINDSIGHT_API_PORT` 或 `HINDSIGHT_CP_PORT`，或者运行：

```bash
./scripts/dev/start.sh --random-port
```

### 控制台无法访问 API

确认控制台使用的 dataplane 地址：

```bash
HINDSIGHT_CP_DATAPLANE_API_URL=http://localhost:8888 \
  ./scripts/dev/start-control-plane.sh
```

反向代理部署时，同时检查 API 的 `HINDSIGHT_API_BASE_PATH` 和控制台的 `NEXT_PUBLIC_BASE_PATH`。
