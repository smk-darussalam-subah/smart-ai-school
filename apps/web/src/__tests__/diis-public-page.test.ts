import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const webRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), 'utf8');

describe('DIIS public experience contract', () => {
  const pageSource = readSource('src/app/diis/page.tsx');
  const navSource = readSource('src/components/landing/LandingNav.tsx');
  const teaserSource = readSource('src/components/landing/DiisTeaser.tsx');
  const roleSource = readSource('src/components/diis/DiisRoleLens.tsx');

  it('keeps the public page static and free from private API or session reads', () => {
    expect(pageSource).toContain("export const dynamic = 'force-static'");
    expect(pageSource).not.toMatch(/fetch\s*\(/);
    expect(pageSource).not.toMatch(/getServerSession|cookies\s*\(|\/api\/backend/);
  });

  it('provides the required public navigation and calls to action', () => {
    expect(navSource).toContain("{ href: '/diis', label: 'DIIS' }");
    expect(teaserSource).toContain('href="/diis"');
    expect(teaserSource).toContain('href="/login"');
    expect(pageSource).toContain('href="#cara-kerja"');
    expect(pageSource).toContain('href="/privacy"');
  });

  it('keeps internal evidence language out of the public page', () => {
    expect(pageSource).not.toContain('data contoh');
    expect(pageSource).not.toContain('Bukan daftar janji');
    expect(pageSource).not.toContain('Visualisasi produk');
  });

  it('shows role and install mockups without cropping them', () => {
    expect(roleSource).toContain('className="object-contain"');
    expect(pageSource).toContain('className="object-contain"');
  });

  it.each(['guru', 'siswa', 'orang-tua', 'tata-usaha', 'pimpinan', 'industri'])(
    'includes the %s role lens',
    (role) => {
      expect(roleSource).toContain(`id: '${role}'`);
    },
  );

  it('ships every referenced DIIS visual as a non-empty local asset', () => {
    const assets = [
      'connected-school-day.webp',
      'product-overview.webp',
      'executive-dashboard.webp',
      'teacher-workflow.webp',
      'parent-experience.webp',
      'student-experience.webp',
      'opengraph-diis.webp',
    ];

    for (const asset of assets) {
      const assetPath = path.join(webRoot, 'public/diis', asset);
      expect(existsSync(assetPath)).toBe(true);
      expect(statSync(assetPath).size).toBeGreaterThan(10_000);
    }
  });
});
