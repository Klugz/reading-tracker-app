import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trilha de Leitura",
  description: "Organize seus livros, acompanhe cada página e alcance suas metas de leitura.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
