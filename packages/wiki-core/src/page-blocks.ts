/**
 * Human-protected regions in wiki markdown (GF-0404).
 * Markers are HTML comments so they survive most markdown pipelines.
 *
 * Opening:  <!-- studyagent:owner=human id="any-id" -->
 * Closing: <!-- studyagent:end -->
 */

const OPEN_RE = /<!--\s*studyagent:owner=human\s+id="([^"]+)"\s*-->/;
const CLOSE = "<!-- studyagent:end -->";

export type HumanBlock = { id: string; body: string };

export function extractHumanBlocks(markdown: string): HumanBlock[] {
  const blocks: HumanBlock[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(`${OPEN_RE.source}`, "g");
  while ((m = re.exec(markdown)) !== null) {
    const id = m[1]!;
    const start = m.index + m[0].length;
    const end = markdown.indexOf(CLOSE, start);
    if (end === -1) {
      break;
    }
    blocks.push({ id, body: markdown.slice(start, end).trim() });
    re.lastIndex = end + CLOSE.length;
  }
  return blocks;
}

export function stripHumanBlocks(markdown: string): string {
  let out = markdown;
  for (;;) {
    const m = out.match(OPEN_RE);
    if (!m || m.index === undefined) break;
    const start = m.index;
    const openLen = m[0].length;
    const closeIdx = out.indexOf(CLOSE, start + openLen);
    if (closeIdx === -1) break;
    const end = closeIdx + CLOSE.length;
    out = `${out.slice(0, start)}${out.slice(end)}`;
  }
  return out.trim();
}

/** Re-insert preserved human blocks under a generated agent body (typically headings + bullets). */
export function mergeAgentMarkdownWithHumanBlocks(agentMarkdown: string, preserved: HumanBlock[]): string {
  if (preserved.length === 0) {
    return agentMarkdown.trim();
  }
  const fragments = preserved.map((b) => {
    const inner = b.body.trim();
    return [`<!-- studyagent:owner=human id="${b.id}" -->`, inner, CLOSE].join("\n");
  });
  return [agentMarkdown.trim(), "", ...fragments].join("\n\n");
}
