export function sanitizeShareText(value) {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .replace(/([,;])(?:\s*[,;])+/g, '$1')
    .replace(/([,;])(?=\S)/g, '$1 ')
    .replace(/\s+([.!?])/g, '$1')
    .replace(/^[,;]\s*|[,;]\s*$/g, '')
    .trim();
}
