import type { Metadata } from 'next';
import RoomDisplay from '@/components/display/RoomDisplay';

export const metadata: Metadata = {
  title: 'Display Ruangan · DIIS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function DisplayRoomPage() {
  return <RoomDisplay />;
}
