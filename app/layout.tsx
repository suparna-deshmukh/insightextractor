import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Insight Extractor — Agentic User Insights for Product Managers',
  description: 'Type a topic. The agent plans with Gemini, taps every platform you pick, buckets the signal with LLM + SQL, and delivers a fixed-format User Insights Report — on a strict shared 3-calls-per-run Gemini budget.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
