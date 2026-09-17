# API 快速开始

默认 API 地址为 `http://localhost:8888`，Swagger 文档为 `http://localhost:8888/docs`。

## 安装客户端

```bash
pip install -U hindsight-client
npm install @vectorize-io/hindsight-client
go get github.com/vectorize-io/hindsight/hindsight-clients/go
```

## Python

```python
from hindsight_client import Hindsight

client = Hindsight(base_url="http://localhost:8888")
bank_id = "my-bank"

# Retain：写入记忆
client.retain(
    bank_id=bank_id,
    content="Alice works at Google as a software engineer",
    context="career update",
)

# Recall：检索记忆
memories = client.recall(
    bank_id=bank_id,
    query="Where does Alice work?",
)
print(memories)

# Reflect：基于记忆生成回答
answer = client.reflect(
    bank_id=bank_id,
    query="Tell me about Alice",
)
print(answer)
```

## Node.js / TypeScript

```javascript
const { HindsightClient } = require("@vectorize-io/hindsight-client");

async function main() {
  const client = new HindsightClient({ baseUrl: "http://localhost:8888" });

  await client.retain("my-bank", "Alice likes hiking in Yosemite");
  const results = await client.recall("my-bank", "What does Alice like?");
  console.log(results);
}

main();
```

## 三个核心操作

| 操作 | 用途 |
| --- | --- |
| `retain` | 写入原始内容并提取事实、实体和关系 |
| `recall` | 按问题召回相关记忆 |
| `reflect` | 让 LLM 结合记忆生成回答 |

`retain`、consolidation 等任务可能异步执行。生产调用应记录返回的 operation 信息，并通过 operations API 或控制台观察状态，不要仅凭 HTTP 请求已返回就认定所有记忆处理完毕。

## curl 验证服务

```bash
curl -fsS http://localhost:8888/health
```

API 的具体请求体、认证方式、分页字段和响应结构以本地 Swagger/OpenAPI 为准：

```text
http://localhost:8888/docs
```

## MCP

每个 memory bank 有独立的 MCP endpoint：

```text
http://localhost:8888/mcp/<bank_id>/
```

将该地址配置到 MCP 客户端后，可将 retain、recall、reflect 作为工具暴露给 Agent。生产环境请结合反向代理和认证配置，不要直接把无保护的本地地址暴露到公网。
