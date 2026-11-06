/**
 * 「真实值」档在这台机器上能不能真的工作，以及为什么不能。
 *
 * ## 为什么不让界面自己判断平台
 *
 * 客户端能拿到 `sdk.platform`，但**平台不是判据**。macOS 上 SDK 能被发现、
 * `probe` 也答 `ready`，真正坏掉的是取 token 那一环：SDK 向 dispatch 主队列
 * `dispatch_sync`，而纯 libuv 子进程永不排空那个队列（`sample` 栈实测，见
 * CHANGELOG 的「macOS 现状如实记录」）。于是「darwin → 禁用」会把一台**没装**
 * 桌面端的 mac 和一台装了的 mac 说成同一件事，而它们的用户该做的事完全不同。
 *
 * ## 为什么现在还写死
 *
 * 这是一个**已知的、非本平台的**缺陷，不是运行时可以测出来的：真去测就要起子进程
 * 等 15 秒超时，而这一页每次打开都会拉一次设置。写成常量意味着它是可以被人替换
 * 的显式声明，而不是散在三个组件里的 `if (platform === 'darwin')`。
 *
 * ⚠️ 修好 `dispatch_sync` 那条路之后，**这里必须跟着改**，否则界面会继续劝退一个
 * 已经能用的功能。修法不在本次范围（需要一个排空主队列的伴生原生模块）。
 *
 * `state`：
 *   - `available` —— 能取到 token，切成「真实值」就能用；
 *   - `broken` —— 这套 SDK 在本平台取不到 token，选择后也无法取得设备凭据，界面上应禁用
 *     并说明原因；
 *   - `unavailable` —— 本平台未提供获取方式（不预期出现，用于报告暂不支持的情况）。
 */
export function realTierAvailabilityFor(platform: string): {
  state: 'available' | 'broken' | 'unavailable'
  platform: string
} {
  return platform === 'darwin'
    ? { state: 'broken', platform: 'darwin' }
    : { state: 'available', platform }
}

