// Every figure here comes from a repo README, a published post or the career record. Nothing is estimated.
export type CaseStudy = {
  id: string;
  name: string;
  kicker: string;
  href?: string;
  linkLabel?: string;
  headline: string;
  problem: string;
  role: string;
  actions: string[];
  results: { figure: string; text: string }[];
  constraints: string[];
  open?: string[];
  stack: string;
};

export const headline = {
  label: 'Portfolio',
  title: 'AI evaluation and cost-aware routing infrastructure',
  lede: 'Two open-source tools that keep LLM features honest, and the operations data work that taught me why they matter: systems that say when they cannot do the job, measured against a baseline.'
} as const;

export const expertise = [
  'LLM evaluation and release gates',
  'Cost-aware model routing',
  'Enterprise data reconciliation',
  'IT/OT and field systems',
  'Adoption with skeptical users'
] as const;

// Grouped by how the systems are built; each tool is named with what it was used for.
// "where" says whether it ran in production at an employer or is open-source work.
export const capabilities = [
  {
    area: 'LLM evaluation',
    where: 'Open source',
    items: [
      'Golden-set regression gates that fail closed on budget cuts, outages, edited sets and crashed jobs (TypeScript, goldenwatch).',
      'Power analysis for eval sets: how many cases it takes to see the drop you care about.'
    ]
  },
  {
    area: 'Model routing and inference cost',
    where: 'Open source',
    items: [
      'Thompson-sampling routing with cost in the reward, cost-tier cascades and per-provider circuit breakers (TypeScript, Node and Cloudflare Workers, armwright).',
      'Daily budget breakers on a key-value store, and seeded replay harnesses that compare a policy against baselines and an oracle.'
    ]
  },
  {
    area: 'Data infrastructure and reconciliation',
    where: 'Production, Nutrien',
    items: [
      'Ten operational sources unified into one product view, with three systems reconciled in Power Query and surfaced in Power BI.',
      'A data-quality tool deployed to AWS with an enterprise architect, mapping each error to its system and owning team.'
    ]
  },
  {
    area: 'IT/OT and field systems',
    where: 'Production, Chevron and CAT Scale',
    items: [
      'Device compliance and parallel provisioning for SCADA and Rockwell automation software across 80+ field technicians.',
      'Remote support and documentation for a 1,000+ location industrial weighing network.'
    ]
  },
  {
    area: 'Delivery and adoption',
    where: 'Production, Nutrien',
    items: [
      'Backlogs of epics and stories across 24 sprints; SOPs, RACI and governed intake built with MS Forms and SharePoint.',
      'Field immersions and train-the-trainer programs that grew adoption among users who did not trust the data.'
    ]
  }
] as const;

export const glance = [
  { figure: '34 of 34', text: 'deliberate breakages of my commit gates, each caught by a failing test' },
  { figure: '80 apps', text: 'sharing one domain wildcard, replaced by a provisioner that refuses to write one' },
  { figure: '6 h, twice', text: 'a model call hung behind a correct AbortController; its deadline now runs on a timer that does not need the signal' },
  { figure: '6 named', text: 'ways an eval check goes quietly wrong, each refused by goldenwatch' }
] as const;

export const cases: CaseStudy[] = [
  {
    id: 'goldenwatch',
    name: 'goldenwatch',
    kicker: 'Open source · LLM evaluation',
    href: 'https://github.com/unlicensedthought/goldenwatch',
    linkLabel: 'Code and README',
    headline: 'A golden-set regression gate that refuses to report a number about a test nobody ran.',
    problem:
      'Most eval scripts fail open. A run that hit its token budget, a provider outage, an edited golden set or a crashed job all come back looking like a score, so a regression ships or a false alarm burns a day.',
    role: 'Sole author: design, implementation, tests and documentation.',
    actions: [
      'Made each quiet-failure case its own outcome: incomplete (budget or outages over 5%), incomparable (dataset hash changed), and a "could not run" notice when the job crashes.',
      'Counted provider failures as outages, not wrong answers, so an outage cannot pose as a regression.',
      'Named a tag as the cause only when its fall is beyond chance.',
      'Added detectionPower and casesNeeded so a team can see whether its set could catch the drop it cares about at all.'
    ],
    results: [
      { figure: '30%', text: 'chance a 38-case set catches a 5-point drop, for a feature at 90% agreement (power maths; 253 cases for a fair shot)' },
      { figure: '12', text: 'tests; zero runtime dependencies; runs on Node and edge runtimes' }
    ],
    constraints: [
      'The gate uses a fixed tolerance (3 points by default), not a significance test on the overall drop.',
      'Power figures use a normal approximation; rough below about 30 cases or above about 97% agreement.'
    ],
    open: ['Grading is supplied by the caller; there is no built-in LLM judge yet.', 'Cases run one at a time, in order.'],
    stack: 'TypeScript · Apache-2.0'
  },
  {
    id: 'armwright',
    name: 'armwright',
    kicker: 'Open source · model routing',
    href: 'https://github.com/unlicensedthought/armwright',
    linkLabel: 'Code and README',
    headline: 'A router that learns which model to send each kind of task to, and counts cost exactly once.',
    problem:
      'Static routing tables go stale as prices, quality and availability move, and a degraded or retired model keeps getting traffic until someone notices.',
    role: 'Sole author: design, implementation, the simulation harness and tests.',
    actions: [
      'Thompson sampling per task type, with cost folded into the reward once: a success is worth C / (C + cost).',
      'A fixed gate before dispatch (policy, liveness, budget, admission) whose refusals name their stage.',
      'A deterministic cost-tier cascade above the bandit, a per-provider circuit breaker, daily budget breakers on any key-value store, and dead-model detection that never trusts one provider error message.'
    ],
    results: [
      { figure: '$0.0041', text: 'cost per success with a tight cost ceiling, against $0.0043 for an oracle told the best model (simulation)' },
      { figure: '$5.00', text: 'held exactly under a $5/day provider cap, with traffic rerouted after call 3,741 (simulation)' }
    ],
    constraints: [
      'All figures are from a seeded 20,000-call replay against four synthetic models. It is a simulation, labeled as one, not a production measurement.'
    ],
    open: [
      'With default settings it spends about half of always-frontier and gives up 2.5 points of success; the cost ceiling has to be set near real prices to pay off.'
    ],
    stack: 'TypeScript · Node and Cloudflare Workers · Apache-2.0'
  },
  {
    id: 'operations-data',
    name: 'Field-operations data product',
    kicker: 'Nutrien · digital supply chain (contract)',
    headline: 'One trusted view of whether field equipment pays for itself, built from ten hand-tracked sources.',
    problem:
      'Retail division and branch managers run their own profit and loss, but equipment utilization, lease end dates, rates paid and charge rates lived in ten separate, hand-tracked sources. Nobody could see break-even on custom application, and the users did not trust the data.',
    role:
      'Operations Optimization Coordinator. I managed the product and its users, working alongside the project’s dedicated product owner, and authored nearly all of its epics and stories across 24 sprints.',
    actions: [
      'Consolidated ten data sources into a single product view tied to each division’s P&L.',
      'Reconciled three of those systems in Power Query, replacing a 32.5-hour manual reconciliation with a 2-minute refresh.',
      'Replaced a legacy data-quality tool, with an enterprise architect, so error messages named the failing system and the owning division or branch.',
      'Wrote a logic library documenting how every metric derives from its sources, which became onboarding for new team members.',
      'Drove adoption through field immersions across six divisions, train-the-trainer runs and refresher training.',
      'Integrated fleet telemetry and equipment-operations data to extend the view toward route-to-delivery P&L.'
    ],
    results: [
      { figure: '$7.8M', text: 'exposure surfaced in a month of invoices; $1.0M recoverable through quick clerical fixes' },
      { figure: '8 h → 1 h', text: 'data-quality analysis per sustainment team member per week, and the error queue cleared' },
      { figure: '13 → 36', text: 'divisions in scope as the program grew (24 sustainment plus 12 readiness)' }
    ],
    constraints: [
      'The tool could not be bespoke to each division, so adoption came from relationships matched to each one’s operating conditions.',
      'Employer work: described in words only, with no screenshots or internal data.'
    ],
    stack: 'Power Query · Power BI · SharePoint · Power Platform · AWS'
  }
];

export const supporting = [
  {
    where: 'Chevron · SCADA and automation infrastructure (contract)',
    when: '2023–2024',
    points: [
      'Unmanaged devices from 95% to under 5% across 80+ field technicians on SCADA and Rockwell automation software.',
      'Provisioning moved from 4 hours per device, one at a time, to 10+ devices in about 45 minutes in parallel batches.',
      '15+ technical SOPs covering provisioning, SCADA application deployment and compliance controls.'
    ]
  },
  {
    where: 'John Deere · dealer application support (contract)',
    when: '2021–2023',
    points: [
      'Tier 1 escalations down 15% through root-cause analysis across 15+ dealer-facing web applications.',
      'Liaison between 1,900+ US dealer locations and the product teams; 90% customer satisfaction and 20% faster average resolution.'
    ]
  },
  {
    where: 'CAT Scale · national weighing network',
    when: '2019–2021',
    points: ['Remote technical support across 1,000+ locations; 35+ troubleshooting and maintenance documents.']
  },
  {
    where: 'Earlier',
    when: '2007–2017',
    points: [
      'Production lead for a 12-person team at Anderson Corporation, with a 15% productivity gain from Lean and 5S.',
      'Systems administration and DoD security compliance in the US Army Reserves.'
    ]
  }
] as const;

export const bridge =
  'The operations work and the AI tools solve the same problem. A reconciliation that quietly drops invoices and an eval that quietly scores half a test set fail the same way: they report success when they could not do the job. In the field I learned to make those failures loud and measurable against a baseline. goldenwatch and armwright apply that to LLM systems.';
