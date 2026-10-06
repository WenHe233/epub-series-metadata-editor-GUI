import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  releaseVersion,
  nightlyVersion,
  expectedAssets,
  validateAssets,
  syncVersion,
} from "./release.mjs";
test("strict stable tags and unique nightlies", () => {
  assert.equal(releaseVersion("v2.0.0"), "2.0.0");
  for (const tag of [
    "v2",
    "2.0.0",
    "v2.0.0-beta",
    "v02.0.0",
    "v2.0.0/extra",
    "v99999.0.0",
  ])
    assert.throws(() => releaseVersion(tag));
  assert.notEqual(
    nightlyVersion("2.0.0", "10", "1"),
    nightlyVersion("2.0.0", "10", "2"),
  );
});
test("all eight packages are mandatory and checksums repeat deterministically", () => {
  const dir = mkdtempSync(join(tmpdir(), "epub-release-"));
  try {
    const names = expectedAssets("2.0.0");
    assert.equal(new Set(names).size, 8);
    assert.throws(() => validateAssets(dir, "2.0.0"));
    for (const name of names)
      writeFileSync(join(dir, name), Buffer.alloc(2048, 1));
    validateAssets(dir, "2.0.0");
    const first = readFileSync(join(dir, "SHA256SUMS.txt"), "utf8");
    validateAssets(dir, "2.0.0");
    assert.equal(first, readFileSync(join(dir, "SHA256SUMS.txt"), "utf8"));
    writeFileSync(join(dir, "unexpected.exe"), "bad");
    assert.throws(() => validateAssets(dir, "2.0.0"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("version is synchronized in every package manifest and lockfile", () => {
  const dir = mkdtempSync(join(tmpdir(), "epub-version-"));
  mkdirSync(join(dir, "src-tauri"));
  try {
    for (const name of ["package.json", "src-tauri/tauri.conf.json"])
      writeFileSync(join(dir, name), '{"version":"1.0.0"}');
    writeFileSync(
      join(dir, "package-lock.json"),
      '{"version":"1.0.0","packages":{"":{"version":"1.0.0"}}}',
    );
    writeFileSync(
      join(dir, "src-tauri/Cargo.toml"),
      '[package]\nversion = "1.0.0"\n',
    );
    writeFileSync(
      join(dir, "src-tauri/Cargo.lock"),
      '[[package]]\nname = "epub-series-metadata-editor"\nversion = "1.0.0"\n',
    );
    syncVersion(dir, "2.0.0");
    assert.equal(
      JSON.parse(readFileSync(join(dir, "package-lock.json"))).packages[""]
        .version,
      "2.0.0",
    );
    assert.match(
      readFileSync(join(dir, "src-tauri/Cargo.lock"), "utf8"),
      /version = "2.0.0"/,
    );
    assert.match(
      readFileSync(join(dir, "src-tauri/Cargo.toml"), "utf8"),
      /version = "2.0.0"/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
