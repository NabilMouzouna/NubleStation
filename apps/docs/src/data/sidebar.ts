export interface SidebarItem {
  title: string;
  slug: string;
  badge?: { text: string; color: string };
}

export interface SidebarGroup {
  title: string;
  items: SidebarItem[];
}

export const sidebar: SidebarGroup[] = [
  {
    title: 'AI Agents',
    items: [
      { title: 'AGENT.md', slug: 'agent', badge: { text: 'AI', color: '#7c3aed' } },
    ],
  },
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', slug: 'getting-started/introduction' },
      { title: 'Installation', slug: 'getting-started/installation' },
      { title: 'Quick Start', slug: 'getting-started/quick-start' },
    ],
  },
  {
    title: 'Services',
    items: [
      { title: 'Gateway', slug: 'services/gateway' },
      { title: 'Orbit — Deploy', slug: 'services/deploy', badge: { text: 'Live', color: '#059669' } },
      { title: 'Blaze — Database', slug: 'services/database', badge: { text: 'Live', color: '#059669' } },
      { title: 'Vault — Storage', slug: 'services/storage', badge: { text: 'Live', color: '#059669' } },
      { title: 'Vault — Access Control', slug: 'services/storage-access', badge: { text: 'Live', color: '#059669' } },
      { title: 'Identity — Auth', slug: 'services/auth', badge: { text: 'Live', color: '#059669' } },
    ],
  },
  {
    title: 'CLI',
    items: [
      { title: 'Commands', slug: 'cli/commands' },
    ],
  },
  {
    title: 'Core Concepts',
    items: [
      { title: 'Architecture', slug: 'concepts/architecture' },
      { title: 'Networking', slug: 'concepts/networking' },
      { title: 'Multi-tenancy', slug: 'concepts/multi-tenancy' },
      { title: 'Apps & API Keys', slug: 'concepts/apps-and-api-keys' },
      { title: 'Sessions & SSO', slug: 'concepts/sessions-and-sso' },
    ],
  },
  {
    title: 'Infrastructure',
    items: [
      { title: 'Docker Compose', slug: 'infrastructure/docker-compose' },
      { title: 'Caddy', slug: 'infrastructure/caddy' },
      { title: 'CoreDNS', slug: 'infrastructure/coredns' },
      { title: 'DNS Doctor', slug: 'infrastructure/dns-doctor' },
    ],
  },
  {
    title: 'Security',
    items: [
      { title: 'HMAC Signing', slug: 'security/hmac-signing' },
      { title: 'Row-Level Security', slug: 'security/row-level-security' },
    ],
  },
  {
    title: 'SDK',
    items: [
      { title: 'Overview', slug: 'sdk/overview' },
      { title: '@nublestation/client', slug: 'sdk/client', badge: { text: 'Live', color: '#059669' } },
      { title: '@nublestation/vault', slug: 'sdk/storage', badge: { text: 'Live', color: '#059669' } },
      { title: '@nublestation/identity', slug: 'sdk/auth', badge: { text: 'Live', color: '#059669' } },
      { title: '@nublestation/blaze', slug: 'sdk/database', badge: { text: 'Live', color: '#059669' } },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'Platform Schema', slug: 'reference/platform-schema' },
      { title: 'Troubleshooting', slug: 'reference/troubleshooting' },
      { title: 'Roadmap', slug: 'reference/roadmap' },
    ],
  },
];
