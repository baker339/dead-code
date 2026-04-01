/**
 * Open a file at a specific ref on github.com (`fullName` = `owner/name`).
 */
export function githubBlobUrl(
  fullName: string,
  ref: string,
  filePath: string,
): string {
  const p = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const refSeg = ref.split("/").map(encodeURIComponent).join("/");
  const pathSeg = p.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${fullName}/blob/${refSeg}/${pathSeg}`;
}
