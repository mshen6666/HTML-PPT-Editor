export async function loadExportDeckToPdf(): Promise<
  typeof import('./exportDeckToPdf')
> {
  return import('./exportDeckToPdf')
}
