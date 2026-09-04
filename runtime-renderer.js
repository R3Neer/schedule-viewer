import { renderSelectionContent as renderBaseSelectionContent } from "./content-renderer.js";

export * from "./content-renderer.js";

export function renderSelectionContent(config, selection, options) {
  const content = selection?.content;
  if (content?.type === "image" && content.asset) {
    return {
      contentType: "image",
      src: null,
      assetId: content.asset,
      fallbackSrc: null,
      fit: content.fit ?? "contain",
      cacheKey: `local-asset:${content.asset}`
    };
  }
  return renderBaseSelectionContent(config, selection, options);
}
