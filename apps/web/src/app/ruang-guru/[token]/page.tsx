import { redirect } from 'next/navigation';
import { legacyDisplayHandoff } from './legacy-handoff';

export const metadata = {
  title: 'Display DIIS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** Legacy bearer URL is intentionally ignored. Pairing replaces token-in-path access. */
export default function LegacyPublicKioskPage() {
  redirect(legacyDisplayHandoff());
}
