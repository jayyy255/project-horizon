import { useEffect, useState } from 'react';

/** Keep native windows in the same theme, including transparent floating shells. */
export function useHorizonTheme() {
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('horizon_theme') !== 'light');
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === 'horizon_theme') setIsDarkMode(event.newValue !== 'light');
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.classList.toggle('light-mode', !isDarkMode);
    document.documentElement.classList.toggle('floating-shell', window.location.hash.includes('bar'));
    localStorage.setItem('horizon_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  return { isDarkMode, setIsDarkMode };
}
