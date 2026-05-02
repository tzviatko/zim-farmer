import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ZIM FARMER',
    short_name: 'ZIM FARMER',
    description: 'Cattle registry',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F5F0',
    theme_color: '#3B6D11',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}
