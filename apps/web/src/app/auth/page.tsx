import type { Metadata } from 'next';
import { AuthShell } from './AuthShell';
import { AuthErrorBoundary } from '@/components/auth/AuthErrorBoundary';

export const metadata: Metadata = {
  title: 'Sign In — DIIS',
  description:
    'Sign in to DIIS — Digital Integrated Information System. SMK Darussalam Subah Smart AI School.',
  robots: { index: false, follow: false },
};

export default function AuthPage() {
  return (
    <AuthErrorBoundary>
      <AuthShell />
    </AuthErrorBoundary>
  );
}
