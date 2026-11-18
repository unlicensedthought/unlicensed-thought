export const site = {
  name: 'Unlicensed Thought',
  author: 'Adam Scheurer',
  url: 'https://unlicensedthought.com',
  description:
    'AI evaluation and routing infrastructure, built by someone who came to it from industrial operations.',
  links: {
    github: 'https://github.com/unlicensedthought',
    linkedin: 'https://www.linkedin.com/in/adam-scheurer'
  }
} as const;

export const nav = [
  { href: '/writing/', label: 'Writing' },
  { href: '/work/', label: 'Work' },
  { href: '/about/', label: 'About' }
] as const;

export const abs = (path: string) => new URL(path, site.url).href;
