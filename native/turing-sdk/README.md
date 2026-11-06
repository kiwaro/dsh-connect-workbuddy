# Turing Shield SDK 子进程

`src/turing-sdk.ts` 通过 `worker.cjs` 调用 WorkBuddy 桌面端安装目录中的 Turing Shield SDK。插件包提供调用脚本，运行时从 WorkBuddy 桌面端加载原生模块和动态库。

## 1. 查找 SDK

插件按以下顺序确定 SDK 路径：

1. 环境变量 `WORKBUDDY_TURING_SDK_DIR`。
2. 设置页填写的 SDK 目录。
3. WorkBuddy 桌面端的安装目录。

自动查找的路径如下：

| 平台 | SDK 相对路径 | 安装目录来源 |
| --- | --- | --- |
| Windows | `resources/app.asar.unpacked/native/turing-sdk` | 默认安装目录和卸载注册表 |
| macOS | `Contents/Resources/app.asar.unpacked/native/turing-sdk` | `/Applications`、`~/Applications` 及其下一层目录 |

插件检查目录中的 `build/Release/turing_sdk.node`。诊断状态包括 `missing`（SDK 缺失）、`error`（加载或调用错误）、`unsupported`（平台不受支持）、`disabled`（功能关闭）和 `ready`（模块加载成功并报告支持该平台）。获取设备 token 的结果另行检查。

SDK 目录应保留以下结构：

```text
<dir>/index.cjs
<dir>/package.json
<dir>/build/Release/turing_sdk.node
<dir>/build/Release/TuringShieldSDK.dll   # Windows
```

原生模块通过相对路径加载动态库，移动时应保留整个目录。

## 2. 子进程与返回值

SDK 在独立子进程中加载。父进程负责超时终止和结果解析，SDK 的加载错误及挂起由该子进程处理。

`worker.cjs` 支持两个命令：

| 命令 | 用途 |
| --- | --- |
| `probe` | 加载模块，检查平台支持情况 |
| `token` | 获取设备 token |

脚本向标准输出写入一行 JSON。父进程解析最后一行，并截取标准错误末尾作为错误摘要。

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | SDK 缺失、加载失败或平台不受支持 |
| 2 | 获取 token 失败 |
| 3 | 子进程超时 |

## 3. 子进程环境变量

下表中的变量由父进程传给 `worker.cjs`。用户配置使用的 `WORKBUDDY_*` 变量见[项目说明](../../README.md#积分与凭据诊断)。

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `TURING_SDK_DIR` | 必填 | SDK 目录，空值返回 `no-dir` |
| `TURING_TIMEOUT_MS` | `15000` | 子进程超时时间，单位毫秒；父进程另设超时 |
| `TURING_CHANNEL_ID` | `109144` | 传给 SDK 的渠道号 |
| `TURING_PRODUCT_NAME` | `WorkBuddy` | 产品名称 |
| `TURING_PRODUCT_VERSION` | `5.8.3` | 产品版本；调用方可覆盖 |
| `TURING_KEYCHAIN_STORAGE` | `0` | 值为 `1` 或 `true` 时启用设备缓存存储 |

`configure(channelId, productName, productVersion, keychainStorageEnabled)` 的第四个参数始终传入布尔值，默认 `false`。

在 PowerShell 中手动检查：

```powershell
$env:TURING_SDK_DIR = 'C:\path\to\native\turing-sdk'
node native/turing-sdk/worker.cjs probe
```

## 4. 平台记录

Windows 的加载和 token 获取依赖桌面端 SDK、动态库以及运行进程的兼容性。可使用 `doctor` 查看发现的路径，再检查 token 获取结果。

2026-11-01 的 macOS 测试中，模块加载成功，获取 token 超时。采样记录显示 SDK 等待 dispatch 主队列，而 Node.js 子进程未处理该队列。因此，该记录中的 `ready` 仅表示模块可加载；设备 token 获取失败时，“真实值”模式省略设备请求头。

平台诊断方法见 [Windows 说明](../../docs/WINDOWS.md)。
