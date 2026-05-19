export function stableTopicId(sourceId: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "overview";
  return `topic_${sourceId}_${slug}`.slice(0, 180);
}

export function topicTitleForSource(
  source: { id: string; title: string },
  curriculum: { title: string; sourceIds: string[] } | undefined,
): string {
  if (curriculum?.sourceIds.includes(source.id)) {
    return curriculum.title;
  }
  return source.title;
}
