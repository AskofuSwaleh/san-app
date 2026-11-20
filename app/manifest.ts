import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kenya High Sanatorium',
    short_name: 'SanApp',
    description: 'Digital sanatorium pass system for Kenya High School',
    start_url: '/',
    display: 'standalone', // This makes it open without the browser address bar
    background_color: '#111827', // Dark mode background
    theme_color: '#2563eb', // Blue button color
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
