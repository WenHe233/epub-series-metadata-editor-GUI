import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  statSync,
  appendFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export function releaseVersion(tag) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag))
    throw new Error("Expected a vX.Y.Z tag");
  const version = tag.slice(1);
  if (version.split(".").some((n) => Number(n) > 65535))
    throw new Error("Version exceeds installer limits");
  return version;
}
export function nightlyVersion(base, run, attempt) {
  releaseVersion("v" + base);
  if (!/^\d+$/.test(run) || !/^\d+$/.test(attempt))
    throw new Error("Invalid run identity");
  return base + "-nightly." + run + "." + attempt;
}
export function syncVersion(root, version) {
  if (!/^\d+\.\d+\.\d+(?:-nightly\.\d+\.\d+)?$/.test(version))
    throw new Error("Invalid version");
  for (const name of [
    "package.json",
    "package-lock.json",
    "src-tauri/tauri.conf.json",
  ]) {
    const path = join(root, name),
      json = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
    json.version = version;
    if (name === "package-lock.json") json.packages[""].version = version;
    writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  }
  const cargo = join(root, "src-tauri/Cargo.toml");
  writeFileSync(
    cargo,
    readFileSync(cargo, "utf8").replace(
      /^(version\s*=\s*)"[^"]+"/m,
      '$1"' + version + '"',
    ),
  );
  const lock = join(root, "src-tauri/Cargo.lock");
  writeFileSync(
    lock,
    readFileSync(lock, "utf8").replace(
      /(name = "epub-series-metadata-editor"\nversion = )"[^"]+"/,
      '$1"' + version + '"',
    ),
  );
}
export function expectedAssets(version) {
  const prefix = "EPUB-Metadata-Editor-" + version;
  return [
    "win-x64-portable.zip",
    "win-x64-setup.exe",
    "win-arm64-portable.zip",
    "win-arm64-setup.exe",
    "mac-x64.dmg",
    "mac-arm64.dmg",
    "linux-x64.AppImage",
    "linux-arm64.AppImage",
  ].map((s) => prefix + "-" + s);
}
export function validateAssets(dir, version) {
  const expected = expectedAssets(version),
    actual = readdirSync(dir)
      .filter((n) => n !== "SHA256SUMS.txt")
      .sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
    throw new Error(
      "Release must contain exactly eight expected packages: " +
        actual.join(", "),
    );
  for (const file of expected)
    if (statSync(join(dir, file)).size < 1024)
      throw new Error("Empty/truncated package: " + file);
  const sums =
    expected
      .map(
        (file) =>
          createHash("sha256")
            .update(readFileSync(join(dir, file)))
            .digest("hex") +
          "  " +
          file,
      )
      .join("\n") + "\n";
  writeFileSync(join(dir, "SHA256SUMS.txt"), sums);
  return expected;
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}
function collect(target, platform, arch, version) {
  const output = resolve(".artifacts/packages");
  mkdirSync(output, { recursive: true });
  const built = files(resolve("src-tauri/target", target, "release/bundle"));
  const extension = { win: ".exe", mac: ".dmg", linux: ".AppImage" }[platform];
  const candidates = built.filter((f) => f.endsWith(extension));
  if (candidates.length !== 1)
    throw new Error(
      "Expected exactly one installer, found " + candidates.length,
    );
  const name =
    "EPUB-Metadata-Editor-" +
    version +
    "-" +
    platform +
    "-" +
    arch +
    (platform === "win" ? "-setup" : "") +
    extension;
  copyFileSync(candidates[0], join(output, name));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "version") syncVersion(process.cwd(), args[0]);
  else if (command === "validate") validateAssets(args[0], args[1]);
  else if (command === "collect") collect(...args);
  else if (command === "prepare") {
    const base = JSON.parse(
      readFileSync("package.json", "utf8").replace(/^\uFEFF/, ""),
    ).version;
    const mode = args[0];
    const version =
      mode === "release"
        ? releaseVersion(process.env.GITHUB_REF_NAME)
        : mode === "nightly"
          ? nightlyVersion(
              base,
              process.env.GITHUB_RUN_NUMBER,
              process.env.GITHUB_RUN_ATTEMPT,
            )
          : base;
    const tag =
      mode === "release"
        ? process.env.GITHUB_REF_NAME
        : mode === "nightly"
          ? "nightly-" +
            new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) +
            "-" +
            process.env.GITHUB_RUN_NUMBER +
            "-" +
            process.env.GITHUB_RUN_ATTEMPT
          : "";
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      "version=" + version + "\ntag=" + tag + "\n",
    );
  } else throw new Error("Unknown command");
}
