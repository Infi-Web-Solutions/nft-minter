
import React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

interface ThemeProviderProps {
  children: React.ReactNode;
}

const ThemeProvider = ({ children }: ThemeProviderProps) => {
  return (
    <NextThemesProvider 
      attribute="class" 
      defaultTheme="dark" 
      enableSystem
      storageKey="nftmarket-theme"
    >
      {children}
    </NextThemesProvider>
  );
};

export default ThemeProvider;
