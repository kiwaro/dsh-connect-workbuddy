# Windows 3.4.3 验证记录与步骤

本文记录3.4.3的程序路径注册表查找及策略拒绝检查。2026-10-03的执行使用默认安装位置，因此注册表回退路径仍需要自定义安装条件的独立验证。

## 1. 当次结果

| 检查项 | 结果 |
| --- | --- |
| 版本号 | ✅ `WorkBuddy Connect 3.4.3` |
| `doctor` 来源字段 | ✅ 显示 `via default-layout` |
| 凭据读取 / DSH 加载 | ✅ `present` / `running (pid 27700)` |
| A 轮核心：`via registry` | ❌ 未触发（见下） |
| `pnpm run check` | ✅ 870 全部通过、typecheck 干净、build 成功 |
| CI（ubuntu + windows） | ✅ 双绿 |
| B 轮：403 策略拒绝 | ⏸️ 无法主动构造，未观测 |

`via default-layout` 证明默认目录查找及来源显示已执行。`via registry` 才表示本次程序路径来自注册表。

## 2. 准备

在可恢复的测试profile中安装目标版本并重启 DSH，使用doctor核对版本。记录实际WorkBuddy程序位置，以及是否设置 `WORKBUDDY_APP_EXECUTABLE`。

```powershell
dsh plugin --profile desktop exec dsh-connect-workbuddy doctor --json
Get-Process WorkBuddy -ErrorAction SilentlyContinue | Select-Object Path
```

## 3. 注册表路径

对默认候选均未命中的安装位置，检查卸载项中的 `DisplayIcon` 与 `InstallLocation`。doctor应报告实际程序路径和 `appExecutableSource: registry`，再使用status核对账号读取。

默认目录安装作为对照，来源应报告 `default-layout`。使用环境变量指定程序时，来源按该配置报告。需要模拟失效路径时，应使用测试安装和可恢复文件副本。

## 4. 内容策略拒绝

先确认正常请求能够返回。遇到内容策略拒绝时，保存业务码、服务端说明和 `requestId`，核对账号池状态。策略类和登录类错误分别处理，具体判定以所用版本实现为准。

## 5. 结果材料

记录插件版本、Windows版本、实际安装目录、程序来源、账号读取和正常请求结果。注册表查找失败时，附上脱敏后的卸载项形态及含空格路径。

原记录中870项测试、类型检查和构建通过，CI记为双平台通过；内容策略拒绝未主动触发。这些结果与注册表回退的现场覆盖分别记录。
