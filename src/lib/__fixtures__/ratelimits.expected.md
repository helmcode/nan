**rate limits per API key**

- Requests / min: 60 rpm
- Concurrent requests: per model — see the per-model limits below

**concurrent requests per model**

- glm5.3: 7 (base plan) · 10 (premium plan)
- glm5.3-flash: 7 (base plan) · 10 (premium plan)
- deepseek-v4-flash: 7 (base plan) · 10 (premium plan)
- qwen3.8-flash: 7 (base plan) · 10 (premium plan)
- mimo-v2.5: 5
- qwen3.6: 5
- gemma4: 5

Audio, embedding and rerank endpoints have no concurrency limit.

**glm5.3 · premium tier limits**

- Rolling 4h window: 400M tokens
- Allowance / billing period: 3,000M tokens
- Context window: 1M tokens
- Concurrent requests: 10

400M tokens per rolling 4 hours is the limit a heavy coding-agent run reaches first, well before the allowance. Once you hit it, glm5.3 requests are rejected until the window slides forward: it is a rolling window, not a daily reset. The allowance counter goes back to zero when your billing period starts, and if you upgrade part-way into a period that first allowance is prorated to the share of the period you paid for.

**tokens / min per model**

- deepseek-v4-flash: 1.5M tpm
- mimo-v2.5: 1.5M tpm
- qwen3.6: 1.5M tpm
- gemma4: 1.5M tpm

**requests / min per model**

- rerank: 1000 rpm