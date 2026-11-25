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

// Each figure links to the post that holds its receipt; the home page leaves those posts out of its recent list.
export const proof = [
  { figure: '3,380', post: '3380-provider-failures-in-a-row-were-a-policy-failure', text: 'failures in a row to a provider with no credit left, until "stop trying" moved out of the bandit score and into one routing gate' },
  { figure: '6 in a day', post: 'six-guards-that-had-never-been-shown-to-fail', text: 'guards in my own repos that had never been shown to fail; now every gate gets a known-bad input before I trust it' },
  { figure: '1 commit', post: 'a-merge-queue-that-only-ships-what-it-verified', text: 'built, verified and pushed by my merge queue, so trunk only moves to the commit its checks ran on' }
] as const;
