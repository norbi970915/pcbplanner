/** Native KiCad exports of the site's original LinkBench-4 board, fetched only on request. */
export const GERBER_EXAMPLE_FILES = ['F_Cu.gtl', 'In1_Cu.g1', 'In2_Cu.g2', 'B_Cu.gbl', 'F_Silkscreen.gto', 'Edge_Cuts.gm1'];

export async function loadGerberExample(revision: 'a' | 'b', signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<File[]> {
  return Promise.all(GERBER_EXAMPLE_FILES.map(async suffix => {
    const name = `LinkBench-4-${suffix}`;
    const response = await fetcher(`/examples/linkbench-4/gerbers/rev-${revision}/${name}`, { signal });
    if (!response.ok) throw new Error(`Could not load example revision ${revision.toUpperCase()}: ${name} (HTTP ${response.status}).`);
    return new File([await response.blob()], name);
  }));
}
