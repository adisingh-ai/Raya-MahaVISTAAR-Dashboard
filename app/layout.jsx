import './globals.css';

export const metadata = {
  title: 'MahaVISTAAR call analytics',
  description: 'Call analytics for the MahaVISTAAR Voice AI agent on RAYA',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
