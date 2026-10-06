# 测试与验证

## 自动化覆盖

- Rust 集成测试生成临时 EPUB，检查系列格式、小数序号、XML 命名空间和转义、多 collection、清空系列、备份不覆盖、外部冲突、损坏文件、只读文件、mimetype 顺序及非 OPF 条目不变。
- Vitest 检查批量编号、自然显示顺序下的操作、目录边界、范围选择、系列识别及修改比较。
- Playwright 使用模拟 IPC 检查界面编辑、撤销、部分保存失败后的重试、刷新、选择、智能续编、未保存提示及中英文主题。
- Windows 和 Linux 使用 tauri-driver 操作真实 WebView，调用 Rust 完成扫描、编辑、保存、重新读取和越权路径拒绝。
- 六个原生构建目标运行 Rust 测试并打包，随后检查应用至少持续运行五秒。Linux 启动的是 AppImage；Windows 和 macOS 启动的是对应原生可执行文件。启动检查不等同于每个平台的完整交互验证。

桌面测试专用的 `desktop-tests` Cargo feature 允许从 `EPUB_TEST_DIR` 读取测试目录，跳过系统选目录对话框。正式和 Nightly 打包均不启用此 feature。测试文件由 `scripts/fixtures.py` 生成，禁止对真实书库运行测试。

## 本地桌面测试

```bash
npm run tauri -- build --debug --no-bundle --features desktop-tests --config src-tauri/tauri.test.conf.json
cargo install tauri-driver --locked
python scripts/fixtures.py .artifacts/fixtures
```

Windows 安装与 WebView2 匹配的 msedgedriver，设置 `EPUB_TEST_DIR` 为测试目录绝对路径、`NATIVE_DRIVER` 为驱动绝对路径，再运行：

```bash
node scripts/desktop-test.mjs src-tauri/target/debug/epub-series-metadata-editor.exe
```

Linux 安装 webkit2gtk-driver 和 xvfb，设置相同的测试目录环境变量，再运行：

```bash
xvfb-run -a node scripts/desktop-test.mjs src-tauri/target/debug/epub-series-metadata-editor
```

结果、截图和驱动日志写入 `.artifacts`。WebDriver 报告的启动时间包含创建驱动会话的开销，不能直接作为正式版冷启动性能。

## 发布验收

正式版必须通过全部检查和六目标打包。附件严格为 Windows 四包、macOS 两包、Linux 两包，加一份 SHA256SUMS.txt。

体积基线取旧 v1.0.6 发布的 Windows x64 便携 EXE（75,311,800 字节）。新版本以便携 ZIP 为下载体积口径，目标小于基线的一半。记录正式版启动和所有 WebView 子进程的合计工作集；这属于当前机器测量，不代表所有系统的性能。

### Windows 本地候选构建实测（2026-10-06）

| 项目                  | 结果                                     |
| --------------------- | ---------------------------------------- |
| x64 便携 ZIP          | 1,715,849 字节，约 1.64 MiB              |
| 与旧版下载体积比较    | 缩小约 97.7%                             |
| 原生 EXE              | 3,748,864 字节                           |
| NSIS 安装包           | 约 1.34 MiB                              |
| 窗口创建时间          | 便携运行 187 ms，安装后 202 ms           |
| 启动 5 秒后合计工作集 | 便携运行约 465.6 MiB，安装后约 462.9 MiB |
| 安装与卸载            | 本机静默安装、启动、静默卸载通过         |

运行环境为 Windows x64、WebView2 154。工作集包含主程序和六个 WebView 子进程，共享页可能被重复计入；主程序工作集约 29 MiB。窗口创建时间不是首帧绘制时间。下载体积已下降，尚无同环境旧版内存基线，因此不宣称内存下降。

以上为本地候选构建数据，最终各平台附件以 Release 为准。未执行跨平台人工交互测试；自动化覆盖与范围如上。
