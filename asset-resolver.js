import { getAsset } from "./local-store.js";

export class MissingLocalAssetError extends Error {
  constructor(assetId) {
    super(`No existe el asset local ${assetId}.`);
    this.name = "MissingLocalAssetError";
    this.assetId = assetId;
  }
}

export async function resolveRenderedSource(rendered, { factory = globalThis.indexedDB } = {}) {
  if (!rendered?.assetId) return { ...rendered, objectUrl: null };
  const record = await getAsset(rendered.assetId, factory);
  if (!record?.blob) throw new MissingLocalAssetError(rendered.assetId);
  const objectUrl = URL.createObjectURL(record.blob);
  return {
    ...rendered,
    src: objectUrl,
    objectUrl,
    cacheKey: `local-asset:${rendered.assetId}:${record.updatedAt ?? "0"}`
  };
}

export function releaseResolvedSource(rendered) {
  if (rendered?.objectUrl?.startsWith("blob:")) URL.revokeObjectURL(rendered.objectUrl);
}
