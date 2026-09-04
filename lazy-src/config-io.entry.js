import { parse, stringify } from "yaml";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { assertSupportedUserAsset, collectAssetIds, compileSourceConfig, decompileConfig } from "../config-schema.js";

const FORMAT = "schedule-viewer";
const FORMAT_VERSION = 1;
const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

function safeName(value) {
  return String(value ?? "asset")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function extensionFrom(record) {
  const original = String(record.filename ?? "");
  const match = original.match(/(\.[a-zA-Z0-9]{1,8})$/);
  if (match) return match[1].toLowerCase();
  const mime = record.mimeType || record.blob?.type || "";
  const map = {
    "image/gif": ".gif",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/avif": ".avif"
  };
  return map[mime] ?? ".bin";
}

function validateArchivePath(path) {
  if (typeof path !== "string" || !path || path.includes("\\") || path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`Ruta insegura en el paquete: ${path}`);
  }
}

export function compiledToYaml(config) {
  return stringify(decompileConfig(config), {
    indent: 2,
    lineWidth: 0,
    minContentWidth: 0,
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN"
  });
}

export function yamlToCompiled(yamlText) {
  if (typeof yamlText !== "string") throw new TypeError("YAML must be text.");
  const raw = parse(yamlText, { prettyErrors: true, uniqueKeys: true });
  return compileSourceConfig(raw);
}

export function normalizeCompiledConfig(config) {
  return compileSourceConfig(decompileConfig(config));
}

export async function exportSchedulePackage({ config, assets = [] }) {
  const normalized = normalizeCompiledConfig(config);
  const yamlText = compiledToYaml(normalized);
  const required = new Set(collectAssetIds(normalized));
  const byId = new Map(assets.map((record) => [record.id, record]));
  const archive = {
    "schedule.yaml": strToU8(yamlText)
  };
  const manifestAssets = [];

  for (const id of required) {
    const record = byId.get(id);
    if (!record?.blob) throw new Error(`Falta el asset local requerido ${id}.`);
    assertSupportedUserAsset(record, `assets.${id}`);
    if (record.blob.size > MAX_ASSET_BYTES) throw new Error(`Asset ${id} exceeds the 25 MiB limit.`);
    const filename = `assets/${safeName(id)}${extensionFrom(record)}`;
    archive[filename] = new Uint8Array(await record.blob.arrayBuffer());
    manifestAssets.push({
      id,
      file: filename,
      mimeType: record.mimeType || record.blob.type || "application/octet-stream",
      filename: record.filename || filename.split("/").pop()
    });
  }

  const manifest = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    configVersion: 4,
    createdAt: new Date().toISOString(),
    assets: manifestAssets
  };
  archive["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  const compressed = zipSync(archive, { level: 6 });
  if (compressed.byteLength > MAX_PACKAGE_BYTES) throw new Error("The exported package exceeds the 100 MiB limit.");
  return new Blob([compressed], { type: "application/vnd.schedule-viewer+zip" });
}

async function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input instanceof Blob) {
    if (input.size > MAX_PACKAGE_BYTES) throw new Error("The package exceeds the 100 MiB limit.");
    return new Uint8Array(await input.arrayBuffer());
  }
  throw new TypeError("Paquete no soportado.");
}

export async function inspectSchedulePackage(input) {
  const bytes = await toBytes(input);
  if (bytes.byteLength > MAX_PACKAGE_BYTES) throw new Error("The package exceeds the 100 MiB limit.");
  const files = unzipSync(bytes);
  for (const path of Object.keys(files)) validateArchivePath(path);
  if (!files["manifest.json"] || !files["schedule.yaml"]) throw new Error("The package must contain manifest.json and schedule.yaml.");

  let manifest;
  try {
    manifest = JSON.parse(strFromU8(files["manifest.json"]));
  } catch {
    throw new Error("manifest.json is not valid JSON.");
  }
  if (manifest?.format !== FORMAT || manifest?.formatVersion !== FORMAT_VERSION || manifest?.configVersion !== 4) {
    throw new Error("Formato .schedule no compatible.");
  }

  const yamlText = strFromU8(files["schedule.yaml"]);
  const config = yamlToCompiled(yamlText);
  const required = new Set(collectAssetIds(config));
  const assets = [];
  const seen = new Set();
  for (const item of manifest.assets ?? []) {
    if (!item || typeof item.id !== "string" || typeof item.file !== "string") throw new Error("Invalid asset entry in manifest.json.");
    validateArchivePath(item.file);
    if (seen.has(item.id)) throw new Error(`Asset duplicado en manifest: ${item.id}.`);
    seen.add(item.id);
    const data = files[item.file];
    if (!data) throw new Error(`Falta ${item.file} en el paquete.`);
    if (data.byteLength > MAX_ASSET_BYTES) throw new Error(`Asset ${item.id} exceeds the 25 MiB limit.`);
    const record = {
      id: item.id,
      blob: new Blob([data], { type: item.mimeType || "application/octet-stream" }),
      mimeType: item.mimeType || "application/octet-stream",
      filename: item.filename || item.file.split("/").pop()
    };
    assertSupportedUserAsset(record, `manifest.assets.${item.id}`);
    assets.push(record);
  }
  for (const id of required) if (!seen.has(id)) throw new Error(`El paquete no contiene el asset requerido ${id}.`);
  return { config, yaml: yamlText, manifest, assets };
}

export async function exportLegacyPackage({ record, assets = [] }) {
  if (!record?.normalized || record.normalized.version !== 3) throw new Error("There is no v3 configuration to recover.");
  const archive = {
    "legacy-config.json": strToU8(JSON.stringify(record.normalized, null, 2)),
    "legacy-metadata.json": strToU8(JSON.stringify({ version: 3, yaml: record.yaml ?? null, exportedAt: new Date().toISOString() }, null, 2))
  };
  for (const asset of assets) {
    if (!asset?.blob) continue;
    archive[`assets/${safeName(asset.id)}${extensionFrom(asset)}`] = new Uint8Array(await asset.blob.arrayBuffer());
  }
  return new Blob([zipSync(archive, { level: 6 })], { type: "application/zip" });
}

export { MAX_ASSET_BYTES, MAX_PACKAGE_BYTES };
