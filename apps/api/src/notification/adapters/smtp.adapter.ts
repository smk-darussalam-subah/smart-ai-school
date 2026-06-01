// =============================================================================
// SmtpAdapter — kirim email via SMTP
//
// TODO (Sprint 4 / ketika Nodemailer dikonfirmasi):
//   1. npm install nodemailer @types/nodemailer di apps/api
//   2. Ganti stub di bawah dengan implementasi nyata:
//      import nodemailer from 'nodemailer';
//      const transporter = nodemailer.createTransport({ host, port, auth: { user, pass } });
//      await transporter.sendMail({ from, to, subject, text: body });
//
// Saat ini: hanya throw NotImplementedError agar CI tetap merah
// jika ada yang mencoba kirim email nyata. LogAdapter dipakai untuk dev.
// =============================================================================

import { NotificationAdapter } from '@smk/types';

export class SmtpAdapter implements NotificationAdapter {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    private readonly _host: string,
    private readonly _port: number,
    private readonly _user: string,
    private readonly _pass: string,
  ) {}

  async send(
    _channel: 'whatsapp' | 'email',
    _to: string,
    _body: string,
    _subject?: string,
  ): Promise<void> {
    throw new Error(
      'SmtpAdapter belum diimplementasikan — Nodemailer belum dikonfirmasi direktur (Sprint 4).',
    );
  }
}
