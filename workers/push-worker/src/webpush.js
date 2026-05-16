const textEncoder = new TextEncoder();

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function uint8ArrayToBase64Url(bytes) {
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  arrays.forEach(array => {
    output.set(array, offset);
    offset += array.length;
  });
  return output;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

async function hkdfExtract(salt, ikm) {
  return hmacSha256(salt, ikm);
}

async function hkdfExpand(prk, info, length) {
  const blocks = [];
  let previous = new Uint8Array(0);
  let counter = 1;
  while (concatBytes(...blocks).length < length) {
    previous = await hmacSha256(prk, concatBytes(previous, info, new Uint8Array([counter])));
    blocks.push(previous);
    counter += 1;
  }
  return concatBytes(...blocks).slice(0, length);
}

async function importVapidPrivateKey(privateKeyBase64Url, publicKeyBase64Url) {
  const privateBytes = base64UrlToUint8Array(privateKeyBase64Url);
  const publicBytes = base64UrlToUint8Array(publicKeyBase64Url);
  if (privateBytes.length !== 32 || publicBytes.length !== 65) throw new Error("Invalid VAPID key length");
  const x = uint8ArrayToBase64Url(publicBytes.slice(1, 33));
  const y = uint8ArrayToBase64Url(publicBytes.slice(33, 65));
  const d = uint8ArrayToBase64Url(privateBytes);
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function createVapidJwt(subscriptionEndpoint, env) {
  const audience = new URL(subscriptionEndpoint).origin;
  const header = uint8ArrayToBase64Url(textEncoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = uint8ArrayToBase64Url(textEncoder.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || "mailto:admin@vns-logistics.com"
  })));
  const unsignedToken = `${header}.${payload}`;
  const key = await importVapidPrivateKey(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    textEncoder.encode(unsignedToken)
  ));
  return `${unsignedToken}.${uint8ArrayToBase64Url(signature)}`;
}

async function encryptPayload(subscription, payloadText) {
  const receiverPublicKey = base64UrlToUint8Array(subscription.keys.p256dh);
  const authSecret = base64UrlToUint8Array(subscription.keys.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const senderKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const senderPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const receiverKey = await crypto.subtle.importKey("raw", receiverPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, senderKeys.privateKey, 256));

  const authPrk = await hkdfExtract(authSecret, sharedSecret);
  const keyInfo = concatBytes(textEncoder.encode("WebPush: info"), new Uint8Array([0]), receiverPublicKey, senderPublicKey);
  const ikm = await hkdfExpand(authPrk, keyInfo, 32);
  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk, textEncoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, textEncoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = concatBytes(textEncoder.encode(payloadText), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext));

  const recordSize = new Uint8Array([0, 0, 16, 0]);
  const keyLength = new Uint8Array([senderPublicKey.length]);
  return concatBytes(salt, recordSize, keyLength, senderPublicKey, ciphertext);
}

export async function sendWebPush(subscription, payload, env) {
  if (!env.VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY === "PUBLIC_KEY_PLACEHOLDER") {
    throw new Error("VAPID_PUBLIC_KEY is not configured");
  }
  if (!env.VAPID_PRIVATE_KEY) throw new Error("VAPID_PRIVATE_KEY is not configured");

  const body = await encryptPayload(subscription, JSON.stringify(payload));
  const jwt = await createVapidJwt(subscription.endpoint, env);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "2419200",
      Urgency: "normal"
    },
    body
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    expired: response.status === 404 || response.status === 410
  };
}
