// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://nabilmouzouna.github.io',
  base: '/NubleStation',
  integrations: [
    starlight({
      title: 'NubleStation',
      description: 'Self-hosted, plug-and-play backend infrastructure for small organizations.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo.svg',
        replacesTitle: true,
      },
      favicon: './favicon.svg',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/nabilmouzouna/nublestation',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      editLink: {
        baseUrl: 'https://github.com/nabilmouzouna/nublestation/edit/main/apps/docs/',
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
          ],
        },
        {
          label: 'Core Concepts',
          items: [
            { label: 'Architecture', slug: 'concepts/architecture' },
            { label: 'Multi-tenancy & Isolation', slug: 'concepts/multi-tenancy' },
            { label: 'Apps & API Keys', slug: 'concepts/apps-and-api-keys' },
            { label: 'Networking (Caddy + CoreDNS)', slug: 'concepts/networking' },
          ],
        },
        {
          label: 'Services',
          items: [
            { label: 'API Gateway', slug: 'services/gateway' },
            { label: 'Blaze — Database', slug: 'services/database' },
            { label: 'Identity — Auth', slug: 'services/auth', badge: { text: 'Soon', variant: 'caution' } },
            { label: 'Vault — Storage', slug: 'services/storage', badge: { text: 'Soon', variant: 'caution' } },
            { label: 'Orbit — Deploy', slug: 'services/deploy', badge: { text: 'Live', variant: 'success' } },
          ],
        },
        {
          label: 'SDK',
          items: [
            { label: 'Overview', slug: 'sdk/overview' },
            { label: 'Database Queries', slug: 'sdk/database' },
            { label: 'Real-time Subscriptions', slug: 'sdk/realtime' },
          ],
        },
        {
          label: 'CLI',
          items: [{ label: 'Commands', slug: 'cli/commands' }],
        },
        {
          label: 'Infrastructure',
          items: [
            { label: 'Docker Compose', slug: 'infrastructure/docker-compose' },
            { label: 'Caddy (Reverse Proxy)', slug: 'infrastructure/caddy' },
            { label: 'CoreDNS', slug: 'infrastructure/coredns' },
          ],
        },
        {
          label: 'Security',
          items: [
            { label: 'Row-Level Security', slug: 'security/row-level-security' },
            { label: 'HMAC Request Signing', slug: 'security/hmac-signing' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Platform Database Schema', slug: 'reference/platform-schema' },
            { label: 'Troubleshooting', slug: 'reference/troubleshooting' },
            { label: 'Roadmap', slug: 'reference/roadmap' },
          ],
        },
      ],
    }),
  ],
});
