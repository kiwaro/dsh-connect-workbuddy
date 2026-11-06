# Windows 平台维护说明

本文记录 Windows 平台的路径规则与文件写入要求，同时说明进程、权限处理及历史测量。平台相关修改需要同步更新中英文 README，并在此文件与相应测试中补充依据。

## 1. 平台分支

| 位置 | Windows 处理规则 |
| --- | --- |
| `defaultDesktopAuthDirs()` | 优先读取 LOCALAPPDATA、APPDATA，缺少有效值时使用用户目录中的 AppData |
| `workbuddyAppExecutableCandidates()` | 检查默认程序目录，并使用卸载注册表查找其他安装位置 |
| `processStartTimeMs()`、`processStartProbe()` | 通过 PowerShell 读取进程开始时间，以 UTC 格式解析 |
| 设置写入 | 对 profile 配置的写入结果重新读取并核对，失败时保留原选择及编辑内容 |
| 后台子进程 | 设置 `windowsHide: true`，适用于无控制台的 GUI DSH |
| 加密密钥探测 | 对成功及失败结果缓存，合并同次扫描中的重复查找 |
| `protectCredentialDirectory()` | 针对凭据库目录设置 ACL，校验实际目标范围 |

处理 Windows 格式的注册表路径时使用 `path.win32`。处理运行平台自身的路径时使用对应的路径函数。测试中的期望路径也要遵守相同的数据格式。

## 2. 证据分级

| 等级 | 含义 |
| --- | --- |
| A | Windows 实际机器上的执行记录，注明系统和目录形态 |
| B | Windows CI 上的执行记录 |
| C | 根据平台目录规则及单元测试推导，需要适用安装形态的执行记录 |
| D | 待调查事项及缺少验证的判断 |

文件占用与控制台行为需要在相应 Windows 条件下验证。macOS、Linux 的文件替换结果只能证明对应平台上的行为。

2026-09-26 记录中的加密字段 `keyId=9127dea1b44020a7` 来自现场文件。其密钥原始值未留存，测试只检查相应格式，原值需要通过当时记录核对。

## 3. 文件写入与进程清理

Windows 文件句柄可能使 rename、unlink 返回 `EPERM`、`EBUSY` 或 `EACCES`。客户端写入配置后需要重新读取，确认所保存账号和设置与请求一致。

写入临时文件并替换目标文件时，历史重试参数为初始 20 毫秒、最大延迟 200 毫秒、8 次限制。延迟序列约为 `20+40+80+160+200×4=1100` 毫秒，测量端到端为 1149 至 1165 毫秒。占用 0、100、300、600、1000 毫秒后释放的测试均成功；持续占用 60 秒时返回失败，目标内容保持原值。

`src/host-peers.ts` 的后备写入实现需要与 DSH 保持相同锁命名、瞬时错误分类和重试规则。测试见 `tests/host-peers.spec.ts`。

测试主动启动占用文件的子进程后，清理阶段先等待其 `exit`，再删除临时文件。原测量中，调用 kill 后约 1 毫秒开始删除，而句柄约 9 毫秒后释放；立即删除为 8/8 失败，延迟 50 毫秒的对照为 8/8 成功。改为等待退出后，连续验证为 6/6 通过，用例耗时由 7782 降至 1615 毫秒。

## 4. 子进程与缓存

GUI DSH 通常没有控制台。后台 PowerShell、注册表及密钥读取进程应设置 `windowsHide: true`。验证窗口行为时，使用无控制台父进程，并观察子进程的实际控制台。

原 WMI 对照中，未设置该选项时子进程报告 `NEW-console hwnd=1573500 visible=True`，设置后报告 `no-console`。`MainWindowHandle` 的数值需要结合窗口归属解读，控制台窗口通常由 conhost 持有。

注册表探测曾在 19.1 秒请求中消耗约 15.3 秒，产生约 135 个 `reg query`，对应 45 次程序查找。实现需缓存失败结果，并在扫描结束后计算共享窗口。回归见 `tests/issue77-at-rest-key-cache.spec.ts`。

## 5. 凭据库 ACL

Windows 凭据库通过 DACL 控制访问，写文件时的 POSIX mode 只能用于支持该权限模型的平台。加固目标应解析为凭据库根目录，并在写入前确定权限。

权限操作遵守以下规则：

1. 确认目标为所用凭据库根目录。
2. 明确排除 DSH_HOME 及其祖先目录。
3. 目录使用适用的继承标记，文件采用对应文件权限。
4. 对同一路径合并正在进行的操作，避免重复启动子进程。
5. 保存权限命令的执行结果，必要时另行检查目录与文件的有效权限。

历史测试中，对目录递归应用错误的 ACL 参数产生过空 DACL。仅加固区域子目录也可能保留可被替换的父目录，因此目标选择和继承方式都需要测试。`icacls` 测量耗时为静止状态 19 至 52 毫秒，并行负载下最高 1242 毫秒。

issue #208 记录过 DSH_HOME 被误处理后 attachments 读取失败。保护函数由 `vaultRootToHarden()` 和 `harnessHomeRefusal()` 分别检查目标与拒绝范围。测试见 `tests/issue208-acl-harness-home-guard.spec.ts`。

当前加固命令移除继承项，并替换指定用户、SYSTEM 和管理员的授权；其他显式权限项可能保留，禁止继承的子项也不保证随父目录更新。诊断只比较读取到的主体标识，不完整评估允许、拒绝和具体访问权。成功路径会在进程内缓存，之后的外部权限变化需要另行检查。

凭据仍以明文保存，权限加固需要结合磁盘访问管理。DPAPI 和 safeStorage 加密属于独立的存储格式改造。

## 6. 维护检查

1. 检查平台路径及空环境变量处理。
2. 对写入、删除和配置更新检查占用失败及重新读取结果。
3. 检查后台子进程的启动选项和超时。
4. 对主动占用文件的测试等待进程退出。
5. 检查密钥查找次数、缓存及共享扫描窗口。
6. 对 ACL 操作检查绝对目标及祖先关系。
7. 更新对应测试和实际执行范围。

CI 覆盖范围见 [ci.yml](../.github/workflows/ci.yml)。主要测试包括 `auth.spec.ts`、`at-rest.spec.ts`、`host-heartbeat.spec.ts`、`windows-file-lock.spec.ts`、`platform-standing.spec.ts` 和相关问题回归文件。

## 7. Windows 诊断步骤

### 7.1 取得诊断信息

```powershell
dsh plugin --profile desktop exec dsh-connect-workbuddy doctor --json
node -v
$PSVersionTable.PSVersion
```

检查 `desktopAuthFile.present`、`atRestDecryption.available`、`hostHeartbeat.processAlive` 和各区域账号。缺少 dsh 命令时，可使用 Node.js 执行插件目录中的 `lib/bin.js doctor --json`。

### 7.2 核对文件和程序位置

检查 LOCALAPPDATA 与 APPDATA 对应目录，以及实际 WorkBuddy 安装位置。自定义路径可通过 `WORKBUDDY_AUTH_FILE` 或 `WORKBUDDY_APP_EXECUTABLE` 指定，设置后重新启动需要读取环境变量的进程。

### 7.3 验证配置占用

使用测试 profile 保存一份配置副本，再通过文件句柄控制占用。DSH 0.1.7 的配置文件为 `profiles/<profile>/cordis.patch.yml`。

占用期间尝试保存账号选择，应显示写入错误并保留原值；释放句柄后保存应成功。将重新读取结果与卡片显示、配置内容比较。测试环境和现场配置分别记录。

### 7.4 保存报告

记录 Windows 和 WorkBuddy 版本、Node.js、PowerShell、实际目录、所用 profile、诊断结果及操作步骤。共享前移除 token、用户标识和其他敏感内容。

## 8. 历史执行范围

2026-09-26 的 Windows 11 记录命中 `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth` 和 `%LOCALAPPDATA%\Programs\WorkBuddy\WorkBuddy.exe`。程序调用返回 Node.js v22.21.1，两个国内版账号被读取。

该次心跳原值为 `2026-09-26T04:03:00.9358345Z`，解析为 1790395380935 毫秒。测试记录为 368 项通过，打包预览为 18 个文件。这些数量属于该次版本。

其余默认安装候选及具体安全软件的占用方式需要按实际安装形态补充。CLI Windows 自动查找曾遗漏 npm 全局目录中的直接 `node_modules` 布局，修复时为不同包管理器分别列出候选。
