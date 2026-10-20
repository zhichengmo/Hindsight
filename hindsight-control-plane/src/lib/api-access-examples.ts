// Illustrative native API contracts, not data fetched from a user's bank.
// Keep paths aligned with the existing ms-pet HTTP client; do not introduce a
// parallel query/body API to replace the upstream bank-scoped routes.
export function apiAccessExamples(apiBaseUrl: string) {
  const bank = "/v1/default/banks/example-bank";
  const operationId = "550e8400-e29b-41d4-a716-446655440000";
  return [
    {
      id: "bank",
      method: "PUT",
      path: bank,
      body: {},
      response: { bank_id: "example-bank", name: "example-bank" },
    },
    {
      id: "configRead",
      method: "GET",
      path: `${bank}/config`,
      response: {
        bank_id: "example-bank",
        config: { retain_mission: "Preserve source and uncertainty." },
        overrides: {},
      },
    },
    {
      id: "configWrite",
      method: "PATCH",
      path: `${bank}/config`,
      body: { updates: { retain_mission: "Preserve source and uncertainty." } },
      response: {
        bank_id: "example-bank",
        config: { retain_mission: "Preserve source and uncertainty." },
        overrides: { retain_mission: "Preserve source and uncertainty." },
      },
    },
    {
      id: "retain",
      method: "POST",
      path: `${bank}/memories`,
      body: {
        async: true,
        operation_id: operationId,
        items: [
          {
            document_id: "example-document",
            update_mode: "replace",
            timestamp: "2026-10-20T02:00:00Z",
            content: "Example source statement.",
            context: "Example source context.",
            metadata: { source_system: "example", session_id: "example-session" },
          },
        ],
      },
      response: {
        success: true,
        bank_id: "example-bank",
        items_count: 1,
        async: true,
        operation_id: operationId,
      },
    },
    {
      id: "operation",
      method: "GET",
      path: `${bank}/operations/${operationId}`,
      response: { operation_id: operationId, status: "completed", operation_type: "batch_retain" },
    },
    {
      id: "recall",
      method: "POST",
      path: `${bank}/memories/recall`,
      body: {
        query: "Example query",
        types: ["world", "experience"],
        budget: "low",
        max_tokens: 1024,
      },
      response: {
        results: [
          {
            id: "660e8400-e29b-41d4-a716-446655440000",
            text: "Example source statement.",
            type: "world",
            document_id: "example-document",
            metadata: { source_system: "example", session_id: "example-session" },
          },
        ],
      },
    },
    {
      id: "documentRead",
      method: "GET",
      path: `${bank}/documents/example-document`,
      response: {
        id: "example-document",
        bank_id: "example-bank",
        original_text: "Example source statement.",
        memory_unit_count: 1,
      },
    },
    {
      id: "documentDelete",
      method: "DELETE",
      path: `${bank}/documents/example-document`,
      response: { success: true, document_id: "example-document", memory_units_deleted: 1 },
    },
    {
      id: "verifyDelete",
      method: "GET",
      path: `${bank}/memories/list?document_id=example-document&limit=1`,
      response: { items: [], total: 0, limit: 1, offset: 0 },
    },
  ].map((example) => ({
    ...example,
    request: `${example.method} ${apiBaseUrl}${example.path}\nAuthorization: Bearer <YOUR_API_KEY>${"body" in example ? `\nContent-Type: application/json\n\n${JSON.stringify(example.body, null, 2)}` : ""}`,
  }));
}
