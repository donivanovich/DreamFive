import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import fastifyMultipart from '@fastify/multipart';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ensureCatalogSeeded, hashPassword } from '@dream5/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';
import { parseApiEnv } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { PrismaService } from './database/prisma.service.js';
import { MailModule } from './modules/mail/mail.module.js';
import { MailService } from './modules/mail/mail.service.js';

const rootEnvFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const hasInfra = Boolean(process.env['DATABASE_URL']);
const describeIfInfra = hasInfra ? describe : describe.skip;

const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function buildMultipartImagePayload(filename: string, mimeType: string, content: Buffer) {
  const boundary = '----Dream5AvatarBoundary987654';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.concat([head, content, tail]),
  };
}

describeIfInfra('Integración HTTP Full Stack de DREAM5 API (NestJS + Fastify)', () => {
  let app: NestFastifyApplication | undefined;
  let prisma: PrismaService | undefined;
  let mail: MailService | undefined;
  const createdLeagueIds: string[] = [];
  const createdUserIds: string[] = [];

  async function registerAndVerifyUser(params: {
    readonly email: string;
    readonly password: string;
    readonly username: string;
  }) {
    if (!app || !mail) {
      throw new Error('La aplicación de pruebas no está inicializada.');
    }
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: params,
    });
    expect(reg.statusCode).toBe(201);
    const pending = reg.json<{
      readonly requiresEmailVerification: boolean;
      readonly email: string;
    }>();
    expect(pending.requiresEmailVerification).toBe(true);

    // Login antes de verificar correo debe fallar con 403
    const unverifiedLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: params.email, password: params.password },
    });
    expect(unverifiedLogin.statusCode).toBe(403);

    const emailMsg = [...mail.getTestOutbox()]
      .reverse()
      .find((m) => m.to === params.email.toLowerCase() && m.code);
    if (!emailMsg?.code) {
      throw new Error(`No se encontró código de verificación enviado a ${params.email}`);
    }
    expect(emailMsg.html).toContain('cid:dream5-logo');

    const wrongCodeRes = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { email: params.email, code: '000000' === emailMsg.code ? '111111' : '000000' },
    });
    expect(wrongCodeRes.statusCode).toBe(400);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { email: params.email, code: emailMsg.code },
    });
    expect(verifyRes.statusCode).toBe(200);
    const auth = verifyRes.json<{
      readonly accessToken: string;
      readonly user: {
        readonly id: string;
        readonly email: string;
        readonly tag: string;
        readonly emailVerified: boolean;
      };
    }>();
    expect(auth.user.emailVerified).toBe(true);
    createdUserIds.push(auth.user.id);
    return auth;
  }

  async function ensureIvanAdminToken(): Promise<{
    readonly accessToken: string;
    readonly tag: string;
  }> {
    if (!app || !prisma) {
      throw new Error('Infraestructura no inicializada.');
    }
    const existingIvan = await prisma.client.user.findUnique({
      where: { email: 'ivan.k@dream5.local' },
      include: { profile: true },
    });
    if (!existingIvan) {
      await prisma.client.user.create({
        data: {
          email: 'ivan.k@dream5.local',
          emailVerifiedAt: new Date(),
          passwordHash: await hashPassword('Dream5Demo!2026'),
          role: 'ADMIN',
          profile: {
            create: {
              username: 'Iván Kovac',
              tag: '#D5-4821',
              initials: 'IK',
              preferencesJson: {
                tradeAlerts: true,
                injuryAlerts: true,
                lineupReminder: true,
                compactTables: false,
                themeMode: 'dark',
                accentColor: 'orange',
                language: 'en',
              },
            },
          },
        },
      });
    } else if (!existingIvan.emailVerifiedAt || existingIvan.role !== 'ADMIN') {
      await prisma.client.user.update({
        where: { id: existingIvan.id },
        data: {
          role: 'ADMIN',
          emailVerifiedAt: existingIvan.emailVerifiedAt ?? new Date(),
        },
      });
    }

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ivan.k@dream5.local', password: 'Dream5Demo!2026' },
    });
    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json<{
      readonly accessToken: string;
      readonly user: { readonly tag: string };
    }>();
    return { accessToken: body.accessToken, tag: body.user.tag };
  }

  beforeAll(async () => {
    const env = parseApiEnv(process.env);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(env)],
    }).compile();

    const instance = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await instance.register(fastifyMultipart, {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    });
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();

    app = instance;
    const prismaService = instance.select(DatabaseModule).get(PrismaService);
    prisma = prismaService;
    mail = instance.select(MailModule).get(MailService);
    await ensureCatalogSeeded(prismaService.client);
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      if (createdLeagueIds.length > 0) {
        await prisma.client.league.deleteMany({ where: { id: { in: createdLeagueIds } } });
      }
      if (createdUserIds.length > 0) {
        await prisma.client.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    }
    if (app) {
      await app.close();
    }
  }, 30_000);

  it('verificación de correo en registro, control estricto de simulación solo para ivan.k@dream5.local y ciclo de liga', async () => {
    if (!app) {
      throw new Error('La aplicación NestFastify no se inicializó correctamente.');
    }
    const server = app;
    const ts = String(Date.now());

    const presBody = await registerAndVerifyUser({
      email: `api-pres-${ts}@dream5.local`,
      password: 'Dream5Api!2026',
      username: `pres_api_${ts.slice(-5)}`,
    });
    expect(presBody.user.tag).toMatch(/^#D5-\d{4}$/);

    const memBody = await registerAndVerifyUser({
      email: `api-mem-${ts}@dream5.local`,
      password: 'Dream5Api!2026',
      username: `mem_api_${ts.slice(-5)}`,
    });

    const createRes = await server.inject({
      method: 'POST',
      url: '/leagues',
      headers: { authorization: `Bearer ${presBody.accessToken}` },
      payload: { name: `API Test League ${ts}`, marketMode: 'LEAGUE_ISOLATED' },
    });
    expect(createRes.statusCode).toBe(201);
    const createdLeague = createRes.json<{
      readonly leagueId: string;
      readonly assignedTeamId: string;
    }>();
    createdLeagueIds.push(createdLeague.leagueId);

    const duplicatePresRes = await server.inject({
      method: 'POST',
      url: '/leagues',
      headers: { authorization: `Bearer ${presBody.accessToken}` },
      payload: { name: `API Duplicada ${ts}`, marketMode: 'LEAGUE_ISOLATED' },
    });
    expect(duplicatePresRes.statusCode).toBe(409);

    // Usuario normal (incluso presidente) NO puede ejecutar simulación ni avanzar temporada
    const forbiddenSimRes = await server.inject({
      method: 'POST',
      url: `/dev/leagues/${createdLeague.leagueId}/simulate-round`,
      headers: { authorization: `Bearer ${presBody.accessToken}` },
      payload: {},
    });
    expect(forbiddenSimRes.statusCode).toBe(403);

    const forbiddenSeasonRes = await server.inject({
      method: 'POST',
      url: `/leagues/${createdLeague.leagueId}/seasons/advance`,
      headers: { authorization: `Bearer ${presBody.accessToken}` },
    });
    expect(forbiddenSeasonRes.statusCode).toBe(403);

    // Unir al admin ivan.k@dream5.local y al miembro normal
    const ivan = await ensureIvanAdminToken();
    const inviteIvan = await server.inject({
      method: 'POST',
      url: `/leagues/${createdLeague.leagueId}/invitations`,
      headers: { authorization: `Bearer ${presBody.accessToken}` },
      payload: { tag: ivan.tag },
    });
    expect(inviteIvan.statusCode).toBe(201);
    const invIvanId = inviteIvan.json<{ readonly id: string }>().id;

    const acceptIvan = await server.inject({
      method: 'POST',
      url: `/invitations/${invIvanId}/accept`,
      headers: { authorization: `Bearer ${ivan.accessToken}` },
    });
    expect(acceptIvan.statusCode).toBe(201);

    // Solo ivan.k@dream5.local puede simular
    const simRes = await server.inject({
      method: 'POST',
      url: `/dev/leagues/${createdLeague.leagueId}/simulate-round`,
      headers: { authorization: `Bearer ${ivan.accessToken}` },
      payload: {},
    });
    expect(simRes.statusCode).toBe(201);

    const inviteRes = await server.inject({
      method: 'POST',
      url: `/leagues/${createdLeague.leagueId}/invitations`,
      headers: { authorization: `Bearer ${presBody.accessToken}` },
      payload: { tag: memBody.user.tag },
    });
    expect(inviteRes.statusCode).toBe(201);
    const inv = inviteRes.json<{ readonly id: string }>();

    const acceptRes = await server.inject({
      method: 'POST',
      url: `/invitations/${inv.id}/accept`,
      headers: { authorization: `Bearer ${memBody.accessToken}` },
    });
    expect(acceptRes.statusCode).toBe(201);
    const acceptBody = acceptRes.json<{
      readonly status: string;
      readonly inheritedPoints: number;
    }>();
    expect(acceptBody.status).toBe('ACCEPTED');
    expect(acceptBody.inheritedPoints).toBeGreaterThan(0);

    const lineupGet = await server.inject({
      method: 'GET',
      url: `/leagues/${createdLeague.leagueId}/lineup`,
      headers: { authorization: `Bearer ${presBody.accessToken}` },
    });
    expect(lineupGet.statusCode).toBe(200);
    const currentLineup = lineupGet.json<{
      readonly pgPlayerId: string;
      readonly sgPlayerId: string;
      readonly sfPlayerId: string;
      readonly pfPlayerId: string;
      readonly cPlayerId: string;
    }>();

    const lineupPut = await server.inject({
      method: 'PUT',
      url: `/leagues/${createdLeague.leagueId}/lineup`,
      headers: { authorization: `Bearer ${presBody.accessToken}` },
      payload: {
        pgPlayerId: currentLineup.pgPlayerId,
        sgPlayerId: currentLineup.sgPlayerId,
        sfPlayerId: currentLineup.sfPlayerId,
        pfPlayerId: currentLineup.pfPlayerId,
        cPlayerId: currentLineup.cPlayerId,
      },
    });
    expect(lineupPut.statusCode).toBe(200);

    const logoutRes = await server.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${presBody.accessToken}` },
    });
    expect(logoutRes.statusCode).toBe(200);

    const meAfterLogout = await server.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${presBody.accessToken}` },
    });
    expect(meAfterLogout.statusCode).toBe(401);
  }, 60_000);

  it('perfil con verificación email, reset seguro por enlace, subida de avatar, preferencias y bloqueos por partidos', async () => {
    if (!app || !mail) {
      throw new Error('La aplicación NestFastify no se inicializó correctamente.');
    }
    const server = app;
    const ts = String(Date.now());
    const initialEmail = `api-prof-${ts}@dream5.local`;
    const newEmail = `api-prof-new-${ts}@dream5.local`;

    const bodyA = await registerAndVerifyUser({
      email: initialEmail,
      password: 'Password123!',
      username: `userA_${ts.slice(-5)}`,
    });

    const bodyB = await registerAndVerifyUser({
      email: `api-profB-${ts}@dream5.local`,
      password: 'Password123!',
      username: `userB_${ts.slice(-5)}`,
    });

    // 1) Renombrar username y actualizar preferencias de tema/acento/idioma
    const renameRes = await server.inject({
      method: 'PATCH',
      url: '/users/me/profile',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: { username: `renamed_${ts.slice(-5)}` },
    });
    expect(renameRes.statusCode).toBe(200);
    expect(renameRes.json<{ readonly username: string }>().username).toBe(
      `renamed_${ts.slice(-5)}`,
    );

    const prefsRes = await server.inject({
      method: 'PATCH',
      url: '/users/me/preferences',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: { themeMode: 'light', accentColor: 'purple', language: 'es' },
    });
    expect(prefsRes.statusCode).toBe(200);
    expect(
      prefsRes.json<{
        readonly preferences: {
          readonly themeMode: string;
          readonly accentColor: string;
          readonly language: string;
        };
      }>().preferences,
    ).toMatchObject({ themeMode: 'light', accentColor: 'purple', language: 'es' });

    // 2) Subida y borrado de avatar
    const form = buildMultipartImagePayload('avatar.png', 'image/png', TINY_PNG_BUFFER);
    const uploadRes = await server.inject({
      method: 'POST',
      url: '/users/me/avatar',
      headers: {
        authorization: `Bearer ${bodyA.accessToken}`,
        'content-type': form.contentType,
      },
      payload: form.payload,
    });
    expect(uploadRes.statusCode).toBe(200);
    const uploadedAvatarUrl = uploadRes.json<{ readonly avatarUrl: string | null }>().avatarUrl;
    expect(uploadedAvatarUrl).toMatch(/^\/uploads\/avatars\/.+\.png$/);

    if (uploadedAvatarUrl) {
      const fetchAvatar = await server.inject({
        method: 'GET',
        url: uploadedAvatarUrl,
      });
      expect(fetchAvatar.statusCode).toBe(200);
      expect(fetchAvatar.headers['cross-origin-resource-policy']).toBe('cross-origin');
    }

    const deleteAvatarRes = await server.inject({
      method: 'DELETE',
      url: '/users/me/avatar',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(deleteAvatarRes.statusCode).toBe(200);
    expect(deleteAvatarRes.json<{ readonly avatarUrl: string | null }>().avatarUrl).toBeNull();

    // 3) Cambiar correo mediante código de 6 dígitos al nuevo correo
    const emailWrongPwd = await server.inject({
      method: 'POST',
      url: '/users/me/email-change/request',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: { newEmail, currentPassword: 'WrongPassword!' },
    });
    expect(emailWrongPwd.statusCode).toBe(401);

    const emailReq = await server.inject({
      method: 'POST',
      url: '/users/me/email-change/request',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: { newEmail, currentPassword: 'Password123!' },
    });
    expect(emailReq.statusCode).toBe(200);

    const changeCodeMsg = [...mail.getTestOutbox()]
      .reverse()
      .find((m) => m.to === newEmail && m.code);
    if (!changeCodeMsg?.code) {
      throw new Error('No se envió el código de cambio de correo.');
    }

    const emailConfirmRes = await server.inject({
      method: 'POST',
      url: '/users/me/email-change/confirm',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: { code: changeCodeMsg.code },
    });
    expect(emailConfirmRes.statusCode).toBe(200);
    expect(emailConfirmRes.json<{ readonly email: string }>().email).toBe(newEmail);

    // 4) Cambio de contraseña únicamente mediante enlace token enviado por correo
    const validateMissing = await server.inject({
      method: 'GET',
      url: '/auth/password-reset/validate',
    });
    expect(validateMissing.statusCode).toBe(200);
    expect(validateMissing.json<{ readonly valid: boolean }>().valid).toBe(false);

    const resetReq = await server.inject({
      method: 'POST',
      url: '/users/me/password-reset/request',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(resetReq.statusCode).toBe(200);

    const resetMsg = [...mail.getTestOutbox()]
      .reverse()
      .find((m) => m.to === newEmail && m.resetToken);
    if (!resetMsg?.resetToken) {
      throw new Error('No se envió el token de restablecimiento de contraseña.');
    }

    const validateOk = await server.inject({
      method: 'GET',
      url: `/auth/password-reset/validate?token=${encodeURIComponent(resetMsg.resetToken)}`,
    });
    expect(validateOk.statusCode).toBe(200);
    expect(validateOk.json<{ readonly valid: boolean }>().valid).toBe(true);

    const confirmReset = await server.inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      payload: { token: resetMsg.resetToken, newPassword: 'NewPassword456!' },
    });
    expect(confirmReset.statusCode).toBe(200);

    const validateUsed = await server.inject({
      method: 'GET',
      url: `/auth/password-reset/validate?token=${encodeURIComponent(resetMsg.resetToken)}`,
    });
    expect(
      validateUsed.json<{ readonly valid: boolean; readonly reason?: string }>(),
    ).toMatchObject({ valid: false, reason: 'USED' });

    const loginNew = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: newEmail, password: 'NewPassword456!' },
    });
    expect(loginNew.statusCode).toBe(200);

    // 5) Liga + admin ivan.k@dream5.local + bloqueo por rechazo (1 partido propuesto y deseado) y 5 partidos al aceptar
    const createRes = await server.inject({
      method: 'POST',
      url: '/leagues',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: { name: `API Cool ${ts}`, marketMode: 'LEAGUE_ISOLATED' },
    });
    expect(createRes.statusCode).toBe(201);
    const leagueCreated = createRes.json<{
      readonly leagueId: string;
      readonly assignedTeamId: string;
    }>();
    createdLeagueIds.push(leagueCreated.leagueId);

    const ivan = await ensureIvanAdminToken();
    const invIvan = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/invitations`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: { tag: ivan.tag },
    });
    await server.inject({
      method: 'POST',
      url: `/invitations/${invIvan.json<{ readonly id: string }>().id}/accept`,
      headers: { authorization: `Bearer ${ivan.accessToken}` },
    });

    const invRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/invitations`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: { tag: bodyB.user.tag },
    });
    expect(invRes.statusCode).toBe(201);
    const invBody = invRes.json<{ readonly id: string }>();

    const accRes = await server.inject({
      method: 'POST',
      url: `/invitations/${invBody.id}/accept`,
      headers: { authorization: `Bearer ${bodyB.accessToken}` },
    });
    expect(accRes.statusCode).toBe(201);
    const teamBId = accRes.json<{ readonly assignedTeamId: string }>().assignedTeamId;

    const simRes = await server.inject({
      method: 'POST',
      url: `/dev/leagues/${leagueCreated.leagueId}/simulate-round`,
      headers: { authorization: `Bearer ${ivan.accessToken}` },
      payload: {},
    });
    expect(simRes.statusCode).toBe(201);

    const [teamARes, teamBRes] = await Promise.all([
      server.inject({
        method: 'GET',
        url: `/leagues/${leagueCreated.leagueId}/teams/${leagueCreated.assignedTeamId}`,
        headers: { authorization: `Bearer ${bodyA.accessToken}` },
      }),
      server.inject({
        method: 'GET',
        url: `/leagues/${leagueCreated.leagueId}/teams/${teamBId}`,
        headers: { authorization: `Bearer ${bodyA.accessToken}` },
      }),
    ]);
    const rosterA = teamARes.json<{
      readonly roster: readonly {
        readonly id: string;
        readonly position: string;
        readonly priceMillions: number;
      }[];
    }>().roster;
    const rosterB = teamBRes.json<{
      readonly roster: readonly {
        readonly id: string;
        readonly position: string;
        readonly priceMillions: number;
      }[];
    }>().roster;

    const reqP = rosterB.find((p) => p.position === 'PG');
    const offP = rosterA.find((p) => p.position === 'PG');
    if (!reqP || !offP) {
      throw new Error('No se encontraron bases disponibles en las plantillas de prueba.');
    }
    const topCash = Math.ceil(Math.max(0, reqP.priceMillions - offP.priceMillions));

    // Oferta pendiente enviada A -> B: aislada a equipos participantes y cancelable por el proponente A
    const cancelCandidateRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/transfers`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: {
        receivingTeamId: teamBId,
        offeredPlayerIds: [offP.id],
        requestedPlayerIds: [reqP.id],
        cashOfferedMillions: topCash,
        cashRequestedMillions: 0,
      },
    });
    expect(cancelCandidateRes.statusCode).toBe(201);
    const cancelCandidateId = cancelCandidateRes.json<{ readonly offerId: string }>().offerId;

    const listForUninvolved = await server.inject({
      method: 'GET',
      url: `/leagues/${leagueCreated.leagueId}/transfers`,
      headers: { authorization: `Bearer ${ivan.accessToken}` },
    });
    expect(listForUninvolved.statusCode).toBe(200);
    expect(
      listForUninvolved
        .json<{ readonly offers: readonly { readonly id: string }[] }>()
        .offers.some((o) => o.id === cancelCandidateId),
    ).toBe(false);

    const forbiddenCancelRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/transfers/${cancelCandidateId}/cancel`,
      headers: { authorization: `Bearer ${bodyB.accessToken}` },
      payload: {},
    });
    expect(forbiddenCancelRes.statusCode).toBe(403);

    const cancelOkRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/transfers/${cancelCandidateId}/cancel`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: {},
    });
    expect(cancelOkRes.statusCode).toBe(201);
    expect(cancelOkRes.json<{ readonly status: string }>().status).toBe('CANCELLED');

    const offerRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/transfers`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: {
        receivingTeamId: teamBId,
        offeredPlayerIds: [offP.id],
        requestedPlayerIds: [reqP.id],
        cashOfferedMillions: topCash,
        cashRequestedMillions: 0,
      },
    });
    expect(offerRes.statusCode).toBe(201);
    const offerId = offerRes.json<{ readonly offerId: string }>().offerId;

    const rejectRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/transfers/${offerId}/reject`,
      headers: { authorization: `Bearer ${bodyB.accessToken}` },
    });
    expect(rejectRes.statusCode).toBe(201);

    const listBlocked = await server.inject({
      method: 'GET',
      url: `/leagues/${leagueCreated.leagueId}/transfers`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(listBlocked.statusCode).toBe(200);
    const blockedIds = listBlocked
      .json<{ readonly blockedPlayers: readonly { readonly playerId: string }[] }>()
      .blockedPlayers.map((b) => b.playerId);
    expect(blockedIds).toContain(reqP.id);
    expect(blockedIds).toContain(offP.id);

    const retryBlocked = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/transfers`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: {
        receivingTeamId: teamBId,
        offeredPlayerIds: [offP.id],
        requestedPlayerIds: [reqP.id],
        cashOfferedMillions: topCash,
        cashRequestedMillions: 0,
      },
    });
    expect(retryBlocked.statusCode).toBe(409);

    // Simular 1 jornada desbloquea tanto al propuesto como al solicitado
    const simR2 = await server.inject({
      method: 'POST',
      url: `/dev/leagues/${leagueCreated.leagueId}/simulate-round`,
      headers: { authorization: `Bearer ${ivan.accessToken}` },
      payload: {},
    });
    expect(simR2.statusCode).toBe(201);

    const listAfterMatch = await server.inject({
      method: 'GET',
      url: `/leagues/${leagueCreated.leagueId}/transfers`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    const afterMatchBlockedIds = listAfterMatch
      .json<{ readonly blockedPlayers: readonly { readonly playerId: string }[] }>()
      .blockedPlayers.map((b) => b.playerId);
    expect(afterMatchBlockedIds).not.toContain(reqP.id);
    expect(afterMatchBlockedIds).not.toContain(offP.id);

    // Reintentar tras 1 partido y aceptar por B -> bloqueo de 5 partidos
    const secondOfferRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/transfers`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: {
        receivingTeamId: teamBId,
        offeredPlayerIds: [offP.id],
        requestedPlayerIds: [reqP.id],
        cashOfferedMillions: topCash,
        cashRequestedMillions: 0,
      },
    });
    expect(secondOfferRes.statusCode).toBe(201);
    const acceptTradeRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/transfers/${secondOfferRes.json<{ readonly offerId: string }>().offerId}/accept`,
      headers: { authorization: `Bearer ${bodyB.accessToken}` },
      payload: {},
    });
    expect(acceptTradeRes.statusCode).toBe(201);

    const listAfterTrade = await server.inject({
      method: 'GET',
      url: `/leagues/${leagueCreated.leagueId}/transfers`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    const acquiredBlock = listAfterTrade
      .json<{
        readonly blockedPlayers: readonly {
          readonly playerId: string;
          readonly reason: string;
          readonly remainingMatches: number;
        }[];
      }>()
      .blockedPlayers.find((b) => b.playerId === reqP.id);
    expect(acquiredBlock).toMatchObject({
      playerId: reqP.id,
      reason: 'RECENT_TRADE_ACQUISITION',
      remainingMatches: 5,
    });

    // Rechaza efectivo inferior a 0.1M (100k), pero permite tramos de 0.4M
    const badSmallCashRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/transfers`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: {
        receivingTeamId: teamBId,
        offeredPlayerIds: [offP.id],
        requestedPlayerIds: [reqP.id],
        cashOfferedMillions: 0.05,
        cashRequestedMillions: 0,
      },
    });
    expect(badSmallCashRes.statusCode).toBe(400);

    const [freshTeamARes, freshTeamBRes] = await Promise.all([
      server.inject({
        method: 'GET',
        url: `/leagues/${leagueCreated.leagueId}/teams/${leagueCreated.assignedTeamId}`,
        headers: { authorization: `Bearer ${bodyA.accessToken}` },
      }),
      server.inject({
        method: 'GET',
        url: `/leagues/${leagueCreated.leagueId}/teams/${teamBId}`,
        headers: { authorization: `Bearer ${bodyA.accessToken}` },
      }),
    ]);
    const freshRosterA = freshTeamARes.json<{
      readonly roster: readonly {
        readonly id: string;
        readonly position: string;
        readonly priceMillions: number;
      }[];
    }>().roster;
    const freshRosterB = freshTeamBRes.json<{
      readonly roster: readonly {
        readonly id: string;
        readonly position: string;
        readonly priceMillions: number;
      }[];
    }>().roster;

    const otherA = freshRosterA
      .filter((p) => p.id !== offP.id && p.id !== reqP.id && p.position === 'SG')
      .sort((a, b) => b.priceMillions - a.priceMillions)[0];
    const otherB = freshRosterB
      .filter((p) => p.id !== offP.id && p.id !== reqP.id && p.position === 'SG')
      .sort((a, b) => a.priceMillions - b.priceMillions)[0];
    if (otherA && otherB) {
      const decimalCashRes = await server.inject({
        method: 'POST',
        url: `/leagues/${leagueCreated.leagueId}/transfers`,
        headers: { authorization: `Bearer ${bodyA.accessToken}` },
        payload: {
          receivingTeamId: teamBId,
          offeredPlayerIds: [otherA.id],
          requestedPlayerIds: [otherB.id],
          cashOfferedMillions: Math.max(
            0.4,
            Math.round((Math.max(0, otherB.priceMillions - otherA.priceMillions) + 0.4) * 10) / 10,
          ),
          cashRequestedMillions: 0,
        },
      });
      expect(decimalCashRes.statusCode).toBe(201);
    }

    const rankingsRes = await server.inject({
      method: 'GET',
      url: `/leagues/${leagueCreated.leagueId}/rankings`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(rankingsRes.statusCode).toBe(200);
    const rankingsJson = rankingsRes.json<{
      readonly standings: readonly {
        readonly teamName: string;
        readonly isCpuControlled: boolean;
        readonly managerAvatarUrl: string | null;
      }[];
    }>();
    expect(rankingsJson.standings).toHaveLength(30);
    expect(rankingsJson.standings.some((s) => s.teamName === 'Los Angeles Rivers')).toBe(true);
    const cpuRows = rankingsJson.standings.filter((s) => s.isCpuControlled);
    expect(cpuRows.length).toBeGreaterThanOrEqual(27);
    expect(cpuRows.every((row) => row.managerAvatarUrl === null)).toBe(true);

    // Detalle completo de jugador: pesos DP, estadísticas por partido, rival y desglose DP
    const playerDetailRes = await server.inject({
      method: 'GET',
      url: `/leagues/${leagueCreated.leagueId}/players/${reqP.id}`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(playerDetailRes.statusCode).toBe(200);
    const playerDetail = playerDetailRes.json<{
      readonly scoringWeights: { readonly pts: number; readonly reb: number; readonly min: number };
      readonly recentStats: readonly {
        readonly roundNumber: number;
        readonly opponentTeamName: string;
        readonly dpBreakdown: {
          readonly pts: number;
          readonly reb: number;
          readonly ast: number;
          readonly minutes: number;
        };
      }[];
    }>();
    expect(playerDetail.scoringWeights.pts).toBeGreaterThan(0);
    expect(playerDetail.recentStats.length).toBeGreaterThanOrEqual(1);
    expect(playerDetail.recentStats[0]?.opponentTeamName.length).toBeGreaterThan(0);
    expect(typeof playerDetail.recentStats[0]?.dpBreakdown.pts).toBe('number');
    expect(typeof playerDetail.recentStats[0]?.dpBreakdown.minutes).toBe('number');

    // Mail de liga: aislado a equipos humanos, con resultados y traspasos y soporte lectura/borrado
    const mailARes = await server.inject({
      method: 'GET',
      url: `/leagues/${leagueCreated.leagueId}/mail`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(mailARes.statusCode).toBe(200);
    const mailA = mailARes.json<{
      readonly unreadCount: number;
      readonly items: readonly {
        readonly id: string;
        readonly category: string;
        readonly isRead: boolean;
      }[];
    }>();
    expect(mailA.unreadCount).toBeGreaterThanOrEqual(3);
    expect(mailA.items.some((m) => m.category === 'MATCH_RESULT')).toBe(true);
    expect(mailA.items.some((m) => m.category === 'TRANSFER_SENT')).toBe(true);
    expect(mailA.items.some((m) => m.category === 'TRANSFER_REJECTED')).toBe(true);
    expect(mailA.items.some((m) => m.category === 'TRANSFER_ACCEPTED')).toBe(true);

    const firstMail = mailA.items[0];
    if (!firstMail) {
      throw new Error('Se esperaba al menos un correo de liga para el usuario A.');
    }
    const markOneRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/mail/${firstMail.id}/read`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(markOneRes.statusCode).toBe(201);

    const markAllRes = await server.inject({
      method: 'POST',
      url: `/leagues/${leagueCreated.leagueId}/mail/read-all`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(markAllRes.statusCode).toBe(201);

    const deleteMailRes = await server.inject({
      method: 'DELETE',
      url: `/leagues/${leagueCreated.leagueId}/mail/${firstMail.id}`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(deleteMailRes.statusCode).toBe(200);

    const mailAAfter = await server.inject({
      method: 'GET',
      url: `/leagues/${leagueCreated.leagueId}/mail`,
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(
      mailAAfter.json<{
        readonly unreadCount: number;
        readonly items: readonly { readonly id: string }[];
      }>(),
    ).toMatchObject({ unreadCount: 0 });
    expect(
      mailAAfter
        .json<{ readonly items: readonly { readonly id: string }[] }>()
        .items.some((m) => m.id === firstMail.id),
    ).toBe(false);

    const mailBRes = await server.inject({
      method: 'GET',
      url: `/leagues/${leagueCreated.leagueId}/mail`,
      headers: { authorization: `Bearer ${bodyB.accessToken}` },
    });
    expect(mailBRes.statusCode).toBe(200);
    expect(
      mailBRes
        .json<{ readonly items: readonly { readonly category: string }[] }>()
        .items.some((m) => m.category === 'TRANSFER_RECEIVED'),
    ).toBe(true);

    // 7) Sincronización del reloj simulado a la hora actual (revirtiendo jornadas futuras)
    if (!prisma) {
      throw new Error('Prisma no disponible.');
    }
    await prisma.client.league.update({
      where: { id: leagueCreated.leagueId },
      data: { gameClockAt: new Date('2027-01-15T12:00:00.000Z'), isAccelerated: true },
    });
    const futureMatch = await prisma.client.match.findFirst({
      where: {
        leagueId: leagueCreated.leagueId,
        status: 'SCHEDULED',
        scheduledAt: { gt: new Date() },
      },
      orderBy: { roundNumber: 'desc' },
    });
    if (futureMatch) {
      await server.inject({
        method: 'POST',
        url: `/dev/leagues/${leagueCreated.leagueId}/simulate-round`,
        headers: { authorization: `Bearer ${ivan.accessToken}` },
        payload: { roundNumber: futureMatch.roundNumber },
      });
    }

    const syncRes = await server.inject({
      method: 'POST',
      url: `/dev/leagues/${leagueCreated.leagueId}/sync-clock`,
      headers: { authorization: `Bearer ${ivan.accessToken}` },
      payload: {},
    });
    expect(syncRes.statusCode).toBe(201);
    const syncBody = syncRes.json<{
      readonly newGameClockAt: string;
      readonly revertedMatchesCount: number;
    }>();
    expect(Math.abs(Date.now() - Date.parse(syncBody.newGameClockAt))).toBeLessThan(60_000);
    if (futureMatch) {
      expect(syncBody.revertedMatchesCount).toBeGreaterThanOrEqual(1);
    }
    const statusAfterSyncRes = await server.inject({
      method: 'GET',
      url: `/dev/leagues/${leagueCreated.leagueId}/status`,
      headers: { authorization: `Bearer ${ivan.accessToken}` },
    });
    expect(statusAfterSyncRes.statusCode).toBe(200);
    const statusAfterSync = statusAfterSyncRes.json<{
      readonly serverTimeIso: string;
      readonly serverTimeZone: string;
      readonly isAccelerated: boolean;
      readonly workerOnline: boolean;
      readonly nextScheduledMatchAt: string | null;
      readonly nextScheduledMatchLabel: string | null;
    }>();
    expect(Number.isFinite(Date.parse(statusAfterSync.serverTimeIso))).toBe(true);
    expect(statusAfterSync.serverTimeZone.length).toBeGreaterThan(0);
    expect(statusAfterSync.isAccelerated).toBe(false);
    expect(typeof statusAfterSync.workerOnline).toBe('boolean');
    expect(statusAfterSync.nextScheduledMatchAt).not.toBeNull();
    expect(statusAfterSync.nextScheduledMatchLabel).toContain('@');
    const postSyncLeague = await prisma.client.league.findUnique({
      where: { id: leagueCreated.leagueId },
    });
    expect(postSyncLeague?.isAccelerated).toBe(false);
    const strayFutureFinals = await prisma.client.match.count({
      where: {
        leagueId: leagueCreated.leagueId,
        status: 'FINAL',
        scheduledAt: { gt: new Date(Date.now() + 1000) },
      },
    });
    expect(strayFutureFinals).toBe(0);

    // 8) Eliminación de cuenta con traspaso de presidencia + correo + sustitución por CPU
    const ctxRes = await server.inject({
      method: 'GET',
      url: '/users/me/deletion-context',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(ctxRes.statusCode).toBe(200);
    const ctxJson = ctxRes.json<{
      readonly presidedLeagues: readonly {
        readonly leagueId: string;
        readonly candidates: readonly { readonly userId: string }[];
      }[];
    }>();
    expect(
      ctxJson.presidedLeagues.some(
        (l) =>
          l.leagueId === leagueCreated.leagueId &&
          l.candidates.some((c) => c.userId === bodyB.user.id),
      ),
    ).toBe(true);

    const wrongUsernameDel = await server.inject({
      method: 'POST',
      url: '/users/me/delete',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: {
        confirmUsername: 'wrong_name',
        successorPresidents: { [leagueCreated.leagueId]: bodyB.user.id },
      },
    });
    expect(wrongUsernameDel.statusCode).toBe(400);

    const deleteOkRes = await server.inject({
      method: 'POST',
      url: '/users/me/delete',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
      payload: {
        confirmUsername: `renamed_${ts.slice(-5)}`,
        successorPresidents: { [leagueCreated.leagueId]: bodyB.user.id },
      },
    });
    expect(deleteOkRes.statusCode).toBe(200);
    expect(deleteOkRes.json<{ readonly deleted: boolean }>()).toMatchObject({ deleted: true });

    const meAfterDelete = await server.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: `Bearer ${bodyA.accessToken}` },
    });
    expect(meAfterDelete.statusCode).toBe(401);

    const vacatedTeam = await prisma.client.leagueTeam.findUnique({
      where: { id: leagueCreated.assignedTeamId },
    });
    expect(vacatedTeam?.isCpuControlled).toBe(true);

    const updatedLeagueAfterExit = await prisma.client.league.findUnique({
      where: { id: leagueCreated.leagueId },
    });
    expect(updatedLeagueAfterExit?.presidentUserId).toBe(bodyB.user.id);

    const mailBAfterPromo = await server.inject({
      method: 'GET',
      url: `/leagues/${leagueCreated.leagueId}/mail`,
      headers: { authorization: `Bearer ${bodyB.accessToken}` },
    });
    expect(
      mailBAfterPromo
        .json<{
          readonly items: readonly { readonly category: string; readonly subject: string }[];
        }>()
        .items.some(
          (m) =>
            m.category === 'PRESIDENT_PROMOTION' &&
            m.subject.includes('¡Enhorabuena, ahora eres presidente de la liga'),
        ),
    ).toBe(true);

    // 9) Liga vacía eliminada por completo al borrar cuenta el único miembro humano
    const soloUsername = `solo_${ts.slice(-5)}`;
    const soloUser = await registerAndVerifyUser({
      email: `api-solo-${ts}@dream5.local`,
      password: 'Password123!',
      username: soloUsername,
    });
    const soloLeagueRes = await server.inject({
      method: 'POST',
      url: '/leagues',
      headers: { authorization: `Bearer ${soloUser.accessToken}` },
      payload: { name: `Solo Purge ${ts}`, marketMode: 'LEAGUE_ISOLATED' },
    });
    expect(soloLeagueRes.statusCode).toBe(201);
    const soloLeagueId = soloLeagueRes.json<{ readonly leagueId: string }>().leagueId;

    const soloDelRes = await server.inject({
      method: 'POST',
      url: '/users/me/delete',
      headers: { authorization: `Bearer ${soloUser.accessToken}` },
      payload: { confirmUsername: soloUsername, successorPresidents: {} },
    });
    expect(soloDelRes.statusCode).toBe(200);
    expect(
      soloDelRes.json<{ readonly deletedLeagueIds: readonly string[] }>().deletedLeagueIds,
    ).toContain(soloLeagueId);
    const deletedLeagueRow = await prisma.client.league.findUnique({
      where: { id: soloLeagueId },
    });
    expect(deletedLeagueRow).toBeNull();
  }, 120_000);
});
