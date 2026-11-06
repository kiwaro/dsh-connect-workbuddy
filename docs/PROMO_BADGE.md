# 模型活动标记

插件从 WorkBuddy 模型目录读取促销和账号等级信息。显示模型列表时，插件根据当前时间和活动条件选择标记。解析与选择规则位于 `src/promo.ts`，目录读取位于 `src/upstream.ts`。

## 1. 数据来源

产品配置的 `data` 对象中，`models` 提供模型，`modelPromotions` 提供促销，`modelTiers` 提供等级信息。插件在读取目录时同时取得这些字段。

产品配置根据客户端标识返回不同内容。插件使用产品配置接口所需的 User-Agent；聊天请求采用聊天接口的请求头配置。具体字段由各请求头构造函数生成。

目录选择还考虑用户已经勾选的模型：模型仍在产品配置中时，可保留在选择列表；从配置中移除的模型按目录更新结果处理。

## 2. 条目解析

活动条目至少需要 `modelIds` 和 `badge`，`enabled: false` 的条目过滤掉。目录中混入的图片或视频模型条目按各自模型用途处理。

| 字段 | 用途 |
| --- | --- |
| `id` | 活动标识 |
| `modelIds` | 适用模型 |
| `badge` | 标签文字、颜色及显示规则 |
| `priority` | 候选活动的排序值 |
| `discount` | 折扣信息 |
| `hover` | 悬停说明及上游提供的动作信息 |
| `schedule` | 活动日期、时区和每日时段 |

语言文字来自上游的 `label`、`labelEn`、`textZh` 和 `textEn`。颜色仅接受 `#rgb` 或 `#rrggbb`。界面使用 CSS 绘制标记，悬停说明显示有效期及每日时段。

## 3. 时间判断

| 情况 | 判定规则 |
| --- | --- |
| `validFrom`、`validUntil` | 起点包含，终点排除 |
| 每日时段 | 按所声明时区计算，起点包含，终点排除 |
| 终点早于起点 | 时段跨越零点 |
| 起点与终点相等 | 按全天处理 |
| `24:00` | 表示当天末尾，即第 1440 分钟 |
| 缺少每日时段或为空数组 | 每日全天，仍受绝对日期约束 |
| 提供每日时段但全部解析失败 | 设置 `dailyUnusable`，该条目保持未生效 |

缺少时区时使用 UTC；时区无效时，当前实现将用于判断的分钟数设为 0。这不等于按 UTC 计算，排查异常标记时需要检查原始时区字段。

解析器保留模型的所有候选活动。显示时使用当前时间重新判断，以处理夜间折扣与白天常驻标签之间的切换。设置页展开时每 60 秒刷新，界面状态随刷新重新计算。

## 4. 标记选择

每个模型显示一个标记，按以下顺序选择：

1. 从带时间规则且当前生效的条目中，选择 `priority` 最高者。
2. 缺少生效条目时，从符合日期及显示条件的常驻条目中选择。
3. 优先级相同时，促销条目排在等级条目前。

常驻条目仍受绝对有效期约束。`display: activeOnly` 的条目仅在生效期间显示。活动的 `hover.action` 保留为上游信息，界面通过悬停展示内容。

修改规则后运行 `tests/promo.spec.ts`。时间用例检查时区及跨零点等规则，选择用例检查活动与等级标记的优先级。

## 5. 历史测量：2026-10-21

测量版本为 4.13.1，提交 `2c1626b`。下表记录当时不同请求头所取得的目录，数据用于说明客户端标识对配置的影响。

| 区域 | 端点 | 客户端 User-Agent | 结果 |
| --- | --- | --- | --- |
| 国内区 | `GET https://copilot.tencent.com/v3/config` | `WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0` | 22 个键，`modelPromotions` 8 条、`modelTiers` 1 条、`models` 62 条 |
| 国内区 | `GET https://www.workbuddy.cn/v3/config` | 同上 | 同一 User-Agent；该次桌面端记录也使用此地址 |
| 国内区 | `GET https://www.codebuddy.cn/v3/config` | 同上 | 同上 |
| 国内区 | `GET https://copilot.tencent.com/v3/config` | `CLI/2.63.2 CodeBuddy/2.63.2` | 5 个键，35 个模型，两个活动数组都没有 |
| 国际区 | `GET https://www.workbuddy.ai/v3/config` | App 身份 | 17 个键，`modelPromotions` 5 条、`modelTiers` 1 条、`models` 28 条 |
| 国际区 | `GET https://www.codebuddy.ai/v3/config` | App 身份 | 同一份国际版产品配置 |

同一轮国内版对照还记录了以下差异：

| User-Agent | 国内区 `/v3/config` 的答案 |
| --- | --- |
| `CLI/2.63.2 CodeBuddy/2.63.2`（纯 CLI 身份，插件此前用的） | 5 个键、35 个模型、无 `modelPromotions` / `modelTiers` |
| `WorkBuddy/5.8.3`（App 身份，缺 CLI 段） | 18 个键、37 个模型、无活动数组 |
| `WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0`（App 的真实身份） | 22 个键、62 个模型、8 条促销 + 1 条等级标记 |

当时多个国内版主机在相同身份下返回相同内容。App 与 CLI 名单有 `auto` 和 `minimax-m2.7` 的差异，其余对照模型同名同价。`auto` 的旧测量解析为 `hy4-preview`；现有模型筛选规则还需结合源码中的路由模型处理。

### 5.1 活动样本

| id | 标签 | 模型 | 时段/生命周期 |
| --- | --- | --- | --- |
| `glm-52-night-discount-202607` | 夜间折扣 | `glm-5.2` | 每日 23:00 → 次日 7:50 |
| `glm-52-night-discount-daytime-badge-202607` | 夜间折扣 | `glm-5.2` | 每日 7:50 → 23:00（常驻徽标） |
| `hy3-free-trial-202608` | 限时免费 | `hy3`（+`hy3-b`/`hy3-c`） | 07-06 → 11-01，`display: activeOnly` |
| `hy4-night-discount-badge-202609` | 夜间免费 | `hy4-preview`（+ctrl/exp） | 每日 23:00 → 次日 8:00 |
| `hy4-night-discount-daytime-badge-202609` | 夜间免费 | 同上 | 每日 0:00 → 8:00 与 23:00 → 23:59 |
| `ds-discount-daytime-badge-202608` | 夜间折扣 | `deepseek-v4.1-flash`、`deepseek-v4-pro`（+ioa 变体） | 每日 0:00 → 23:59 |
| `space-bunny-discount-202610` | 限时折扣 | `space-bunny` | 10-02 → 10-08（在该次测量时已过期） |
| `step-5-discount-daytime-badge-202610` | 独家限免 | `step-5-preview` | 10-12 → 10-26 |
| `tier-standard-2026q3` | 订阅优先，等级标记 | `glm-5.3`、`glm-5.3-flash`、`kimi-k2.8-preview` | 全天 |

这些活动时间属于历史样本。原记录中有 10 个模型关联标记条目，是否显示仍取决于对应日期和时段。

### 5.2 样本字段

以下 JSON 保留原记录中的字段示例：

```jsonc
{
  "id": "hy3-free-trial-202608",
  "kind": "discount",
  "enabled": true,
  "priority": 200,
  "modelIds": ["hy3"],
  "badge": { "label": "限时免费", "color": "#009273", "display": "activeOnly",
             "icon": "data:image/svg+xml;base64,…" },
  "discount": { "discountedCredits": "0x", "displayMode": "replace", "factor": 0 },
  "hover": {
    "textZh": "7月6日–10月31日，每日赠送免费额度。",
    "action": { "labelZh": "去使用", "type": "selectModel" }
  },
  "schedule": {
    "timezone": "Asia/Shanghai",
    "validFrom": "2026-07-06T00:00:00+08:00",
    "validUntil": "2026-11-01T00:00:00+08:00"
  }
}
```

等级条目的样本提供 `requiredUserType`、`tier`、`trackKey` 及升级动作信息，可使用英文或中文标签。它通常缺少折扣和每日时段，参与常驻候选的选择。

### 5.3 测量材料

原记录使用产品配置 GET 请求和字段对照。桌面端材料包括 `buildVlmGatewayHeaders`、`~/.workbuddy/logs/main.log`、`~/.workbuddy/cache/acc-product-config-v3.json` 及用户存储中的产品配置文件。

当时的临时脚本包括 `wb-cn-isolate.mjs`、`wb-cn-ua-roster.mjs`、`wb-cn-compare-models.mjs`、`wb-cn-chat-auto.mjs`、`wb-global-isolate.mjs`、`wb-ua-parity.mjs`、`wb-e2e-badges.mjs` 和 `wb-asar-scan.mjs`，记录位置为当时的临时目录。复查时需要确认材料是否仍然存在。
