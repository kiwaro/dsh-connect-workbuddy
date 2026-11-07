# 国内版网关备选地址

`regions.cn.cnBase` 用于选择国内版请求使用的网关。留空时，插件使用 `https://copilot.tencent.com`。当前网络无法连接默认网关时，可以填写其他允许的 HTTPS 地址。

## 1. 问题来源与验证范围

issue #220 的报告者遇到企业网络连接重置：TCP 可以连接，但发送特定 TLS SNI 后收到 RST，错误为 `ECONNRESET`，耗时小于 100ms。受影响的主机包括 `copilot.tencent.com`、`www.workbuddy.cn` 和 `www.codebuddy.cn`。同机 WorkBuddy 桌面端仍可使用，其 `~/.workbuddy/failover.json` 中的 `trustedOrigins` 包含 `wb.tencentbuddy.com`。

这是该报告中的网络现象。连接快速失败本身不足以判断其他网络也存在同一问题。按报告中的拦截方式，修改 hosts 无法改变 TLS SNI，因此插件增加了网关地址设置。

上游维护者于 2026-11-06 在 macOS 的非受限网络中比较了以下路由。此处保留当时的结果，未将其作为本次重新实测的结果。

| 路由 | copilot.tencent.com | wb.tencentbuddy.com |
| --- | --- | --- |
| `GET /v3/config` | 200（252B） | 200（252B，同信封） |
| `POST /v2/chat/completions` | 401 | 401 |
| `POST /v2/chat/busy` | 400 | 400 |
| `POST /v2/plugin/auth/token/refresh` | 400 | 400 |
| `GET /v2/plugin/auth/token` | 200 | 200 |
| `POST /v2/billing/meter/get-user-resource` | 401 | 401 |
| `POST /v2/billing/meter/checkin-activity-status` | 401 | 401 |
| `POST /v2/billing/meter/daily-checkin` | 401 | 401 |
| `POST /billing/meter/compensation-status` | 401 | 401 |

当时四个主机的 `/v3/config` 均返回相同的 252 字节信封：`wb.tencentbuddy.com`、`copilot.tencent.com`、`www.codebuddy.cn`、`www.workbuddy.cn`。桌面端配置中的备选地址也支持增加此设置。

这些结果证明上述主机在当次检查中返回了对应路由的响应；其中的 401 和 400 不能证明登录后的全部操作已成功。受限网络中备选地址可用的结果来自报告者，上游维护者未复现该网络环境。

## 2. 地址校验

`src/cn-gateway.ts` 的 `resolveCnGateway` 统一校验设置值。地址必须使用 HTTPS，主机名必须等于下列域名之一，或以点号分隔的子域名形式属于其中之一：

- `copilot.tencent.com`
- `tencentbuddy.com`
- `workbuddy.cn`
- `codebuddy.cn`

例如，`wb.tencentbuddy.com` 可用；`tencentbuddy.com.evil.example` 不符合规则。实现使用完整主机名相等或 `'.' + domain` 后缀匹配，避免放行名称相似的其他域名。

解析后仅保留小写主机名并添加 `https://`。输入中的端口、用户信息、路径、查询和锚点均不保留。

国内版请求包含访问凭据，刷新接口还会发送刷新凭据。因此，允许用户填写任意服务器地址可能导致凭据被发送到第三方服务器。允许域名清单用于限制凭据的发送目标，新增域名时需核对实际服务用途。相关测试见 `tests/cn-gateway.spec.ts`。

## 3. 生效范围

保存后，国内版的聊天、模型目录、繁忙状态查询、生图、生视频、签到、积分和权益领取请求使用所选网关。账号和计费区域保持不变。

`Origin` 和 `Referer` 继续使用国内版网页端地址。这两个请求头用于标明网页应用来源，网关地址用于确定连接目标，两者由不同规则生成。

国际版不使用此设置。国际版凭据与对应品牌网关绑定，国内版备选地址不能用于替换国际版网关。

## 4. 插件与诊断命令

| 使用场景 | 配置来源 |
| --- | --- |
| 卡片「能力」栏保存网关 | `regions.cn.cnBase` |
| 插件发送国内版请求 | 每次请求读取 `regions.cn.cnBase` |
| `doctor` 诊断命令 | `WORKBUDDY_CN_BASE` 环境变量 |

`doctor` 运行在独立进程中，不加载插件设置。使用备选网关排查连接时，需为诊断命令设置对应的 `WORKBUDDY_CN_BASE`，使检查目标与插件一致。三个入口均调用 `resolveCnGateway` 校验地址。

插件通过 `cnBase?: () => string` 读取器获取当前值，每次发送请求时重新读取。因此，在卡片保存有效地址后，后续请求立即使用新地址，无需重启插件。

## 5. 无效配置的处理

卡片拒绝保存无效地址，并分别提示地址格式、HTTPS 协议或域名不符合要求。

若配置文件中已有无效值，请求层会记录警告并恢复使用默认网关，以保留聊天功能。同一个无效值只警告一次，避免每次请求重复写入日志。

诊断栏显示解析后实际生效的网关。配置值校验失败时，诊断栏显示默认网关，便于核对实际请求目标。
