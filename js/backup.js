const FORMAT = 'tontinepro-backup';
const VERSION = 1;
const ITERATIONS = 310000;
const MAX_BYTES = 20 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function requirePassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) {
    throw new Error('La phrase secrète doit contenir au moins 12 caractères.');
  }
}

function toBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Sauvegarde invalide.');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBackup(state, passphrase) {
  requirePassphrase(passphrase);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`${FORMAT}:${VERSION}`);
  const key = await deriveKey(passphrase, salt);
  const plaintext = encoder.encode(JSON.stringify(state));
  if (plaintext.length > MAX_BYTES) throw new Error('La sauvegarde dépasse la taille maximale autorisée.');
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext);
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    kdf: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  });
}

export async function decryptBackup(serialized, passphrase) {
  requirePassphrase(passphrase);
  if (typeof serialized !== 'string' || encoder.encode(serialized).length > MAX_BYTES) {
    throw new Error('Fichier de sauvegarde invalide ou trop volumineux.');
  }

  let backup;
  try {
    backup = JSON.parse(serialized);
  } catch {
    throw new Error('Le fichier ne contient pas une sauvegarde TontinePro valide.');
  }

  if (
    backup?.format !== FORMAT ||
    backup.version !== VERSION ||
    backup.kdf !== 'PBKDF2-SHA-256' ||
    backup.iterations !== ITERATIONS ||
    backup.cipher !== 'AES-256-GCM'
  ) {
    throw new Error('Format de sauvegarde non pris en charge.');
  }

  try {
    const salt = fromBase64(backup.salt);
    const iv = fromBase64(backup.iv);
    const ciphertext = fromBase64(backup.data);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error('Sauvegarde invalide.');
    const key = await deriveKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(`${FORMAT}:${VERSION}`) },
      key,
      ciphertext
    );
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error('Impossible de déchiffrer la sauvegarde : phrase secrète incorrecte ou fichier altéré.');
  }
}