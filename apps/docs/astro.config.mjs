import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://nabilmouzouna.github.io',
  base: '/NubleStation/',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    mdx(),
  ],
});
