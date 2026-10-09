import nodemailer from "nodemailer";

export interface SendCredentialResult {
  sent: boolean;
  skipped?: boolean;
  error?: string;
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = (process.env.SMTP_SECURE || (port === 465 ? "true" : "false")) === "true";
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

export function isMailConfigured(): boolean {
  return !!getTransport();
}

/**
 * Kirim NIP + password awal ke email pegawai.
 * Bila SMTP belum dikonfigurasi → { sent:false, skipped:true } agar
 * pemanggil (admin) menampilkan password untuk dikirim manual.
 */
export async function sendAccountCredentialEmail(opts: {
  to: string;
  name: string;
  nip: string;
  password: string;
  roleLabel: string;
  unitLabel: string;
}): Promise<SendCredentialResult> {
  const transporter = getTransport();
  if (!transporter) {
    return { sent: false, skipped: true, error: "SMTP belum dikonfigurasi (SMTP_HOST/USER/PASS kosong)" };
  }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER!;
  const appName = "UID Jaya — Monitoring KU";
  const loginUrl = process.env.APP_BASE_URL || "";
  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: `[${appName}] Akun Anda telah dibuat — NIP ${opts.nip}`,
      text:
        `Halo ${opts.name},\n\n` +
        `Akun Anda di ${appName} telah dibuat oleh administrator.\n\n` +
        `NIP: ${opts.nip}\n` +
        `Password awal: ${opts.password}\n` +
        `Role: ${opts.roleLabel}\n` +
        `Unit: ${opts.unitLabel}\n` +
        (loginUrl ? `Login: ${loginUrl}/login\n\n` : `\n`) +
        `Anda WAJIB mengganti password saat login pertama.\n\n` +
        `Abaikan email ini bila Anda tidak merasa mengajukan akun.`,
      html:
        `<p>Halo <b>${escapeHtml(opts.name)}</b>,</p>` +
        `<p>Akun Anda di <b>${escapeHtml(appName)}</b> telah dibuat oleh administrator.</p>` +
        `<table cellpadding="6">` +
        `<tr><td>NIP</td><td><b>${escapeHtml(opts.nip)}</b></td></tr>` +
        `<tr><td>Password awal</td><td><b>${escapeHtml(opts.password)}</b></td></tr>` +
        `<tr><td>Role</td><td>${escapeHtml(opts.roleLabel)}</td></tr>` +
        `<tr><td>Unit</td><td>${escapeHtml(opts.unitLabel)}</td></tr>` +
        `</table>` +
        (loginUrl ? `<p>Login: <a href="${escapeHtml(loginUrl)}/login">${escapeHtml(loginUrl)}/login</a></p>` : ``) +
        `<p>Anda <b>WAJIB</b> mengganti password saat login pertama.</p>` +
        `<p style="color:#888;font-size:12px">Abaikan email ini bila Anda tidak merasa mengajukan akun.</p>`,
    });
    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sendAccountCredentialEmail error:", msg);
    return { sent: false, error: msg };
  }
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Kirim info akun pasca-reset (profil + NIP + password default) ke email kontak.
 * Bila SMTP belum dikonfigurasi → { sent:false, skipped:true } agar
 * pemanggil (super admin) menampilkan password untuk disampaikan manual.
 */
export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  nip: string;
  password: string;
  roleLabel: string;
  unitLabel: string;
}): Promise<SendCredentialResult> {
  const transporter = getTransport();
  if (!transporter) {
    return { sent: false, skipped: true, error: "SMTP belum dikonfigurasi (SMTP_HOST/USER/PASS kosong)" };
  }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER!;
  const appName = "UID Jaya — Monitoring KU";
  const loginUrl = process.env.APP_BASE_URL || "";
  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: `[${appName}] Password Anda telah direset — NIP ${opts.nip}`,
      text:
        `Halo ${opts.name},\n\n` +
        `Password akun ${appName} Anda telah direset oleh administrator atas permintaan lupa sandi.\n\n` +
        `Nama: ${opts.name}\n` +
        `NIP (username): ${opts.nip}\n` +
        `Password default baru: ${opts.password}\n` +
        `Role: ${opts.roleLabel}\n` +
        `Unit: ${opts.unitLabel}\n` +
        (loginUrl ? `Login: ${loginUrl}/login\n\n` : `\n`) +
        `Anda WAJIB mengganti password ini saat login berikutnya.\n\n` +
        `Abaikan email ini bila Anda tidak merasa meminta reset password — segera hubungi administrator.`,
      html:
        `<p>Halo <b>${escapeHtml(opts.name)}</b>,</p>` +
        `<p>Password akun <b>${escapeHtml(appName)}</b> Anda telah direset oleh administrator atas permintaan lupa sandi.</p>` +
        `<table cellpadding="6">` +
        `<tr><td>Nama</td><td><b>${escapeHtml(opts.name)}</b></td></tr>` +
        `<tr><td>NIP (username)</td><td><b>${escapeHtml(opts.nip)}</b></td></tr>` +
        `<tr><td>Password default baru</td><td><b>${escapeHtml(opts.password)}</b></td></tr>` +
        `<tr><td>Role</td><td>${escapeHtml(opts.roleLabel)}</td></tr>` +
        `<tr><td>Unit</td><td>${escapeHtml(opts.unitLabel)}</td></tr>` +
        `</table>` +
        (loginUrl ? `<p>Login: <a href="${escapeHtml(loginUrl)}/login">${escapeHtml(loginUrl)}/login</a></p>` : ``) +
        `<p>Anda <b>WAJIB</b> mengganti password ini saat login berikutnya.</p>` +
        `<p style="color:#888;font-size:12px">Abaikan email ini bila Anda tidak merasa meminta reset — segera hubungi administrator.</p>`,
    });
    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sendPasswordResetEmail error:", msg);
    return { sent: false, error: msg };
  }
}
