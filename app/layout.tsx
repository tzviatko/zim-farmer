import type { Metadata, Viewport } from 'next'
import { Inter, DM_Mono } from 'next/font/google'
import BottomNav from '../components/BottomNav'
import SwRegister from './sw-register'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })
const dmMono = DM_Mono({
  variable: '--font-dm-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'ZIM FARMER',
  description: 'Holistic farm management',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ZIM FARMER',
  },
}

export const viewport: Viewport = {
  themeColor: '#3B6D11',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${dmMono.variable} h-full antialiased`}>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-full flex flex-col bg-[#F5F5F0]">
        {children}
        <BottomNav />
        <SwRegister />
      </body>
    </html>
  )
}
