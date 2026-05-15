export async function loadExportDeckToHtml(): Promise<
  typeof import('./exportDeckToHtml')
> {
  return import('./exportDeckToHtml')
}
