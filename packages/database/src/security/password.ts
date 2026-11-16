import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function deriveKey(password: string, saltHex: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      Buffer.from(saltHex, 'hex'),
      KEY_LENGTH,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

/**
 * Genera un hash seguro de contraseña usando Node `crypto.scrypt` + salt aleatorio de 16 bytes.
 * Formato persistido: `scrypt$<saltHex>$<hashHex>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const saltHex = randomBytes(SALT_BYTES).toString('hex');
  const derivedKey = await deriveKey(password, saltHex);
  return `scrypt$${saltHex}$${derivedKey.toString('hex')}`;
}

/**
 * Verifica una contraseña en texto plano frente a un hash almacenado usando comparación constante.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const saltHex = parts[1];
  const expectedHex = parts[2];
  if (!saltHex || !expectedHex) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  const actualBuffer = await deriveKey(password, saltHex);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
