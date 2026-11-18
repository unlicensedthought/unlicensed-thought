// Each card answers: what it does, which failure it addresses, how it is evaluated.
export const projects = [
  {
    name: 'armwright',
    href: 'https://github.com/unlicensedthought/armwright',
    what: 'Online, cost-aware model routing with a cascade tier gate and a per-provider circuit breaker.',
    failure: 'A provider degrades or costs climb, and every request keeps paying for it.',
    evaluated: 'A seeded 20,000-call replay against four synthetic arms compares it with always-frontier, cheapest, random and an oracle. A simulation, labeled as one; 20 tests cover the cascade and breaker.',
    stack: 'TypeScript · Apache-2.0'
  },
  {
    name: 'goldenwatch',
    href: 'https://github.com/unlicensedthought/goldenwatch',
    what: 'Golden-set regression harness for LLM output, with a baseline gate.',
    failure: 'A prompt or model change quietly makes answers worse and ships anyway.',
    evaluated: 'Fails closed: a budget-cut run is incomplete, an edited golden set is incomparable, a crashed job sends a could-not-run notice, and detectionPower says when a set is too small to see the drop.',
    stack: 'TypeScript · Apache-2.0'
  }
] as const;

export const proof = [
  { figure: '1,000+', text: 'locations supported on a national industrial weighing network' },
  { figure: '15+', text: 'dealer-facing applications supported at John Deere' },
  { figure: '95% → <5%', text: 'unmanaged devices, in a compliance-controlled computing pilot for 80+ Chevron field technicians on SCADA and Rockwell software' }
] as const;
