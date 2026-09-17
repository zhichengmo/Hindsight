# 开发与维护

## 初始化

```bash
./scripts/dev/setup.sh
```

脚本会初始化 Python、Node/npm、Rust/cargo 工具链，执行 `uv sync` 和 npm workspace 安装，并构建 TypeScript client 与 CLI。需要文档构建时：

```bash
./scripts/dev/setup.sh --with-docs
```

常用选项：

- `--skip-build`：只安装依赖，不构建 CLI/SDK；
- `--skip-models`：不预下载本地 embedding/reranker；
- `--force`：重新构建已有产物。

## 启动开发服务

```bash
./scripts/dev/start.sh
```

只启动 API：

```bash
./scripts/dev/start-api.sh
```

启动文档站：

```bash
./scripts/dev/start-docs.sh
```

## 主要目录

- `hindsight-api-slim/hindsight_api/engine/`：retain、recall、reflect 和检索引擎；
- `hindsight-api-slim/hindsight_api/api/`：FastAPI HTTP 路由和 MCP；
- `hindsight-api-slim/hindsight_api/alembic/`：数据库迁移；
- `hindsight-control-plane/`：Next.js 控制台；
- `hindsight-clients/`：生成的客户端；
- `hindsight-integrations/`：集成包；
- `hindsight-docs/`：Docusaurus 文档站。

## 测试、格式化和类型检查

修改 Python 后：

```bash
cd hindsight-api-slim
uv run pytest tests/
uv run ruff check .
uv run ruff format .
uv run ty check hindsight_api/
```

控制台测试：

```bash
npm run test -w @vectorize-io/hindsight-control-plane
```

仓库约定要求实现完成后运行 lint 和 code review；详细规范见 [CLAUDE.md](../../CLAUDE.md) 及 `.claude/skills/code-review/SKILL.md`。

## OpenAPI 和客户端生成

修改 API 路由或 schema 后：

```bash
./scripts/generate-openapi.sh
./scripts/generate-clients.sh
```

不要手工编辑生成文件；先修改源代码，再重新生成并检查 diff。

## 数据库迁移注意事项

迁移文件位于 `hindsight-api-slim/hindsight_api/alembic/versions/`。项目同时支持 PostgreSQL 和 Oracle 23ai；新增迁移时必须按项目约定通过 dialect dispatcher 分发，不能只实现单一数据库路径后假设另一数据库兼容。

## 常见维护原则

- 不要把工程测试通过当作模型医疗、事实或业务准确性证明；
- 不要提交 API key、OAuth token、数据库密码等凭证；
- 变更 prompt、模型、配置或 API schema 后，保留可追溯的版本和验证证据；
- 生产环境优先使用外部 PostgreSQL、稳定 Worker ID、监控和备份；
- 代码改动前后遵循仓库现有分层和生成文件约定。
