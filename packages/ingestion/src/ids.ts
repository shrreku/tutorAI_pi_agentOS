export function newNodeId(): string {
  return `nd_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function newChunkId(): string {
  return `chk_${crypto.randomUUID().replaceAll("-", "")}`;
}
