**rate limits por API key**

- Requests / min: 60 rpm
- Paralelo máximo: 5 concurrentes

**glm5.2 · premium tier limits**

- Rolling 4h window: 400M tokens
- Allowance / billing period: 3,000M tokens
- Context window: 500K tokens
- Concurrent requests: 5

400M tokens per rolling 4 hours is the limit a heavy coding-agent run reaches first, well before the allowance. Once you hit it, glm5.2 requests are rejected until the window slides forward: it is a rolling window, not a daily reset. The allowance counter goes back to zero when your billing period starts, and if you upgrade part-way into a period that first allowance is prorated to the share of the period you paid for.

**tokens / min por modelo**

- deepseek-v4-flash: 1.5M tpm
- mimo-v2.5: 1.5M tpm
- qwen3.6: 1.5M tpm
- gemma4: 1.5M tpm

**requests / min por modelo**

- rerank: 1000 rpm