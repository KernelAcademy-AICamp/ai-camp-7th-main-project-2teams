import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/welcome', '/login', '/privacy', '/terms'],
      disallow: ['/api', '/onboarding', '/import', '/settings', '/goodbye'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
