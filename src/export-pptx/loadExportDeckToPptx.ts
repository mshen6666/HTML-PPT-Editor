export async function loadExportDeckToPptx(): Promise<
  typeof import('./exportDeckToPptx')
> {
  return import('./exportDeckToPptx')
}
