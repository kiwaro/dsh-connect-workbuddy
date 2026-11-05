# WorkBuddy 缓存字段记录

原测量日期为2026-09-22，版本2.0.4，并在2.0.5复核。2026-10-01的3.3.0复核补充了DSML响应处理后的usage保留规则。测量使用国内版账号。

## 1. 统计处理过程

WorkBuddy将缓存读取数放在 `prompt_tokens_details.cached_tokens`，也提供 `prompt_cache_hit_tokens`。所测pi-ai解析器按顺序读取这些字段，并计算未缓存输入：

```text
input = max(0, prompt_tokens - cacheRead - cacheWrite)
total = input + output + cacheRead + cacheWrite
```

DSH 将非零缓存读取计数写入usage。`model.cost` 的价格设置和token计数分别处理。

## 2. 连续请求

第一轮发送前缀，后两轮发送相同前缀加后缀：

```text
turn 1: input=8002 cacheRead=0    cacheWrite=0 output=16
turn 2: input=136  cacheRead=7872 cacheWrite=0 output=16
turn 3: input=72   cacheRead=7936 cacheWrite=0 output=16
```

第三轮 `prompt_tokens=8008`，缓存读取7936、未缓存72，两者相加等于输入总数。该轮命中率约99%。

原响应同时包含 `prompt_tokens_details.cached_tokens: 7936` 和 `prompt_cache_hit_tokens: 7936`。其他命名的缓存字段为零时，需要按所用解析器的字段优先级判断。

## 3. 流式usage

原请求链通过 `stream_options.include_usage` 请求usage，计数通常在流末。检查脚本需要读取流末事件。

3.3.0后的 `RecoveryStream` 可处理 `delta.content` 和恢复所得 `delta.tool_calls`。usage及未知字段按对应转发分支保留，验证重点是处理前后的计数与字段一致。

## 4. 复查脚本

```sh
node scripts/probe-cache-convention.mjs
node scripts/probe-cache-convention.mjs --turns 4
```

脚本会发送请求并按所用模型扣费。输出仅保留usage计数及字段名称，材料共享前检查敏感内容。

## 5. 结果解释

缓存复用需要相同前缀。账号、模型、system内容和历史编辑均需要纳入对照条件。首次冷请求可能为零，重复执行时前缀也可能已经预热。

原测量中的缓存写入字段均为零。国际版缓存计数需要在对应区域独立复查，其他模型与后续版本按其响应记录判断。

参考对照为 `dingminhua/dsh-connect-trae` issue #10。完整处理逻辑见 `src/adapter.ts`、`src/shim.ts` 和 `src/upstream.ts`。
