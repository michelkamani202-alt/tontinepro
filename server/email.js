import nodemailer from 'nodemailer';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function createMailerFromEnv(env = process.env) {
  const host = env.SMTP_HOST;
  const user = env.SMTP_USER;
  const password = env.SMTP_PASSWORD;
  const from = env.SMTP_FROM;
  if (!host || !user || !password || !from) {
    throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASSWORD et SMTP_FROM doivent être configurés.');
  }

  const port = Number(env.SMTP_PORT) || 587;
  const secure = String(env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass: password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  async function send({ to, subject, introduction, url, action }) {
    const safeUrl = escapeHtml(url);
    await transport.sendMail({
      from,
      to,
      subject,
      text: `${introduction}\n\n${action} : ${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      html: `<p>${escapeHtml(introduction)}</p><p><a href="${safeUrl}">${escapeHtml(action)}</a></p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`,
    });
  }

  return {
    sendVerification: ({ to, url }) => send({
      to,
      subject: 'Confirmez votre adresse e-mail - TontinePro',
      introduction: 'Confirmez votre adresse e-mail pour activer votre compte TontinePro.',
      url,
      action: 'Confirmer mon adresse e-mail',
    }),
    sendPasswordReset: ({ to, url }) => send({
      to,
      subject: 'Réinitialisation du mot de passe - TontinePro',
      introduction: 'Une demande de réinitialisation du mot de passe a été faite pour votre compte TontinePro.',
      url,
      action: 'Choisir un nouveau mot de passe',
    }),
  };
}

export function createDevelopmentMailer(log = console.info) {
  return {
    async sendVerification({ to, url }) {
      log(`[TontinePro dev mail] Validation pour ${to} : ${url}`);
    },
    async sendPasswordReset({ to, url }) {
      log(`[TontinePro dev mail] Réinitialisation pour ${to} : ${url}`);
    },
  };
}
