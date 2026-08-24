const SCRIPT_START_MARKERS = [
  /^\s*\[\s*abertura\s*\]\s*$/gim,
  /^\s*###?\s*abertura\s*$/gim,
  /^\s*\[\s*in[ií]cio(?:\s+do\s+script)?\s*\]\s*$/gim,
];

const TEMPLATE_HEADING_RE =
  /^\s*(?:esqueleto|template|modelo|roteiro)\s+do\s+script(?:\s+para\s+(?:preencher|compilar|retornar))?\s*:?\s*$/gim;

const TRAILING_COMMAND_RE =
  /^\s*(?:comando\s+de\s+execu[cç][aã]o|fim\s+do\s+(?:script|template)|regras?\s+de\s+sa[ií]da)\s*:?/im;

/** Recorta somente o roteiro final, descartando instruções ecoadas pela IA. */
export function extractFinalScriptOnly(value: string): string {
  let text = (value ?? "")
    .replace(/```(?:text|markdown|md)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  let start = -1;
  for (const marker of SCRIPT_START_MARKERS) {
    marker.lastIndex = 0;
    for (const match of text.matchAll(marker)) start = Math.max(start, match.index ?? -1);
  }

  if (start < 0) {
    TEMPLATE_HEADING_RE.lastIndex = 0;
    const headings = [...text.matchAll(TEMPLATE_HEADING_RE)];
    const lastHeading = headings.at(-1);
    if (lastHeading?.index !== undefined) start = lastHeading.index + lastHeading[0].length;
  }

  if (start >= 0) text = text.slice(start).trim();

  const trailingCommand = text.search(TRAILING_COMMAND_RE);
  if (trailingCommand > 0) text = text.slice(0, trailingCommand);

  return text.replace(/\n{3,}/g, "\n\n").trim();
}