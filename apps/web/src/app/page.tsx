// Root page: redirect to /dashboard (middleware handles auth check → /login)
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/dashboard');
}
