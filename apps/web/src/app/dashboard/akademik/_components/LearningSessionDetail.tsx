'use client';
import React, { useId } from 'react';
import { BookOpen, FileText, Users } from 'lucide-react';
import { wibTodayISO } from '@/lib/bell-times';
import {
  learningRecordStatus,
  learningDate,
  learningTime,
  type LearningSession,
  type LearningContext,
} from '@/lib/learning-recap';
import {
  surface,
  button,
  muted,
  toTeachingGuide,
  ReadProblem,
  type LearningRecapProps as Props,
} from './learning-recap-ui';
export default function LearningDetail({
  row,
  context,
  own,
  props,
  onRetry,
  tab,
  onTabChange: setTab,
  onBeforeAction,
}: {
  row: LearningSession;
  context: LearningContext;
  own: boolean;
  props: Props;
  onRetry: () => void;
  tab: string;
  onTabChange: (tab: string) => void;
  onBeforeAction: (action: string) => void;
}) {
  const id = useId();
  const tabs = [
    ['summary', 'Ringkasan'],
    ['modules', 'Modul Ajar'],
    ['journals', 'Jurnal'],
    ['attendance', 'Absensi'],
    ['assessments', 'Asesmen'],
    ['history', 'Riwayat'],
  ];
  const today = row.serviceDate.slice(0, 10) === wibTodayISO(),
    guide = toTeachingGuide(row);
  const journalAction = own && today && context.capabilities.journal && props.onJournal;
  const attendanceAction =
    own &&
    today &&
    context.capabilities.attendance &&
    props.onAttendance &&
    ['STARTED','COMPLETED'].includes(row.status);
  const parts = [
    {
      key: 'modules',
      title: 'Modul Ajar',
      icon: BookOpen,
      read: context.modules,
      action:
        own && context.capabilities.module && props.onModule
          ? () => props.onModule?.(guide)
          : undefined,
      actionLabel: 'Pilih / susun modul',
      note: 'Modul milik guru pada kelas, mapel, dan semester ini. Tersedia bukan berarti telah digunakan pada pertemuan ini.',
    },
    {
      key: 'journals',
      title: 'Jurnal kelas',
      icon: FileText,
      read: context.journals,
      action: journalAction ? () => props.onJournal?.(guide) : undefined,
      actionLabel: 'Tulis jurnal',
      note: 'Catatan guru pada kelas dan tanggal yang sama. Belum ditautkan ke pertemuan tertentu.',
    },
    {
      key: 'attendance',
      title: 'Absensi harian kelas',
      icon: Users,
      read: context.attendance,
      action: attendanceAction ? () => props.onAttendance?.(guide) : undefined,
      actionLabel: 'Isi / koreksi absensi sesi-JP',
      note: 'Data kehadiran harian kelas pada tanggal ini, bukan absensi terpisah untuk setiap sesi / JP.',
    },
    {
      key: 'assessments',
      title: 'Asesmen penugasan',
      icon: FileText,
      read: context.assessments,
      action:
        own && context.capabilities.assessment && props.onAssessment
          ? () => props.onAssessment?.(guide)
          : undefined,
      actionLabel: 'Buka penilaian',
      note: 'Asesmen pada penugasan mengajar dan semester yang sama. Tidak otomatis menjadi bukti pelaksanaan pertemuan ini.',
    },
  ];
  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Rincian pembelajaran"
        className={`${surface} flex overflow-x-auto p-1`}
      >
        {tabs.map(([value, label], index) => (
          <button
            key={value}
            id={`${id}-${value}-tab`}
            aria-controls={`${id}-${value}`}
            role="tab"
            type="button"
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            className={`min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${tab === value ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100' : 'text-slate-600 dark:text-slate-300'}`}
            onClick={() => setTab(value!)}
            onKeyDown={(e) => {
              let target: number | undefined;
              if (e.key === 'ArrowRight') target = (index + 1) % tabs.length;
              if (e.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
              if (e.key === 'Home') target = 0;
              if (e.key === 'End') target = tabs.length - 1;
              if (target !== undefined) {
                e.preventDefault();
                const next = tabs[target]![0]!;
                setTab(next);
                document.getElementById(`${id}-${next}-tab`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tabs.map(([value, label]) => (
        <div
          key={value}
          role="tabpanel"
          id={`${id}-${value}`}
          aria-labelledby={`${id}-${value}-tab`}
          hidden={tab !== value}
          tabIndex={0}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {value === 'summary' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {parts.map((part) => (
                <section key={part.key} className={`${surface} p-5`}>
                  <h3 className="flex items-center gap-2 font-bold">
                    <part.icon
                      className="h-5 w-5 text-emerald-700 dark:text-emerald-300"
                      aria-hidden="true"
                    />
                    {part.title}
                  </h3>
                  <p className={`${muted} mt-2`}>{part.note}</p>
                  <div className="mt-3">
                    {part.read.state === 'ready' ? (
                      <p className="font-semibold">
                        {part.read.data.length
                          ? `${part.read.data.length} ${part.key === 'attendance' ? 'catatan siswa' : 'catatan tersedia'}`
                          : 'Belum ada catatan'}
                      </p>
                    ) : (
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        {part.read.message}
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={button}
                      onClick={() => {
                        setTab(part.key);
                        document.getElementById(`${id}-${part.key}-tab`)?.focus();
                      }}
                    >
                      Lihat {part.title.toLowerCase()}
                    </button>
                    {part.action && (
                      <button
                        type="button"
                        className={button}
                        data-learning-action={`summary-${part.key}`}
                        onClick={() => {
                          onBeforeAction(`summary-${part.key}`);
                          part.action?.();
                        }}
                      >
                        {part.actionLabel}
                      </button>
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : value === 'history' ? (
            <section className={`${surface} p-5`}>
              <h3 className="font-bold">Riwayat pelaksanaan sesi</h3>
              <p className={`${muted} mt-1`}>
                Hanya waktu tindakan yang tersimpan pada sesi. Membuka dokumen tidak dianggap
                sebagai aktivitas yang telah dicatat.
              </p>
              <ol className="mt-4 space-y-3">
                {(
                  [
                    ['Mulai mengajar', row.startedAt],
                    ['Selesai mengajar', row.completedAt],
                    ['Sesi terlewat', row.missedAt],
                    ['Guru dialihkan', row.reassignedAt],
                    ['Sesi dibatalkan', row.cancelledAt],
                  ] as const
                )
                  .filter((x): x is readonly [(typeof x)[0], string] => !!x[1])
                  .sort((a, b) => a[1].localeCompare(b[1]))
                  .map(([text, time]) => (
                    <li
                      key={text}
                      className="flex flex-wrap gap-3 border-l-2 border-emerald-500 pl-3"
                    >
                      <time className="font-semibold tabular-nums">
                        {learningDate(time)} · {learningTime(time)} WIB
                      </time>
                      <span>{text}</span>
                    </li>
                  ))}
              </ol>
              {!row.startedAt &&
                !row.completedAt &&
                !row.missedAt &&
                !row.reassignedAt &&
                !row.cancelledAt && (
                  <p className="mt-4">Belum ada tindakan pelaksanaan yang tercatat.</p>
                )}
              {row.cancellationReason && (
                <p className="mt-4">Alasan pembatalan: {row.cancellationReason}</p>
              )}
              {row.reassignmentReason && (
                <p className="mt-4">Alasan pengalihan: {row.reassignmentReason}</p>
              )}
            </section>
          ) : (
            <section className={`${surface} p-5`}>
              <h3 className="font-bold">{label}</h3>
              <p className={`${muted} mt-2`}>{parts.find((x) => x.key === value)?.note}</p>
              <div className="mt-4">
                <DetailRecords section={value!} context={context} onRetry={onRetry} />
              </div>
              {parts.find((x) => x.key === value)?.action && (
                <button
                  type="button"
                  className={`${button} mt-4`}
                  data-learning-action={`tab-${value}`}
                  onClick={() => {
                    onBeforeAction(`tab-${value}`);
                    parts.find((x) => x.key === value)?.action?.();
                  }}
                >
                  {parts.find((x) => x.key === value)?.actionLabel}
                </button>
              )}
            </section>
          )}
        </div>
      ))}
    </div>
  );
}
function DetailRecords({
  section,
  context,
  onRetry,
}: {
  section: string;
  context: LearningContext;
  onRetry: () => void;
}) {
  if (section === 'attendance') {
    const read = context.attendance;
    if (read.state !== 'ready') return <ReadProblem read={read} onRetry={onRetry} />;
    if (!read.data.length) return <p>Absensi harian kelas belum tercatat pada tanggal ini.</p>;
    return (
      <>
        <div className="mb-4 flex flex-wrap gap-2">
          {['hadir', 'izin', 'sakit', 'alpha'].map((status) => (
            <span
              key={status}
              className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100"
            >
              {status === 'alpha' ? 'Tanpa keterangan' : status}:{' '}
              <b>{read.data.filter((x) => x.status === status).length}</b>
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Absensi harian kelas</caption>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th scope="col" className="p-2">
                  Nama siswa
                </th>
                <th scope="col" className="p-2">
                  Status
                </th>
                <th scope="col" className="p-2">
                  Keterangan
                </th>
              </tr>
            </thead>
            <tbody>
              {read.data.map((x) => (
                <tr key={x.id} className="border-b border-slate-100 dark:border-slate-800">
                  <th scope="row" className="p-2 font-medium">
                    {x.student.user.fullName}
                  </th>
                  <td className="p-2">{x.status === 'alpha' ? 'Tanpa keterangan' : x.status}</td>
                  <td className="p-2">{x.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }
  const read =
    section === 'modules'
      ? context.modules
      : section === 'journals'
        ? context.journals
        : context.assessments;
  if (read.state !== 'ready') return <ReadProblem read={read} onRetry={onRetry} />;
  if (!read.data.length) return <p>Belum ada catatan yang sesuai dengan konteks ini.</p>;
  return (
    <div className="space-y-3">
      {read.data.map((item) => (
        <article
          key={item.id}
          className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
        >
          <h4 className="break-words font-semibold">{item.title}</h4>
          {'status' in item && (
            <p className={`${muted} mt-1`}>Status: {learningRecordStatus(item.status)}</p>
          )}
          {'description' in item && item.description && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {item.description}
            </p>
          )}
          {'content' in item && item.content && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {item.content}
            </p>
          )}
          {'body' in item && item.body && (
            <div className="mt-3 space-y-3 text-sm leading-relaxed">
              {item.body.cp && (
                <div>
                  <h5 className="font-semibold">Capaian pembelajaran</h5>
                  <p className="whitespace-pre-wrap break-words">{item.body.cp}</p>
                </div>
              )}
              {item.body.tp?.length ? (
                <div>
                  <h5 className="font-semibold">Tujuan pembelajaran</h5>
                  <ul className="list-disc space-y-1 pl-5">
                    {item.body.tp.map((tp, index) => (
                      <li key={index}>{tp}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {item.body.kegiatan?.map((k, index) => (
                <div key={index}>
                  <h5 className="font-semibold">
                    {k.pertemuan || `Rencana kegiatan ${index + 1}`}
                  </h5>
                  {[k.pendahuluan, k.inti, k.penutup].filter(Boolean).map((text, i) => (
                    <p key={i} className="mt-1 whitespace-pre-wrap break-words">
                      {text}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
