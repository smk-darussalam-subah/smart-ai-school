// ModulAjarView — render READ-ONLY Modul Ajar terstruktur (Rpp.body). Dipakai di
// Review KS (RppBoard) agar reviewer melihat SELURUH bagian, bukan ringkasan.
// Reusable (bisa dipakai pratinjau guru juga). Hanya menampilkan bagian yang terisi.

import type { ModulAjarBody } from '@/app/dashboard/akademik/_components/guru-types';
import { resolveProfileFramework } from '@/app/dashboard/akademik/_components/modul-ajar-profile';
import React from 'react';

const has = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');

export default function ModulAjarView({ body, academicYear }: { body: ModulAjarBody; academicYear?: string | null }) {
  const profileFramework = resolveProfileFramework(academicYear);
  const metaTop = [
    has(body.fase) ? ['Fase', body.fase!] : null,
    body.jpAllocation != null ? ['Alokasi JP', String(body.jpAllocation)] : null,
    body.kktp != null ? ['KKTP', String(body.kktp)] : null,
    has(body.pengembang) ? ['Pengembang', body.pengembang!] : null,
  ].filter(Boolean) as [string, string][];
  const metaSarana = [
    has(body.target) ? ['Target', body.target!] : null,
    has(body.model) ? ['Model', body.model!] : null,
  ].filter(Boolean) as [string, string][];

  return (
    <div className="space-y-3 rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-4 text-[13px] text-slate-700">
      {metaTop.length > 0 && <MetaRow items={metaTop} />}
      <Sec label="Capaian Pembelajaran (CP)" text={body.cp} />
      <Sec label="Kompetensi Awal" text={body.kompetensiAwal} />
      {has(body.tp) && (
        <Block label="Tujuan Pembelajaran">
          <ul className="list-disc space-y-0.5 pl-5">{body.tp!.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </Block>
      )}
      <Sec label="Alur Tujuan Pembelajaran (ATP)" text={body.atpUraian} />
      {has(body.atp) && (
        <Block label="Indikator per TP">
          <div className="space-y-1">
            {body.atp!.map((a, i) => (
              <div key={i} className="rounded-lg bg-white px-2.5 py-1.5">
                {a.tpRef && <span className="font-semibold text-slate-800">{a.tpRef}: </span>}{a.indikator}
              </div>
            ))}
          </div>
        </Block>
      )}
      {has(body.profilDimensi) && (
        <Block label={profileFramework.label}>
          <div className="flex flex-wrap gap-1.5">
            {body.profilDimensi!.map((d) => <span key={d} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700">{d}</span>)}
          </div>
        </Block>
      )}
      <Sec label={profileFramework.activityLabel} text={body.profilUraian} />
      <Sec label="Sarana & Prasarana" text={body.sarana} />
      {metaSarana.length > 0 && <MetaRow items={metaSarana} />}
      {has(body.kegiatan) && (
        <Block label="Kegiatan Pembelajaran">
          <div className="space-y-2">
            {body.kegiatan!.map((k, i) => (
              <div key={i} className="rounded-lg bg-white px-3 py-2">
                {k.pertemuan && <div className="mb-0.5 font-semibold text-slate-800">{k.pertemuan}</div>}
                <KegiatanPart label="Pendahuluan" text={k.pendahuluan} />
                <KegiatanPart label="Inti" text={k.inti ?? k.deskripsi} />
                <KegiatanPart label="Penutup" text={k.penutup} />
                <KegiatanPart label="Diferensiasi" text={k.diferensiasi} />
              </div>
            ))}
          </div>
        </Block>
      )}
      <Sec label="Asesmen" text={body.asesmen} />
      <Sec label="Asesmen Diagnostik" text={body.asesmenDiagnostik} />
      <Sec label="Asesmen Formatif" text={body.asesmenFormatif} />
      <Sec label="Asesmen Sumatif" text={body.asesmenSumatif} />
      <Sec label="Pengayaan" text={body.pengayaan} />
      <Sec label="Remedial" text={body.remedial} />
      <Sec label="Refleksi" text={body.refleksi} />
      <Sec label="Refleksi Guru" text={body.refleksiGuru} />
      <Sec label="Refleksi Peserta Didik" text={body.refleksiSiswa} />
      <Sec label="Lampiran" text={body.lampiran} />
      {has(body.lampiranUrl) && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">URL Lampiran</div>
          <a className="mt-0.5 break-all text-emerald-700 underline" href={body.lampiranUrl} target="_blank" rel="noreferrer">
            {body.lampiranUrl}
          </a>
        </div>
      )}
    </div>
  );
}

function KegiatanPart({ label, text }: { label: string; text?: string }) {
  if (!has(text)) return null;
  return (
    <div className="mt-1">
      <span className="text-[11px] font-bold text-[#6b8079]">{label}: </span>
      <span className="whitespace-pre-wrap leading-relaxed">{text}</span>
    </div>
  );
}

function Sec({ label, text }: { label: string; text?: string }) {
  if (!has(text)) return null;
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{text}</p>
    </div>
  );
}
function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">{label}</div>
      {children}
    </div>
  );
}
function MetaRow({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-2 text-[11.5px]">
      {items.map(([k, v]) => (
        <span key={k} className="rounded-lg bg-white px-2.5 py-1 font-semibold text-slate-600">{k}: <span className="font-normal">{v}</span></span>
      ))}
    </div>
  );
}
