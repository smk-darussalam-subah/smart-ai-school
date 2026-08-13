import Link from 'next/link';
import { BookCheck, CalendarDays, ClipboardList, FileCheck2 } from 'lucide-react';
import TeachingAssignmentManager, {
  type TeachingAssignmentItem,
  type TeachingAssignmentOptions,
} from './TeachingAssignmentManager';

interface Props {
  assignments: TeachingAssignmentItem[];
  assignmentTotal: number;
  options: TeachingAssignmentOptions;
  canManageAssignments: boolean;
  canDeleteAssignments: boolean;
  workflowAccess: {
    schedule: boolean;
    report: boolean;
    activities: boolean;
    reviewRpp: boolean;
  };
}

const WORKFLOWS = [
  { key: 'schedule', href: '/dashboard/jadwal', label: 'Jadwal', icon: CalendarDays },
  { key: 'report', href: '/dashboard/rapor', label: 'Rapor', icon: BookCheck },
  { key: 'activities', href: '/dashboard/kegiatan', label: 'Kegiatan Kelas', icon: ClipboardList },
  { key: 'reviewRpp', href: '/dashboard/rpp', label: 'Review Modul Ajar', icon: FileCheck2 },
] as const;

export default function AcademicOperationsWorkspace({
  assignments,
  assignmentTotal,
  options,
  canManageAssignments,
  canDeleteAssignments,
  workflowAccess,
}: Props) {
  const availableWorkflows = WORKFLOWS.filter((workflow) => workflowAccess[workflow.key]);

  return (
    <div className="space-y-7">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium text-emerald-700">Operasional Akademik</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Akademik</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Guru, kelas, mata pelajaran, tahun ajaran, dan beban JP.
        </p>
        {options.scope?.type === 'major' && (
          <p className="mt-2 text-sm font-medium text-emerald-700">
            Lingkup jurusan aktif: {options.scope.labels.join(', ')}
          </p>
        )}
      </header>

      {availableWorkflows.length > 0 && (
        <nav
          aria-label="Alur akademik terkait"
          className="grid border-y border-slate-200 sm:grid-cols-2 xl:grid-cols-4"
        >
          {availableWorkflows.map(({ href, label, icon: Icon }, index) => (
            <Link
              key={href}
              href={href}
              className={`group flex min-h-16 items-center gap-3 px-4 py-4 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${index > 0 ? 'sm:border-l sm:border-slate-200' : ''}`}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-500 group-hover:text-emerald-700" />
              <span className="font-medium text-slate-900">{label}</span>
            </Link>
          ))}
        </nav>
      )}

      <TeachingAssignmentManager
        initialItems={assignments}
        initialTotal={assignmentTotal}
        options={options}
        canManage={canManageAssignments}
        canDelete={canDeleteAssignments}
      />
    </div>
  );
}
