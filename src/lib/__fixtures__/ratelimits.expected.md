**rate limits per API key**

- Requests / min: 60 rpm
- Max parallel: 5 concurrent

**glm5.3 · premium tier limits**

- Rolling 4h window: 400M tokens
- Allowance / billing period: 3,000M tokens
- Context window: 1M tokens
- Tokens / min: 11M tpm
- Concurrent requests: 5

400M tokens per rolling 4 hours is the limit a heavy coding-agent run reaches first, well before the allowance. Once you hit it, glm5.3 requests are rejected until the window slides forward: it is a rolling window, not a daily reset. The allowance counter goes back to zero when your billing period starts, and if you upgrade part-way into a period that first allowance is prorated to the share of the period you paid for.

**tokens / min per model**

- deepseek-v4-flash: 6M tpm
- qwen3.8-flash: 6M tpm
- glm5.3-flash: 11M tpm
- mimo-v2.5: 4M tpm
- qwen3.6: 3M tpm
- gemma4: 1M tpm

**no per-minute limit of their own**

- qwen3-embedding
- rerank
- kokoro
- whisper

The limit you feel is always the strictest of the ones that apply to you: your key's, the model's and the endpoint's. The key's 60 per minute and 5 at once count every call you make, so a model with a higher ceiling of its own does not raise them, and an endpoint with no ceiling of its own still spends the key's.