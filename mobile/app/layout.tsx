import type { Metadata, Viewport } from 'next';
import './globals.css';

const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const siteOrigin = vercelHost
  ? `https://${vercelHost}`
  : 'https://teachable-machine-mobile-tj.tj60647.chatgpt.site';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: 'Teachable Machine Mobile',
  description:
    'Collect image samples, train a model on your phone, and see live predictions. Your samples stay on your device.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Teachable Machine Mobile',
    description: 'Collect. Train. Try it. Machine learning on your phone.',
    type: 'website',
    images: [
      {
        url: `${siteOrigin}/og.png`,
        width: 1730,
        height: 909,
        alt: 'Teachable Machine Mobile — Collect. Train. Try it.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Teachable Machine Mobile',
    description: 'Collect. Train. Try it. Machine learning on your phone.',
    images: [`${siteOrigin}/og.png`],
  },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1967d2',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
