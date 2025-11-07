import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'texxt',
  description: 'Editor de texto colaborativo em tempo real',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-theme="light">
      <body>{children}</body>
    </html>
  );
}

