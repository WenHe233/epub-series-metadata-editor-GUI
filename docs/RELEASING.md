# 版本发布

## 正式版

更新说明和必要的源代码修改通过 PR 合并到 master。推送严格形如 `vX.Y.Z` 的 tag 即触发正式发布：

```bash
git switch master
git pull --ff-only
git tag -a v2.0.0 -m "Release v2.0.0"
git push origin v2.0.0
```

Actions 从 tag 提取版本，在构建目录同步 package.json、package-lock.json、Cargo.toml、Cargo.lock 和 tauri.conf.json。源码不必为了发布 tag 再创建版本提交；仓库内版本用于本地构建和 Nightly 基础版本。

检查流程和六目标打包全部成功后，收集八个下载包，计算 SHA-256，并上传到草稿 Release。再次核对附件清单后才公开。任何前置任务失败都不会公开不完整版本。

已公开版本拒绝覆盖。构建失败且没有公开 Release 时可重跑；未公开草稿可以补全。若源代码需要修复，合并修复并发布新版本，不移动已经公开的 tag。

## Nightly

master 更新或在 master 手动运行 workflow，会生成独立的 `nightly-UTC时间-运行编号-重试编号` tag。包内版本采用 `基础版本-nightly.运行编号.重试编号`。Nightly 标记为预发布，不占用 Latest，也不删除历史 Release。

PR 与其他分支的手动运行只验证，不创建 Release。测试产物只作为 Actions artifacts 上传。

## 构建矩阵

| 系统    | x64 runner     | ARM64 runner     | 产物                    |
| ------- | -------------- | ---------------- | ----------------------- |
| Windows | windows-2022   | windows-11-arm   | portable.zip、setup.exe |
| macOS   | macos-15-intel | macos-15         | dmg                     |
| Linux   | ubuntu-24.04   | ubuntu-24.04-arm | AppImage                |

版本、系统和架构均包含在文件名中。构建固定 Rust target，避免 runner 默认架构变化造成附件遗漏。工作流默认只读仓库，仅发布任务拥有 contents: write 权限。

发布后检查 tag 对应提交、Release 状态、八个附件及 SHA256SUMS.txt。文件名或附件不齐时先修复工作流，不手工补发未经验证的包。
