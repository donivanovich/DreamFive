import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { AppLanguage } from '@dreamfive/shared';
import nodemailer, { type Transporter } from 'nodemailer';

import { API_ENV } from '../../config/app-config.module.js';
import type { ApiEnv } from '../../config/env.schema.js';

const DREAMFIVE_LOGO_CID = 'dreamfive-logo';

function loadEmailLogoBuffer(): Buffer | null {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, '../../assets/dreamfive-logo.png'),
    path.resolve(process.cwd(), 'dist/assets/dreamfive-logo.png'),
    path.resolve(process.cwd(), 'src/assets/dreamfive-logo.png'),
    path.resolve(process.cwd(), 'apps/api/src/assets/dreamfive-logo.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate);
    }
  }
  return null;
}

function resolveSmtpHost(env: ApiEnv): string {
  return env.SMTP_HOST.trim();
}

function resolveSmtpFrom(env: ApiEnv): string {
  const user = env.SMTP_USER?.trim();
  const configured = env.SMTP_FROM.trim();
  if (user && user.includes('@') && /\.local\b/i.test(configured)) {
    return `DreamFive <${user}>`;
  }
  return configured;
}

export interface CapturedEmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly code?: string;
  readonly resetToken?: string;
  readonly resetUrl?: string;
  readonly sentAt: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly logoBuffer: Buffer | null;
  private readonly testOutbox: CapturedEmailMessage[] = [];

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    this.logoBuffer = loadEmailLogoBuffer();
    if (env.NODE_ENV === 'test') {
      this.transporter = null;
    } else {
      const host = resolveSmtpHost(env);
      const user = env.SMTP_USER?.trim() ?? '';
      const pass = env.SMTP_PASS?.trim() ?? '';
      const hasAuth = user.length > 0 && pass.length > 0;
      const useImplicitTls =
        env.SMTP_PORT === 465 ? true : env.SMTP_PORT === 587 ? false : env.SMTP_SECURE;

      this.transporter = nodemailer.createTransport({
        host,
        port: env.SMTP_PORT,
        secure: useImplicitTls,
        ...(!useImplicitTls && (hasAuth || env.SMTP_PORT === 587) ? { requireTLS: true } : {}),
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        ...(hasAuth
          ? {
              auth: {
                user,
                pass,
              },
            }
          : {}),
      });
      this.logger.log(
        `Transporte SMTP inicializado (${host}:${String(env.SMTP_PORT)}, tls=${String(useImplicitTls)}, auth=${String(hasAuth)})`,
      );
    }
  }

  getTestOutbox(): readonly CapturedEmailMessage[] {
    return [...this.testOutbox];
  }

  clearTestOutbox(): void {
    this.testOutbox.length = 0;
  }

  async sendRegistrationVerificationEmail(params: {
    readonly to: string;
    readonly username: string;
    readonly code: string;
    readonly expiresAt: Date;
    readonly language?: AppLanguage;
  }): Promise<void> {
    const isEs = params.language === 'es';
    const subject = isEs
      ? `DreamFive · Código de verificación (${params.code})`
      : `DreamFive · Verification code (${params.code})`;
    const text = isEs
      ? `Hola ${params.username},\n\nTu código de verificación de 6 dígitos para activar tu cuenta DreamFive es: ${params.code}\n\nCaduca a las ${params.expiresAt.toISOString()}.\n`
      : `Hi ${params.username},\n\nYour 6-digit verification code to activate your DreamFive account is: ${params.code}\n\nIt expires at ${params.expiresAt.toISOString()}.\n`;
    const html = renderEmailShell({
      hasLogo: Boolean(this.logoBuffer),
      title: isEs ? 'Activa tu cuenta DreamFive' : 'Activate your DreamFive account',
      greeting: isEs
        ? `Hola ${escapeHtml(params.username)},`
        : `Hi ${escapeHtml(params.username)},`,
      body: isEs
        ? 'Introduce este código de verificación de 6 dígitos para confirmar tu correo electrónico y entrar en DreamFive.'
        : 'Enter this 6-digit verification code to confirm your email address and sign in to DreamFive.',
      code: params.code,
      footer: isEs ? 'Este código caduca en 15 minutos.' : 'This code expires in 15 minutes.',
    });

    await this.deliver({
      to: params.to,
      subject,
      text,
      html,
      code: params.code,
    });
  }

  async sendEmailChangeVerificationEmail(params: {
    readonly to: string;
    readonly username: string;
    readonly code: string;
    readonly expiresAt: Date;
    readonly language?: AppLanguage;
  }): Promise<void> {
    const isEs = params.language === 'es';
    const subject = isEs
      ? `DreamFive · Confirma tu nuevo correo (${params.code})`
      : `DreamFive · Confirm your new email (${params.code})`;
    const text = isEs
      ? `Hola ${params.username},\n\nTu código de 6 dígitos para confirmar tu nuevo correo en DreamFive es: ${params.code}\n\nCaduca a las ${params.expiresAt.toISOString()}.\n`
      : `Hi ${params.username},\n\nYour 6-digit code to confirm your new DreamFive email address is: ${params.code}\n\nIt expires at ${params.expiresAt.toISOString()}.\n`;
    const html = renderEmailShell({
      hasLogo: Boolean(this.logoBuffer),
      title: isEs ? 'Confirma tu nuevo correo' : 'Confirm your new email address',
      greeting: isEs
        ? `Hola ${escapeHtml(params.username)},`
        : `Hi ${escapeHtml(params.username)},`,
      body: isEs
        ? 'Has solicitado cambiar el correo asociado a tu cuenta DreamFive. Introduce este código de 6 dígitos en tu perfil para completar el cambio.'
        : 'You requested to update the email address on your DreamFive account. Enter this 6-digit code in your profile to complete the change.',
      code: params.code,
      footer: isEs
        ? 'Si no solicitaste este cambio, ignora este mensaje.'
        : 'If you did not request this change, you can safely ignore this message.',
    });

    await this.deliver({
      to: params.to,
      subject,
      text,
      html,
      code: params.code,
    });
  }

  async sendPasswordResetEmail(params: {
    readonly to: string;
    readonly username: string;
    readonly resetToken: string;
    readonly resetUrl: string;
    readonly expiresAt: Date;
    readonly language?: AppLanguage;
  }): Promise<void> {
    const isEs = params.language === 'es';
    const subject = isEs ? 'DreamFive · Cambiar contraseña' : 'DreamFive · Change your password';
    const text = isEs
      ? `Hola ${params.username},\n\nHaz clic en el siguiente enlace único para cambiar tu contraseña en DreamFive:\n${params.resetUrl}\n\nCaduca a las ${params.expiresAt.toISOString()}.\n`
      : `Hi ${params.username},\n\nUse this single-use secure link to change your DreamFive password:\n${params.resetUrl}\n\nIt expires at ${params.expiresAt.toISOString()}.\n`;
    const html = renderEmailShell({
      hasLogo: Boolean(this.logoBuffer),
      title: isEs ? 'Cambio de contraseña seguro' : 'Secure password change',
      greeting: isEs
        ? `Hola ${escapeHtml(params.username)},`
        : `Hi ${escapeHtml(params.username)},`,
      body: isEs
        ? 'Pulsa el botón para abrir la pantalla segura de cambio de contraseña de DreamFive. El enlace solo funciona una vez.'
        : 'Click the button below to open the secure DreamFive password change page. This link can only be used once.',
      ctaLabel: isEs ? 'Cambiar contraseña' : 'Change password',
      ctaUrl: params.resetUrl,
      footer: isEs ? 'Este enlace caduca en 30 minutos.' : 'This link expires in 30 minutes.',
    });

    await this.deliver({
      to: params.to,
      subject,
      text,
      html,
      resetToken: params.resetToken,
      resetUrl: params.resetUrl,
    });
  }

  private async deliver(payload: {
    readonly to: string;
    readonly subject: string;
    readonly text: string;
    readonly html: string;
    readonly code?: string;
    readonly resetToken?: string;
    readonly resetUrl?: string;
  }): Promise<void> {
    const record: CapturedEmailMessage = {
      ...payload,
      sentAt: new Date().toISOString(),
    };
    this.testOutbox.push(record);
    if (this.testOutbox.length > 50) {
      this.testOutbox.shift();
    }

    if (!this.transporter) {
      return;
    }

    const smtpHost = resolveSmtpHost(this.env);
    const hasAuth = Boolean(this.env.SMTP_USER?.trim() && this.env.SMTP_PASS?.trim());
    if (!hasAuth && smtpHost.includes('gmail.com')) {
      this.logger.warn(
        `Faltan SMTP_USER / SMTP_PASS para enviar correos reales vía ${smtpHost}:${String(this.env.SMTP_PORT)}.`,
      );
      throw new ServiceUnavailableException(
        'Configura SMTP_USER y SMTP_PASS (contraseña de aplicación de Gmail) en .env para enviar correos reales.',
      );
    }

    try {
      await this.transporter.sendMail({
        from: resolveSmtpFrom(this.env),
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        ...(this.logoBuffer
          ? {
              attachments: [
                {
                  filename: 'dreamfive-logo.png',
                  content: this.logoBuffer,
                  cid: DREAMFIVE_LOGO_CID,
                  contentDisposition: 'inline',
                },
              ],
            }
          : {}),
      });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'SMTP error';
      this.logger.error(
        `Error enviando correo a ${payload.to} vía ${smtpHost}:${String(this.env.SMTP_PORT)}: ${detail}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo enviar el correo de verificación en este momento. Revisa SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS.',
      );
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEmailShell(params: {
  readonly hasLogo: boolean;
  readonly title: string;
  readonly greeting: string;
  readonly body: string;
  readonly code?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly footer: string;
}): string {
  const logoHtml = params.hasLogo
    ? `<img src="cid:${DREAMFIVE_LOGO_CID}" alt="DreamFive" width="36" height="36" style="width:36px;height:36px;object-fit:contain;display:block;border:0;" />`
    : '';
  const brandRow = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;"><tr>${
    logoHtml ? `<td style="padding-right:10px;vertical-align:middle;">${logoHtml}</td>` : ''
  }<td style="vertical-align:middle;font-size:14px;font-weight:800;letter-spacing:2px;color:#f97316;text-transform:uppercase;">DreamFive</td></tr></table>`;
  const codeBlock = params.code
    ? `<div style="margin:24px 0;padding:16px 24px;background:#111827;border:1px solid #f97316;border-radius:12px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#ffffff;font-family:monospace;">${escapeHtml(params.code)}</div>`
    : '';
  const ctaBlock =
    params.ctaUrl && params.ctaLabel
      ? `<div style="margin:24px 0;text-align:center;"><a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;padding:12px 24px;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;font-size:15px;">${escapeHtml(params.ctaLabel)}</a></div>`
      : '';

  return [
    '<!doctype html>',
    '<html><body style="margin:0;padding:24px;background:#0b111a;color:#e5e7eb;font-family:system-ui,-apple-system,sans-serif;">',
    '<div style="max-width:520px;margin:0 auto;background:#131c29;border:1px solid #243247;border-radius:16px;padding:28px;">',
    brandRow,
    `<h1 style="margin:10px 0 12px;font-size:22px;color:#ffffff;">${escapeHtml(params.title)}</h1>`,
    `<p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#cbd5e1;">${params.greeting}</p>`,
    `<p style="margin:0;font-size:15px;line-height:1.6;color:#cbd5e1;">${escapeHtml(params.body)}</p>`,
    codeBlock,
    ctaBlock,
    `<p style="margin:18px 0 0;font-size:12px;color:#94a3b8;">${escapeHtml(params.footer)}</p>`,
    '</div></body></html>',
  ].join('');
}
