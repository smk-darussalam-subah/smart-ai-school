import { Prisma } from '@prisma/client';
import type { ExamList } from './exam-contract';

type Where = Prisma.ExamScheduleWhereInput;
type Sort = Prisma.ExamScheduleOrderByWithRelationInput;
type Phase = NonNullable<ExamList['status']>;
type ArchiveDate = 'completedAt' | 'cancelledAt' | 'opensAt';

const published: Where = { publishedAt: { not: null }, cancelledAt: null };
const active: Where = { ...published, session: { status: 'active' } };

export function examListPlan(input: ExamList, now: Date, studentIdentity?: string) {
  const at = input.cursor && input.asOf ? new Date(input.asOf) : now;
  const asOf = at <= now && now.getTime() - at.getTime() < 900_000 ? at : now;
  const start = new Date(`${input.day}T00:00:00+07:00`);
  const end = new Date(Date.parse(`${input.through ?? input.day}T00:00:00+07:00`) + 86_400_000);
  const span = { gte: start, lt: end };
  const live: Where = { ...active, closesAt: { gt: asOf },
    session: { status: 'active', OR: [{ dueAt: null }, { dueAt: { gt: asOf } }] } };
  const phases: Record<Phase, Where> = {
    ongoing: { ...live, opensAt: { lte: asOf } },
    upcoming: { ...live, opensAt: { gt: asOf } },
    attention: { AND: [active, { OR: [{ closesAt: { lte: asOf } }, { session: { dueAt: { lte: asOf } } }] }] },
    draft: { cancelledAt: null, publishedAt: null, session: { status: 'draft' } },
    completed: { cancelledAt: null, session: { status: 'completed' } },
    cancelled: { cancelledAt: { not: null } },
  };
  const filters: Where[] = [];
  if (input.className) {
    const name = { contains: input.className, mode: 'insensitive' } as const;
    filters.push({ OR: [{ session: { class: { name } } },
      { session: { program: { classes: { some: { class: { name } } } } } }] });
  }
  if (input.subject) filters.push({ package: { subject: { contains: input.subject, mode: 'insensitive' } } });
  if (input.search) {
    const contains = { contains: input.search, mode: 'insensitive' } as const;
    filters.push({ OR: [{ room: contains }, { session: { title: contains } },
      { participants: { some: { roomSlot: { room: contains },
        ...(studentIdentity ? { student: { user: { keycloakId: studentIdentity } } } : {}) } } }] });
  }
  const sort = input.view === 'archive' && input.sort === 'priority' ? 'newest'
    : input.sort ?? (input.view === 'schedule' ? 'priority' : input.view === 'archive' ? 'newest' : 'oldest');
  const timeDirection = sort === 'newest' ? 'desc' : 'asc';
  const makeSort = (key: ArchiveDate): Sort[] => [
    sort === 'title' ? { session: { title: 'asc' } }
      : key === 'completedAt' ? { session: { completedAt: timeDirection } }
        : { [key]: timeDirection },
    { sessionId: 'asc' },
  ];
  if (input.view === 'archive') {
    const groups: { where: Where; key: ArchiveDate }[] = [];
    if (!input.status || input.status === 'cancelled') {
      groups.push({ where: { ...phases.cancelled, cancelledAt: span }, key: 'cancelledAt' });
    }
    if (!input.status || input.status === 'completed') {
      groups.push({ where: { ...phases.completed, session: { status: 'completed', completedAt: span } }, key: 'completedAt' },
        { where: { ...phases.completed, opensAt: span, session: { status: 'completed', completedAt: null } }, key: 'opensAt' });
    }
    return { asOf, filters, sort, groups: sort === 'title' ? [{ where: { OR: groups.map(({ where }) => where) },
      key: 'opensAt' as const, orderBy: makeSort('opensAt') }] : groups.map((group) => ({ ...group, orderBy: makeSort(group.key) })) };
  }
  filters.push({ opensAt: { lt: end }, closesAt: { gt: start } });
  const allowed: Phase[] = input.view === 'schedule' ? ['ongoing', 'attention', 'upcoming', 'draft']
    : ['ongoing', 'attention', 'upcoming', 'draft', 'completed', 'cancelled'];
  const where = (input.status ? allowed.filter((phase) => phase === input.status) : allowed).map((phase) => phases[phase]);
  const groups = sort === 'priority' ? where : [input.status || input.view ? { OR: where } : {}];
  return { asOf, filters, sort, groups: groups.map((entry) => ({ where: entry, key: 'opensAt' as const, orderBy: makeSort('opensAt') })) };
}
