import type { Post } from './content';

type Entry = { slug: string; proves: string };
type Group = { title: string; why: string; entries: Entry[] };

export const groups: Group[] = [
  {
    title: 'Agents need a leash you can test',
    why: 'Agents write code faster than anyone can review it, so the checks around them have to be shown to fail on bad input, not just shown to exist.',
    entries: [
      { slug: 'six-guards-that-had-never-been-shown-to-fail', proves: 'Most of my own guards had never blocked anything, and one habit found that out.' },
      { slug: 'a-commit-gate-you-can-watch-fail', proves: 'Each gate is published with the bad input it blocks.' },
      { slug: 'a-merge-queue-that-only-ships-what-it-verified', proves: 'Trunk only moves to the exact commit the checks ran on.' },
      { slug: 'three-p0s-that-looked-wired', proves: 'Code that looks wired up can be a stub that returns true.' },
      { slug: 'mutation-testing-scoped-to-a-diff', proves: 'A green suite is checked against the bugs it should catch.' }
    ]
  },
  {
    title: 'Routing models when providers fail',
    why: 'Running across many providers means planning for their failures, their prices and their quirks.',
    entries: [
      { slug: '3380-provider-failures-in-a-row-were-a-policy-failure', proves: 'A learning router needs a rule for a provider that is down, not just a score.' },
      { slug: 'cost-in-the-reward-once', proves: 'Cost goes into the routing reward once, measured on real calls.' },
      { slug: 'temperature-does-nothing-on-reasoning-models', proves: 'The same parameter means different things per provider, and a library that handles it.' },
      { slug: 'my-abortsignal-was-correct-and-the-call-still-hung', proves: 'A correct timeout still hung, and the deadline that does not.' }
    ]
  },
  {
    title: 'Evals that refuse to pass by accident',
    why: 'An evaluation that fails open is worse than none, because it is trusted.',
    entries: [
      { slug: 'how-goldenwatch-refuses-a-release', proves: 'Six quiet ways a golden-set check goes wrong, each refused.' },
      { slug: 'a-test-that-refuses-to-ship-an-llm-stage', proves: 'An LLM stage with no measured verdict cannot pass the test suite.' },
      { slug: 'caching-made-my-rewrite-pipeline-cost-more', proves: 'Measuring before trusting the obvious optimization.' },
      { slug: 'a-red-team-that-has-to-quote-its-sources', proves: 'One unsourced quote fails the whole red-team run.' },
      { slug: 'an-on-device-llm-as-autocorrect', proves: 'What a small on-device model can and cannot be trusted with.' }
    ]
  },
  {
    title: 'Heavy work on small hardware',
    why: 'Running many agents on a few machines takes admission control, not hope.',
    entries: [
      { slug: 'admission-by-reservation-not-instantaneous-load', proves: 'Jobs reserve their peak before they start, so a machine is never overbooked.' },
      { slug: 'a-durable-object-in-front-of-a-gpu-node', proves: 'Queueing and recovery in front of a GPU box that sleeps and drops off.' },
      { slug: 'testing-firmware-logic-on-a-laptop-with-a-port', proves: 'Moving logic behind an interface so it can be tested without the hardware.' }
    ]
  },
  {
    title: 'Keeping the surface safe',
    why: 'Data, access and dependencies are where a fast-moving system leaks.',
    entries: [
      { slug: 'redact-before-the-model-restore-after', proves: 'Personal data never reaches the model, and the test plants it to prove so.' },
      { slug: '80-access-apps-and-one-wildcard', proves: 'Access provisioned from config and audited as a whole.' },
      { slug: 'patching-a-redos-in-picomatch-without-forking-the-world', proves: 'Fixing an upstream advisory with the smallest possible change.' },
      { slug: 'porting-a-python-gate-to-go-with-golden-files', proves: 'Replacing a tool with byte-for-byte proof that nothing changed.' }
    ]
  }
];

export function resolve(all: Post[]) {
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  const listed = new Set<string>();
  const out = groups.map((g) => ({
    ...g,
    entries: g.entries.map((e) => {
      const post = bySlug.get(e.slug);
      if (!post) throw new Error(`start page lists unknown post ${e.slug}`);
      if (listed.has(e.slug)) throw new Error(`start page lists ${e.slug} twice`);
      listed.add(e.slug);
      return { ...e, post };
    })
  }));
  const missing = all.filter((p) => !p.draft && !listed.has(p.slug)).map((p) => p.slug);
  if (missing.length) throw new Error(`start page is missing published posts: ${missing.join(', ')}`);
  return out;
}
