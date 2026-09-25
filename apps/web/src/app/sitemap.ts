import type { MetadataRoute } from 'next';

const baseUrl = 'https://smkdarussalamsubah.sch.id';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: baseUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/diis`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/spmb`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/jurusan/tkro`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/jurusan/tjkt`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/jurusan/akl`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly', priority: 0.4 },
  ];
}
