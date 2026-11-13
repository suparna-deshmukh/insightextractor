import type { Metadata, Viewport } from 'next';
import { Figtree, Source_Serif_4 } from 'next/font/google';
// Legacy styles for the old Studio (deleted in Phase 8).
import './globals.css';
import '@/styles/tokens.css';
import '@/styles/base.css';

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Insight Extractor', template: '%s · Insight Extractor' },
  description: 'Describe what you want to understand. We read what real people say online and turn it into a clear report.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const themeScript = `(function(){try{var t=localStorage.getItem('ie:theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
