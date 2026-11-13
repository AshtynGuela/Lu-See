export function captureMap(source: HTMLCanvasElement) {
  if (source.width < 2 || source.height < 2) return "";
  const ratio = Math.min(1, 1280 / Math.max(source.width, source.height));
  const copy = document.createElement("canvas");
  copy.width = Math.max(1, Math.round(source.width * ratio));
  copy.height = Math.max(1, Math.round(source.height * ratio));
  const context = copy.getContext("2d");
  if (!context) return "";
  context.drawImage(source, 0, 0, copy.width, copy.height);
  return copy.toDataURL("image/jpeg", 0.83);
}
