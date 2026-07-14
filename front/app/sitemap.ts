import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/welcome`, priority: 1 },
    { url: `${SITE_URL}/login`, priority: 0.5 },
    { url: `${SITE_URL}/privacy`, priority: 0.2 },
    { url: `${SITE_URL}/terms`, priority: 0.2 },
  ]
}
