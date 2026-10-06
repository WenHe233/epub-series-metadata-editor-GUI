# EPUB 系列信息编辑器

基于 Tauri 2、Rust 和 React 的桌面工具，用于批量编辑 EPUB 系列名称及序号。支持中文、英文和亮暗主题。

## 下载

从 [Releases](https://github.com/WenHe233/epub-series-metadata-editor-GUI/releases) 下载正式版。带有 `nightly-` 标签的版本是预览版。

| 系统                             | 架构                 | 下载格式                |
| -------------------------------- | -------------------- | ----------------------- |
| Windows 10 / 11                  | x64、ARM64           | 便携 ZIP、NSIS 安装 EXE |
| macOS 11+                        | Intel、Apple Silicon | DMG                     |
| Linux（Ubuntu 24.04 或兼容环境） | x64、ARM64           | AppImage                |

Windows 便携版需要系统已有 WebView2。安装版会在缺少 WebView2 时联网安装，不捆绑完整运行时。AppImage 仍依赖系统图形环境和兼容的 glibc；必要时安装 FUSE，或使用 `APPIMAGE_EXTRACT_AND_RUN=1`。

发行包没有付费代码签名或 Apple 公证。Windows 可能提示未知发布者；macOS 用户需通过系统的“隐私与安全性”允许打开。程序没有应用内自动更新。

## 使用

1. 打开包含 EPUB 的文件夹，按需勾选“包含子目录”。
2. 左侧目录用于筛选和级联选择；中央表格可直接编辑系列和序号。Shift 点击复选框可选择连续书籍。
3. 拖动书籍行左侧手柄可在同一目录内排序，也可聚焦手柄后用空格键和方向键操作。编号按列表顺序应用。
4. 右侧面板提供统一系列、父目录命名、多数系列识别、自动编号和智能续编。智能续编保留首项编号，后续从下一整数开始。
5. 选择保存格式，点击“保存更改”。保存成功的项目移出待保存列表，失败项显示原因并保留修改供重试。

最多撤销最近 20 次编辑或排序操作。保存后清空撤销历史。切换目录、刷新或关闭窗口时，会提示处理未保存的更改。

默认备份和两种系列格式均开启。保存会移除未勾选格式的系列标签；清空系列名会移除系列和序号标签。不会删除非系列 collection。已有备份不会覆盖，后续依次使用 `.bak.1`、`.bak.2`。备份可能包含多个历史版本，请自行管理。

写入先在同目录生成临时文件，通过检查后替换原文件。程序会检查外部修改冲突；发生冲突时先保留编辑结果，再重新扫描文件。损坏、无法解析或无权限读取的 EPUB 会单独显示错误。

## 开发

需要 Node.js 24、npm、Rust stable，以及 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
npm ci
npm run dev
```

`npm run dev:web` 仅预览界面，文件访问需要桌面程序。

```bash
npm run build
npm test
npm run test:release
npx playwright install chromium
npm run test:e2e
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run dist
```

图标源文件是 `assets/icon.svg`，运行 `npm run icons` 重新生成各平台图标。前端代码位于 `src/renderer`；Rust 命令和 EPUB 处理位于 `src-tauri/src`。依赖锁文件随代码提交。

详细说明见 [测试与验证](docs/TESTING.md) 和 [版本发布](docs/RELEASING.md)。

## 许可证

MIT
