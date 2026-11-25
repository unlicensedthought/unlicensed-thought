export const site = {
  name: 'Unlicensed Thought',
  author: 'Adam Scheurer',
  url: 'https://unlicensedthought.com',
  description:
    'AI evaluation and routing infrastructure, built by someone who came to it from industrial operations.',
  links: {
    github: 'https://github.com/unlicensedthought',
    linkedin: 'https://www.linkedin.com/in/adamscheurer/'
  }
} as const;

export const nav = [
  { href: '/start/', label: 'Start here' },
  { href: '/writing/', label: 'Writing' },
  { href: '/portfolio/', label: 'Portfolio' },
  { href: '/about/', label: 'About' }
] as const;

export const abs = (path: string) => new URL(path, site.url).href;
