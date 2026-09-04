function resolveAssetUrl(src, baseURI) { return new URL(src, baseURI).href; }

export function renderSelectionContent(_config, selection, { baseURI }) {
  const content = selection?.content;
  if (!content || content.type !== "image" || !content.src) throw new Error("La selección no contiene una imagen renderizable.");
  const src = resolveAssetUrl(content.src, baseURI);
  return { contentType: "image", src, fallbackSrc: null, fit: content.fit ?? "contain", cacheKey: `image:${src}` };
}
