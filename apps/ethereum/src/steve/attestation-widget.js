// node_modules/tee-attestation-js/src/lib/cbor.js
function decode(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    bytes = new Uint8Array(bytes);
  }
  let offset = 0;
  function read() {
    const initial = bytes[offset++];
    const majorType = initial >> 5;
    const additionalInfo = initial & 31;
    let value;
    if (additionalInfo < 24) {
      value = additionalInfo;
    } else if (additionalInfo === 24) {
      value = bytes[offset++];
    } else if (additionalInfo === 25) {
      value = bytes[offset++] << 8 | bytes[offset++];
    } else if (additionalInfo === 26) {
      value = (bytes[offset++] << 24 >>> 0) + (bytes[offset++] << 16) + (bytes[offset++] << 8) + bytes[offset++];
    } else if (additionalInfo === 27) {
      value = 0;
      for (let i = 0; i < 8; i++) {
        value = value * 256 + bytes[offset++];
      }
    } else if (additionalInfo === 31) {
      value = -1;
    } else {
      throw new Error(`Unsupported additional info: ${additionalInfo}`);
    }
    switch (majorType) {
      case 0:
        return value;
      case 1:
        return -1 - value;
      case 2: {
        const result = bytes.slice(offset, offset + value);
        offset += value;
        return result;
      }
      case 3: {
        const strBytes = bytes.slice(offset, offset + value);
        offset += value;
        return new TextDecoder().decode(strBytes);
      }
      case 4: {
        const arr = [];
        if (value < 0) {
          while (bytes[offset] !== 255) {
            arr.push(read());
          }
          offset++;
        } else {
          for (let i = 0; i < value; i++) {
            arr.push(read());
          }
        }
        return arr;
      }
      case 5: {
        const obj = {};
        if (value < 0) {
          while (bytes[offset] !== 255) {
            const key = read();
            obj[key] = read();
          }
          offset++;
        } else {
          for (let i = 0; i < value; i++) {
            const key = read();
            obj[key] = read();
          }
        }
        return obj;
      }
      case 6:
        return read();
      case 7: {
        if (additionalInfo === 20) return false;
        if (additionalInfo === 21) return true;
        if (additionalInfo === 22) return null;
        if (additionalInfo === 23) return void 0;
        throw new Error(`Unsupported simple value: ${additionalInfo}`);
      }
      default:
        throw new Error(`Unknown major type: ${majorType}`);
    }
  }
  return read();
}
function encode(value) {
  const chunks = [];
  function encodeItem(val) {
    if (val === null) {
      chunks.push(new Uint8Array([246]));
    } else if (val === void 0) {
      chunks.push(new Uint8Array([247]));
    } else if (typeof val === "boolean") {
      chunks.push(new Uint8Array([val ? 245 : 244]));
    } else if (typeof val === "number") {
      if (Number.isInteger(val) && val >= 0 && val < 24) {
        chunks.push(new Uint8Array([val]));
      } else if (Number.isInteger(val) && val >= 0 && val < 256) {
        chunks.push(new Uint8Array([24, val]));
      } else if (Number.isInteger(val) && val >= 0 && val < 65536) {
        chunks.push(new Uint8Array([25, val >> 8, val & 255]));
      } else {
        throw new Error("Complex number encoding not implemented");
      }
    } else if (typeof val === "string") {
      const strBytes = new TextEncoder().encode(val);
      encodeLength(3, strBytes.length);
      chunks.push(strBytes);
    } else if (val instanceof Uint8Array) {
      encodeLength(2, val.length);
      chunks.push(val);
    } else if (Array.isArray(val)) {
      encodeLength(4, val.length);
      for (const item of val) {
        encodeItem(item);
      }
    } else if (typeof val === "object") {
      const keys = Object.keys(val);
      encodeLength(5, keys.length);
      for (const key of keys) {
        encodeItem(key);
        encodeItem(val[key]);
      }
    }
  }
  function encodeLength(majorType, length) {
    if (length < 24) {
      chunks.push(new Uint8Array([majorType << 5 | length]));
    } else if (length < 256) {
      chunks.push(new Uint8Array([majorType << 5 | 24, length]));
    } else if (length < 65536) {
      chunks.push(new Uint8Array([majorType << 5 | 25, length >> 8, length & 255]));
    } else {
      throw new Error("Length too large");
    }
  }
  encodeItem(value);
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let off = 0;
  for (const chunk of chunks) {
    result.set(chunk, off);
    off += chunk.length;
  }
  return result;
}

// node_modules/tee-attestation-js/src/lib/x509.js
function parseCertificate(der) {
  if (!(der instanceof Uint8Array)) {
    der = new Uint8Array(der);
  }
  let offset = 0;
  function readByte() {
    return der[offset++];
  }
  function readLength() {
    const first = readByte();
    if (first < 128) return first;
    const numBytes = first & 127;
    let length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = length << 8 | readByte();
    }
    return length;
  }
  function expectTag(expected) {
    const tag = readByte();
    if (tag !== expected) throw new Error(`Expected tag ${expected}, got ${tag}`);
    return readLength();
  }
  function skipElement() {
    readByte();
    const len = readLength();
    offset += len;
  }
  expectTag(48);
  const tbsStart = offset;
  const tbsLen = expectTag(48);
  const tbsEnd = offset + tbsLen;
  const tbsCertificate = der.slice(tbsStart, tbsEnd);
  if (der[offset] === 160) {
    offset++;
    const vLen = readLength();
    offset += vLen;
  }
  skipElement();
  skipElement();
  skipElement();
  const validityLen = expectTag(48);
  const validityEnd = offset + validityLen;
  readByte();
  const notBeforeLen = readLength();
  const notBeforeBytes = der.slice(offset, offset + notBeforeLen);
  const notBeforeStr = new TextDecoder().decode(notBeforeBytes);
  offset += notBeforeLen;
  readByte();
  const notAfterLen = readLength();
  const notAfterBytes = der.slice(offset, offset + notAfterLen);
  const notAfterStr = new TextDecoder().decode(notAfterBytes);
  offset = validityEnd;
  skipElement();
  const pubKeyStart = offset;
  const pubKeyOuterLen = expectTag(48);
  const pubKeyEnd = offset + pubKeyOuterLen;
  const publicKeyRaw = der.slice(pubKeyStart, pubKeyEnd);
  offset = tbsEnd;
  skipElement();
  readByte();
  const sigLen = readLength();
  readByte();
  const signature = der.slice(offset, offset + sigLen - 1);
  return {
    tbsCertificate,
    signature,
    publicKeyRaw,
    notBefore: parseASN1Time(notBeforeStr),
    notAfter: parseASN1Time(notAfterStr)
  };
}
function parseASN1Time(str) {
  str = str.replace("Z", "");
  if (str.length === 12) {
    const year = parseInt(str.slice(0, 2), 10);
    const fullYear = year >= 50 ? 1900 + year : 2e3 + year;
    return new Date(Date.UTC(
      fullYear,
      parseInt(str.slice(2, 4), 10) - 1,
      parseInt(str.slice(4, 6), 10),
      parseInt(str.slice(6, 8), 10),
      parseInt(str.slice(8, 10), 10),
      parseInt(str.slice(10, 12), 10)
    ));
  }
  return new Date(Date.UTC(
    parseInt(str.slice(0, 4), 10),
    parseInt(str.slice(4, 6), 10) - 1,
    parseInt(str.slice(6, 8), 10),
    parseInt(str.slice(8, 10), 10),
    parseInt(str.slice(10, 12), 10),
    parseInt(str.slice(12, 14), 10)
  ));
}
function ecdsaDerToRaw(der, curveBytes = 48) {
  let offset = 0;
  if (der[offset++] !== 48) throw new Error("Invalid DER signature");
  const seqLen = der[offset++];
  if (seqLen & 128) offset += seqLen & 127;
  if (der[offset++] !== 2) throw new Error("Invalid DER integer");
  let rLen = der[offset++];
  let rStart = offset;
  if (der[rStart] === 0) {
    rStart++;
    rLen--;
  }
  const r = der.slice(rStart, rStart + rLen);
  offset = rStart + rLen;
  if (der[offset++] !== 2) throw new Error("Invalid DER integer");
  let sLen = der[offset++];
  let sStart = offset;
  if (der[sStart] === 0) {
    sStart++;
    sLen--;
  }
  const s = der.slice(sStart, sStart + sLen);
  const result = new Uint8Array(curveBytes * 2);
  result.set(r, curveBytes - r.length);
  result.set(s, curveBytes * 2 - s.length);
  return result;
}
function pemToDer(pem) {
  const base64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
function bytesToHex(bytes) {
  if (!bytes) return "";
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// node_modules/tee-attestation-js/src/tee/nitro.js
var ROOT_CERT = `-----BEGIN CERTIFICATE-----
MIICETCCAZagAwIBAgIRAPkxdWgbkK/hHUbMtOTn+FYwCgYIKoZIzj0EAwMwSTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoMBkFtYXpvbjEMMAoGA1UECwwDQVdTMRswGQYD
VQQDDBJhd3Mubml0cm8tZW5jbGF2ZXMwHhcNMTkxMDI4MTMyODA1WhcNNDkxMDI4
MTQyODA1WjBJMQswCQYDVQQGEwJVUzEPMA0GA1UECgwGQW1hem9uMQwwCgYDVQQL
DANBV1MxGzAZBgNVBAMMEmF3cy5uaXRyby1lbmNsYXZlczB2MBAGByqGSM49AgEG
BSuBBAAiA2IABPwCVOumCMHzaHDimtqQvkY4MpJzbolL//Zy2YlES1BR5TSksfbb
48C8WBoyt7F2Bw7eEtaaP+ohG2bnUs990d0JX28TcPQXCEPZ3BABIeTPYwEoCWZE
h8l5YoQwTcU/9KNCMEAwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUkCW1DdkF
R+eWw5b6cp3PmanfS5YwDgYDVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMDA2kAMGYC
MQCjfy+Rocm9Xue4YnwWmNJVA44fA0P5W2OpYow9OYCVRaEevL8uO1XYru5xtMPW
rfMCMQCi85sWBbJwKKXdS6BptQFuZbT73o/gBh1qUxl/nNr12UO8Yfwr6wPLb+6N
IwLz3/Y=
-----END CERTIFICATE-----`;
function parse(document2) {
  const coseSign1 = decode(document2);
  if (!Array.isArray(coseSign1) || coseSign1.length !== 4) {
    throw new Error("Invalid COSE Sign1 structure");
  }
  const [protectedHeader, , payload, signature] = coseSign1;
  const decodedPayload = decode(payload);
  const pcrs = {};
  if (decodedPayload.pcrs) {
    for (const [index, value] of Object.entries(decodedPayload.pcrs)) {
      pcrs[`PCR${index}`] = bytesToHex(value);
    }
  }
  let userData = null;
  if (decodedPayload.user_data) {
    try {
      userData = JSON.parse(new TextDecoder().decode(decodedPayload.user_data));
    } catch {
      userData = { raw: bytesToHex(decodedPayload.user_data) };
    }
  }
  return {
    protectedHeader,
    payloadRaw: payload,
    payload: decodedPayload,
    signature,
    cabundle: decodedPayload.cabundle,
    pcrs,
    userData,
    nonce: decodedPayload.nonce ? bytesToHex(decodedPayload.nonce) : null,
    publicKey: decodedPayload.public_key || null,
    moduleId: decodedPayload.module_id,
    digest: decodedPayload.digest,
    timestamp: decodedPayload.timestamp
  };
}
async function verify(document2, options = {}) {
  const result = {
    verified: false,
    pcrs: {},
    userData: null,
    error: null
  };
  try {
    const parsed = parse(document2);
    const rootCert = options.rootCert || ROOT_CERT;
    const signingCert = parsed.payload.certificate;
    if (!signingCert) {
      throw new Error("No signing certificate in attestation document");
    }
    await verifyCertificateChain([...parsed.cabundle, signingCert], rootCert);
    await verifyCOSESignature(
      parsed.protectedHeader,
      parsed.payloadRaw,
      parsed.signature,
      signingCert
    );
    if (options.nonce) {
      const expectedNonce = options.nonce instanceof Uint8Array ? options.nonce : new Uint8Array(options.nonce);
      const receivedNonce = parsed.payload.nonce;
      if (!receivedNonce || !arraysEqual(new Uint8Array(receivedNonce), expectedNonce)) {
        throw new Error("Nonce mismatch - possible replay attack");
      }
    }
    if (options.pcrs) {
      for (const [pcr, expectedValue] of Object.entries(options.pcrs)) {
        const actualValue = parsed.pcrs[pcr];
        if (actualValue !== expectedValue.toLowerCase()) {
          throw new Error(`PCR mismatch: ${pcr} expected ${expectedValue}, got ${actualValue}`);
        }
      }
    }
    result.verified = true;
    result.pcrs = parsed.pcrs;
    result.userData = parsed.userData;
    result.publicKey = parsed.publicKey;
    result.moduleId = parsed.moduleId;
    result.digest = parsed.digest;
    result.timestamp = parsed.timestamp;
  } catch (error) {
    result.error = error.message;
  }
  return result;
}
async function verifyCertificateChain(cabundle, rootCertPem) {
  if (!cabundle || !Array.isArray(cabundle)) {
    throw new Error("Missing certificate bundle");
  }
  const rootDer = pemToDer(rootCertPem);
  const rootCert = parseCertificate(rootDer);
  let parentPublicKeyRaw = rootCert.publicKeyRaw;
  for (let i = 0; i < cabundle.length; i++) {
    const cert = parseCertificate(cabundle[i]);
    const now = Date.now();
    if (now < cert.notBefore.getTime() || now > cert.notAfter.getTime()) {
      throw new Error(`Certificate ${i} is not within validity period`);
    }
    const publicKey = await crypto.subtle.importKey(
      "spki",
      parentPublicKeyRaw,
      { name: "ECDSA", namedCurve: "P-384" },
      false,
      ["verify"]
    );
    const rawSignature = ecdsaDerToRaw(cert.signature);
    const isValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-384" },
      publicKey,
      rawSignature,
      cert.tbsCertificate
    );
    if (!isValid) {
      throw new Error(`Certificate ${i} signature verification failed`);
    }
    parentPublicKeyRaw = cert.publicKeyRaw;
  }
}
async function verifyCOSESignature(protectedHeader, payload, signature, signingCertDer) {
  const cert = parseCertificate(signingCertDer);
  const sigStructure = encode([
    "Signature1",
    protectedHeader,
    new Uint8Array(0),
    payload
  ]);
  const publicKey = await crypto.subtle.importKey(
    "spki",
    cert.publicKeyRaw,
    { name: "ECDSA", namedCurve: "P-384" },
    false,
    ["verify"]
  );
  const isValid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-384" },
    publicKey,
    signature,
    sigStructure
  );
  if (!isValid) {
    throw new Error("COSE signature verification failed");
  }
}

// src/index.js
var VERIFY_GUIDE_URL = "https://docs.caution.co/guides/verify-an-app/";
var CSS_STYLES = ".attestation-widget {\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Oxygen,\n    Ubuntu, sans-serif;\n  font-size: 14px;\n  line-height: 1.5;\n  color: #333;\n  box-sizing: border-box;\n}\n\n.attestation-widget *,\n.attestation-widget *::before,\n.attestation-widget *::after {\n  box-sizing: inherit;\n}\n\n.attestation-overlay {\n  position: fixed;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background: rgba(0, 0, 0, 0.5);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  z-index: 10000;\n  padding: 20px;\n}\n\n.attestation-modal {\n  background: white;\n  border-radius: 12px;\n  width: 100%;\n  max-width: 700px;\n  max-height: 85vh;\n  overflow: hidden;\n  display: flex;\n  flex-direction: column;\n  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);\n  position: relative;\n}\n\n.attestation-inline {\n  background: white;\n  border: 1px solid #e0e0e0;\n  border-radius: 12px;\n  overflow: hidden;\n  position: relative;\n}\n\n.attestation-header {\n  position: absolute;\n  top: 12px;\n  right: 12px;\n  z-index: 1;\n}\n\n.attestation-close {\n  background: none;\n  border: none;\n  font-size: 24px;\n  color: #999;\n  cursor: pointer;\n  padding: 0;\n  line-height: 1;\n  width: 32px;\n  height: 32px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  border-radius: 6px;\n  transition: background 0.2s, color 0.2s;\n}\n\n.attestation-close:hover {\n  background: #f5f5f5;\n  color: #333;\n}\n\n.attestation-body {\n  padding: 24px;\n  overflow-y: auto;\n  flex: 1;\n}\n\n.attestation-status {\n  margin-bottom: 16px;\n  padding: 12px 14px;\n  background: none;\n  border-radius: 8px;\n}\n\n.attestation-status-header {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.attestation-status-text {\n  order: 2;\n}\n\n.attestation-status-dot {\n  width: 10px;\n  height: 10px;\n  border-radius: 50%;\n  flex-shrink: 0;\n  order: 1;\n  margin: 0;\n}\n\n.attestation-status--expandable {\n  cursor: pointer;\n}\n\n.attestation-status--expandable > summary {\n  list-style: none;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.attestation-status--expandable > summary::-webkit-details-marker {\n  display: none;\n}\n\n.attestation-status--expandable > summary::after {\n  content: \"+\";\n  font-size: 1.05rem;\n  font-weight: 400;\n  color: #666;\n  margin-left: auto;\n  flex-shrink: 0;\n  order: 3;\n}\n\n.attestation-status--expandable[open] > summary::after {\n  content: \"−\";\n}\n\n.attestation-status--expandable > summary:hover {\n  background: rgba(0, 0, 0, 0.02);\n  margin: -12px -14px;\n  padding: 12px 14px;\n  border-radius: 8px 8px 0 0;\n}\n\n.attestation-status--expandable:not([open]) > summary:hover {\n  border-radius: 8px;\n}\n\n.attestation-status-dot--connecting {\n  background: #f59e0b;\n  animation: attestation-pulse 1.5s ease-in-out infinite;\n}\n\n.attestation-status-dot--connected {\n  background: #22c55e;\n}\n\n.attestation-status-dot--disconnected {\n  background: #ef4444;\n}\n\n.attestation-status-dot--error {\n  background: #ef4444;\n}\n\n.attestation-status-text {\n  font-size: 0.95rem;\n  color: #333;\n}\n\n@keyframes attestation-pulse {\n  0%,\n  100% {\n    opacity: 1;\n  }\n  50% {\n    opacity: 0.4;\n  }\n}\n\n.attestation-status-content {\n  margin-top: 12px;\n  padding-top: 12px;\n  border-top: none;\n  font-size: 0.95rem;\n  line-height: 1.6;\n  color: #555;\n  overflow: hidden;\n}\n\n.attestation-status-content p {\n  margin: 0 0 10px 0;\n  font-size: 0.9rem;\n}\n\n.attestation-status-content p:last-child {\n  margin-bottom: 0;\n}\n\n.attestation-diagram {\n  background: #f8f9fa;\n  border-radius: 6px;\n  padding: 12px;\n  font-family: \"SF Mono\", Monaco, \"Courier New\", monospace;\n  font-size: 10px;\n  line-height: 1.4;\n  overflow-x: auto;\n  margin: 10px 0;\n  color: #333;\n}\n\n.attestation-steps {\n  margin: 10px 0;\n  padding-left: 1.5em;\n  list-style-type: decimal;\n}\n\n.attestation-step {\n  margin-bottom: 4px;\n  font-size: 0.9rem;\n}\n\n.attestation-step:last-of-type {\n  margin-bottom: 0;\n}\n\n.attestation-note {\n  padding-top: 10px;\n  border-top: 1px solid #e5e5e5;\n  color: #8e8ea0;\n  font-size: 11px;\n}\n\n.attestation-external-link {\n  color: #f048b5;\n  text-decoration: underline;\n}\n\n.attestation-external-link:hover {\n  color: #d43a9e;\n}\n\n.attestation-external-link svg {\n  vertical-align: middle;\n  margin-left: 3px;\n}\n\n.attestation-status--expandable .attestation-sections {\n  margin-top: 12px;\n  padding-top: 12px;\n  border-top: none;\n}\n\n.attestation-endpoint {\n  background: #f8f9fa;\n  padding: 12px 16px;\n  border-radius: 12px;\n  margin-bottom: 12px;\n  font-size: 0.85rem;\n  line-height: 1.25;\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  box-sizing: border-box;\n}\n\n.attestation-endpoint-label {\n  color: #666;\n  white-space: nowrap;\n  flex-shrink: 0;\n}\n\n.attestation-endpoint-url {\n  font-family: \"SF Mono\", Monaco, \"Courier New\", monospace;\n  color: #333;\n  background: none;\n  padding: 0;\n  flex: 1;\n  word-break: break-all;\n}\n\n.attestation-copy-btn {\n  background: white;\n  border: 1px solid #ddd;\n  border-radius: 4px;\n  padding: 0;\n  width: 24px;\n  height: 24px;\n  font-size: 12px;\n  cursor: pointer;\n  color: #666;\n  transition: all 0.2s;\n  flex-shrink: 0;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.attestation-copy-btn:hover {\n  border-color: #ccc;\n  color: #f048b5;\n}\n\n.attestation-copy-btn--success {\n  background: white;\n  border-color: #4caf50;\n  color: #2e7d32;\n}\n\n.attestation-loading {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n  padding: 40px 20px;\n  color: #666;\n}\n\n.attestation-spinner {\n  width: 20px;\n  height: 20px;\n  border: 2px solid #e0e0e0;\n  border-top-color: #f048b5;\n  border-radius: 50%;\n  animation: attestation-spin 0.8s linear infinite;\n}\n\n@keyframes attestation-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n.attestation-status--result {\n  margin-bottom: 16px;\n}\n\n.attestation-verify-btn {\n  display: block;\n  width: 100%;\n  text-align: center;\n}\n\n.attestation-btn {\n  padding: 10px 20px;\n  border-radius: 12px;\n  font-size: 0.95rem;\n  font-weight: 500;\n  cursor: pointer;\n  text-decoration: none;\n  display: inline-block;\n  transition: background 0.2s, color 0.2s;\n  border: none;\n}\n\n.attestation-btn--primary {\n  background: linear-gradient(\n    180deg,\n    rgb(55, 55, 55) 0%,\n    rgb(35, 35, 35) 40%,\n    rgb(25, 25, 25) 100%\n  );\n  color: white;\n}\n\n.attestation-btn--primary:hover {\n  background: linear-gradient(\n    180deg,\n    rgb(65, 65, 65) 0%,\n    rgb(45, 45, 45) 40%,\n    rgb(35, 35, 35) 100%\n  );\n  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.12),\n    inset 0 0 20px 0 rgba(255, 255, 255, 0.05);\n  color: #f048b5;\n}\n\n.attestation-btn--secondary {\n  background: #f5f5f5;\n  color: #666;\n  border: 1px solid #ddd;\n}\n\n.attestation-btn--secondary:hover {\n  background: #eee;\n  color: #333;\n}\n\n.attestation-sections {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.attestation-section {\n  border: 1px solid #e0e0e0;\n  border-radius: 8px;\n  overflow: hidden;\n}\n\n.attestation-section summary {\n  padding: 12px 16px;\n  background: #f8f9fa;\n  cursor: pointer;\n  font-weight: 600;\n  font-size: 0.9rem;\n  color: #333;\n  list-style: none;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  user-select: none;\n}\n\n.attestation-section summary::-webkit-details-marker {\n  display: none;\n}\n\n.attestation-section summary::before {\n  content: \"▶\";\n  font-size: 10px;\n  transition: transform 0.2s;\n}\n\n.attestation-section[open] summary::before {\n  transform: rotate(90deg);\n}\n\n.attestation-section summary:hover {\n  background: #f0f0f0;\n}\n\n.attestation-section-content {\n  padding: 16px;\n  border-top: 1px solid #e0e0e0;\n}\n\n.attestation-checks {\n  display: flex;\n  flex-direction: column;\n}\n\n.attestation-check {\n  display: flex;\n  align-items: flex-start;\n  gap: 10px;\n  padding: 8px 0;\n  font-size: 14px;\n}\n\n.attestation-check-icon {\n  width: 20px;\n  text-align: center;\n  flex-shrink: 0;\n}\n\n.attestation-check--success .attestation-check-icon {\n  color: #2e7d32;\n}\n\n.attestation-check--error .attestation-check-icon {\n  color: #c62828;\n}\n\n.attestation-check--pending .attestation-check-icon {\n  color: #999;\n}\n\n.attestation-check-message {\n  word-break: break-all;\n  font-family: \"SF Mono\", Monaco, \"Courier New\", monospace;\n  font-size: 0.9rem;\n  color: #333;\n}\n\n.attestation-pcrs {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.attestation-pcr {\n  display: flex;\n  align-items: start;\n  gap: 8px;\n  padding: 6px 0;\n  font-size: 13px;\n}\n\n.attestation-pcr-label {\n  color: #666;\n  min-width: 50px;\n  flex-shrink: 0;\n}\n\n.attestation-pcr-value {\n  font-family: \"SF Mono\", Monaco, \"Courier New\", monospace;\n  word-break: break-all;\n  color: #333;\n  background: none;\n  flex: 1;\n  padding: 0;\n}\n\n.attestation-sources {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n\n.attestation-source {\n  display: flex;\n  align-items: baseline;\n  gap: 12px;\n  padding: 8px 12px;\n  background: #f8f9fa;\n  border-radius: 6px;\n}\n\n.attestation-source-label {\n  color: #666;\n  font-weight: 500;\n  min-width: 80px;\n  flex-shrink: 0;\n}\n\n.attestation-source-details {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 8px;\n  font-family: \"SF Mono\", Monaco, \"Courier New\", monospace;\n  font-size: 12px;\n  word-break: break-all;\n}\n\n.attestation-source-link {\n  color: #f048b5;\n  text-decoration: none;\n}\n\n.attestation-source-link:hover {\n  text-decoration: underline;\n}\n\n.attestation-source-value {\n  color: #333;\n}\n\n.attestation-source-meta {\n  color: #888;\n  font-size: 11px;\n}\n\n.attestation-source-branch {\n  color: #0f0f0f;\n  font-size: 11px;\n}\n\n.attestation-raw {\n  margin: 0;\n  padding: 12px;\n  background: #f8f9fa;\n  border-radius: 6px;\n  font-family: \"SF Mono\", Monaco, \"Courier New\", monospace;\n  font-size: 11px;\n  overflow-x: auto;\n  white-space: pre-wrap;\n  word-break: break-all;\n  max-height: 300px;\n  overflow-y: auto;\n  color: #333;\n}\n\n@media (max-width: 1399px) {\n  .attestation-endpoint {\n    flex-wrap: wrap;\n  }\n\n  .attestation-endpoint-label {\n    flex-basis: 100%;\n    white-space: normal;\n  }\n}\n\n@media (max-width: 600px) {\n  .attestation-modal {\n    max-height: 95vh;\n    border-radius: 8px;\n  }\n\n  .attestation-header {\n    padding: 16px 20px;\n  }\n\n  .attestation-body {\n    padding: 20px;\n  }\n\n  .attestation-footer {\n    padding: 12px 20px;\n  }\n\n  .attestation-source {\n    flex-direction: column;\n    gap: 4px;\n  }\n\n  .attestation-source-label {\n    min-width: auto;\n  }\n}\n";
var stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  if (CSS_STYLES === "__INLINE_CSS__") return;
  const style = document.createElement("style");
  style.textContent = CSS_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}
var AttestationWidget = class {
  constructor(options = {}) {
    this.attestationUrl = options.attestationUrl || "/attestation";
    this.mode = options.mode || "modal";
    this.onClose = options.onClose || (() => {
    });
    this.onVerified = options.onVerified || (() => {
    });
    this.onError = options.onError || (() => {
    });
    this.onStatusChange = options.onStatusChange || (() => {
    });
    this.autoVerify = options.autoVerify !== false;
    this.showBanner = options.showBanner !== false;
    this.showVerifyButton = options.showVerifyButton !== false;
    this.showChecks = options.showChecks !== false;
    this.showUserData = options.showUserData !== false;
    this.showPCRs = options.showPCRs !== false;
    this.showSources = options.showSources !== false;
    this.showRaw = options.showRaw !== false;
    this.showConnectionStatus = options.showConnectionStatus !== false;
    this.container = null;
    this.checks = [];
    this.result = null;
    this.rawResponse = null;
    this.connectionStatus = "connecting";
    this.statusMessage = "Establishing connection...";
  }
  /**
   * Render the widget into a target element
   * @param {HTMLElement|string} target - Element or selector to render into
   */
  render(target) {
    injectStyles();
    const targetEl = typeof target === "string" ? document.querySelector(target) : target;
    if (!targetEl) {
      throw new Error("Target element not found");
    }
    this.container = document.createElement("div");
    this.container.className = `attestation-widget attestation-widget--${this.mode}`;
    if (this.mode === "modal") {
      this.container.innerHTML = this._renderModal();
      this.container.querySelector(".attestation-overlay").addEventListener("click", (e) => {
        if (e.target.classList.contains("attestation-overlay")) {
          this.close();
        }
      });
    } else {
      this.container.innerHTML = this._renderInline();
    }
    targetEl.appendChild(this.container);
    this._bindEvents();
    if (this.autoVerify) {
      this.verify();
    }
    return this;
  }
  _renderModal() {
    return `
      <div class="attestation-overlay">
        <div class="attestation-modal">
          <div class="attestation-header">
            <button class="attestation-close" aria-label="Close">&times;</button>
          </div>
          ${this._renderBody()}
        </div>
      </div>
    `;
  }
  _renderInline() {
    return `
      <div class="attestation-inline">
        ${this._renderBody()}
      </div>
    `;
  }
  _renderBody() {
    return `
      <div class="attestation-body">
        <div class="attestation-content">
          ${this._renderLoading()}
        </div>
      </div>
    `;
  }
  _renderConnectionStatus() {
    if (this.connectionStatus !== "connected") {
      return `
        <div class="attestation-status">
          <div class="attestation-status-header">
            <div class="attestation-status-dot attestation-status-dot--${this.connectionStatus}"></div>
            <span class="attestation-status-text">${this._escapeHtml(this.statusMessage)}</span>
          </div>
        </div>
      `;
    }
    return `
      <details class="attestation-status attestation-status--expandable">
        <summary class="attestation-status-header">
          <div class="attestation-status-dot attestation-status-dot--${this.connectionStatus}"></div>
          <span class="attestation-status-text">${this._escapeHtml(this.statusMessage)}</span>
        </summary>
        <div class="attestation-status-content">
          <p>This app runs inside a secure enclave with transparent end-to-end encryption. Your data is encrypted in the browser and only decrypted inside the enclave.</p>
          <p>The following diagram illustrates how end-to-end encryption works:</p>
<pre class="attestation-diagram">
  App                     Host                     Enclave
   |                        |                          |
   |------ TLS (outer) ---->|                          |
   |                        |------ plaintext -------->|
   |                        |                          |
   |====== E2E (inner) ===============================>|
</pre>
          <ol class="attestation-steps">
            <li class="attestation-step"><strong>App</strong> (Browser) - The service worker intercepts requests, encrypts/decrypts</li>
            <li class="attestation-step"><strong>Host Proxy</strong> (Server) - Terminates TLS, forwards encrypted payload to enclave</li>
            <li class="attestation-step"><strong>Enclave Proxy</strong> (Enclave) - Decrypts requests, encrypts responses</li>
          </ol>
          <p class="attestation-note">The encryption key is derived from the enclave's public key, which is embedded in the attestation document and cryptographically signed by the enclave hardware. This ensures only the verified enclave can decrypt your data.</p>
          <p class="attestation-note">To learn more, refer to the <a href="https://git.distrust.co/public/steve" target="_blank" rel="noopener noreferrer" class="attestation-external-link"><span>STEVE repository</span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a>.
        </div>
      </details>
    `;
  }
  /**
   * Update connection status
   * @param {string} status - 'connecting' | 'connected' | 'disconnected' | 'error'
   * @param {string} message - Status message to display
   */
  setStatus(status, message) {
    this.connectionStatus = status;
    this.statusMessage = message;
    this._updateConnectionStatus();
    this.onStatusChange({ status, message });
  }
  _updateConnectionStatus() {
    const statusEl = this.container?.querySelector(".attestation-status:not(.attestation-status--result)");
    if (statusEl && this.showConnectionStatus) {
      const dotEl = statusEl.querySelector(".attestation-status-dot");
      const textEl = statusEl.querySelector(".attestation-status-text");
      if (dotEl) {
        dotEl.className = `attestation-status-dot attestation-status-dot--${this.connectionStatus}`;
      }
      if (textEl) {
        textEl.textContent = this.statusMessage;
      }
    }
  }
  _renderEndpoint() {
    const fullUrl = new URL(this.attestationUrl, window.location.origin).href;
    return `
      <div class="attestation-endpoint">
        <span class="attestation-endpoint-label">Attestation URL:</span>
        <code class="attestation-endpoint-url">${this._escapeHtml(fullUrl)}</code>
        <button class="attestation-copy-btn" data-copy="${this._escapeHtml(fullUrl)}" title="Copy to clipboard">\u29C9</button>
      </div>
    `;
  }
  _bindEvents() {
    const closeButton = this.container.querySelector(".attestation-close");
    if (closeButton) {
      closeButton.addEventListener("click", () => this.close());
    }
    this._bindCopyButtons();
  }
  _bindCopyButtons() {
    this.container.querySelectorAll(".attestation-copy-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const text = btn.dataset.copy;
        try {
          await navigator.clipboard.writeText(text);
          const original = btn.textContent;
          btn.textContent = "\u2713";
          btn.classList.add("attestation-copy-btn--success");
          setTimeout(() => {
            btn.textContent = original;
            btn.classList.remove("attestation-copy-btn--success");
          }, 1500);
        } catch (err) {
          console.error("Failed to copy:", err);
        }
      });
    });
  }
  /**
   * Perform attestation verification
   */
  async verify() {
    this.checks = [];
    this.result = null;
    this.setStatus("connecting", "Connecting to enclave...");
    this._updateContent(this._renderLoading());
    try {
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const encoded_nonce = this._bytesToBase64(nonce);
      this._addCheck("nonce", `Challenge nonce: ${encoded_nonce}`, "success");
      this._addCheck("request", "Requesting attestation...", "pending");
      this.setStatus("connecting", "Requesting attestation...");
      let response;
      try {
        response = await fetch(this.attestationUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nonce: encoded_nonce })
        });
      } catch (fetchError) {
        this.setStatus("disconnected", `Connection failed: ${fetchError.message}`);
        throw new Error(fetchError.message);
      }
      if (!response.ok) {
        const errorMsg = `server returned ${response.status}`;
        this.setStatus("error", `Connection failed: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      this._addCheck("request", "Attestation received", "success");
      this.setStatus("connecting", "Verifying attestation...");
      const jsonResponse = await response.json();
      this.rawResponse = jsonResponse;
      if (jsonResponse.error) {
        throw new Error(jsonResponse.error);
      }
      const attestationB64 = jsonResponse.document;
      if (!attestationB64) {
        throw new Error("No attestation document in response");
      }
      const attestationBytes = Uint8Array.from(atob(attestationB64), (c) => c.charCodeAt(0));
      this._addCheck("decode", "Decoding COSE Sign1 attestation document", "success");
      this._addCheck("verify", "Verifying attestation...", "pending");
      const verifyResult = await verify(attestationBytes, { nonce });
      if (!verifyResult.verified) {
        throw new Error(verifyResult.error || "Authentication failed");
      }
      this._addCheck("verify", "COSE signature verified", "success");
      this._addCheck("root_ca", "AWS Nitro root CA validated", "success");
      this._addCheck("cert_chain", "Certificate chain verified (root \u2192 intermediate \u2192 end entity)", "success");
      this._addCheck("validity", "Certificate validity periods checked", "success");
      this._addCheck("nonce_match", "Challenge nonce matches attestation document", "success");
      this._addCheck("pcrs", "PCR values authenticated", "success");
      const manifest = jsonResponse.manifest || verifyResult.userData;
      this.result = {
        verified: true,
        pcrs: verifyResult.pcrs,
        userData: verifyResult.userData,
        manifest,
        moduleId: verifyResult.moduleId
      };
      this.setStatus("connected", "Secure channel established");
      this._updateContent(this._renderResult());
      this.onVerified(this.result);
    } catch (err) {
      this._addCheck("error", err.message, "error");
      this.result = { verified: false, error: err.message };
      if (this.connectionStatus === "connecting") {
        this.setStatus("error", `Connection failed: ${err.message}`);
      } else if (this.connectionStatus !== "connected") {
        this.setStatus(this.connectionStatus, this.statusMessage);
      }
      this._updateContent(this._renderResult());
      this.onError(err);
    }
  }
  _addCheck(id, message, status) {
    const existing = this.checks.find((c) => c.id === id);
    if (existing) {
      existing.message = message;
      existing.status = status;
    } else {
      this.checks.push({ id, message, status });
    }
  }
  _renderLoading() {
    const connectionStatus = this.showConnectionStatus ? this._renderConnectionStatus() : "";
    return `
      <div class="attestation-status">
        <div class="attestation-status-header">
          <div class="attestation-status-dot attestation-status-dot--connecting"></div>
          <span class="attestation-status-text">Verifying attestation...</span>
        </div>
      </div>
      ${connectionStatus}
    `;
  }
  _renderResult() {
    if (!this.result) return this._renderLoading();
    const statusClass = this.result.verified ? "connected" : "error";
    const bannerText = this.result.verified ? "Attestation authenticated" : `Attestation failed: ${this.result.error}`;
    let banner = "";
    if (this.showBanner) {
      if (this.result.verified) {
        const innerSections = `
          ${this.showChecks ? this._renderChecksSection() : ""}
          ${this.showPCRs ? this._renderPCRsSection() : ""}
          ${this.showSources ? this._renderSourcesSection() : ""}
          ${this.showUserData ? this._renderUserDataSection() : ""}
          ${this.showRaw ? this._renderRawSection() : ""}
        `;
        banner = `
          <details class="attestation-status attestation-status--expandable attestation-status--result">
            <summary class="attestation-status-header">
              <div class="attestation-status-dot attestation-status-dot--${statusClass}"></div>
              <span class="attestation-status-text">${bannerText}</span>
            </summary>
            <div class="attestation-status-content">
              <p>This is the attestation data from the enclave.</p>
            </div>
            <div class="attestation-sections">
              ${innerSections}
            </div>
          </details>
        `;
      } else {
        banner = `
          <div class="attestation-status attestation-status--result">
            <div class="attestation-status-header">
              <div class="attestation-status-dot attestation-status-dot--${statusClass}"></div>
              <span class="attestation-status-text">${bannerText}</span>
            </div>
          </div>
        `;
      }
    }
    let verifyButton = "";
    if (this.result.verified && this.showVerifyButton) {
      verifyButton = `
        <a href="${VERIFY_GUIDE_URL}" target="_blank" rel="noopener" class="attestation-btn attestation-btn--primary attestation-verify-btn">
          Verify this app
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 0 2.5px 2px; vertical-align: middle;">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      `;
    }
    const connectionStatus = this.showConnectionStatus ? this._renderConnectionStatus() : "";
    return `
      ${banner}
      ${connectionStatus}
      ${this._renderEndpoint()}
      ${verifyButton}
    `;
  }
  _renderChecksSection() {
    const checksHtml = this.checks.map((check) => `
      <div class="attestation-check attestation-check--${check.status}">
        <span class="attestation-check-icon">
          ${check.status === "success" ? "\u2713" : check.status === "error" ? "\u2717" : "\u25CB"}
        </span>
        <span class="attestation-check-message">${this._escapeHtml(check.message)}</span>
      </div>
    `).join("");
    return `
      <details class="attestation-section">
        <summary>Authentication Steps</summary>
        <div class="attestation-section-content">
          <div class="attestation-checks">${checksHtml}</div>
        </div>
      </details>
    `;
  }
  _renderUserDataSection() {
    if (!this.result?.userData) return "";
    return `
      <details class="attestation-section">
        <summary>User Data</summary>
        <div class="attestation-section-content">
          <pre class="attestation-raw">${this._escapeHtml(JSON.stringify(this.result.userData, null, 2))}</pre>
        </div>
      </details>
    `;
  }
  _renderPCRsSection() {
    if (!this.result?.pcrs) return "";
    const nonZeroPcrs = Object.entries(this.result.pcrs).filter(([name, value]) => {
      return !/^0+$/.test(value);
    });
    if (nonZeroPcrs.length === 0) return "";
    const pcrsHtml = nonZeroPcrs.map(([name, value]) => `
      <div class="attestation-pcr">
        <span class="attestation-pcr-label">${name}:</span>
        <code class="attestation-pcr-value">${value}</code>
        <button class="attestation-copy-btn" data-copy="${value}" title="Copy to clipboard">\u29C9</button>
      </div>
    `).join("");
    return `
      <details class="attestation-section">
        <summary>PCR Values</summary>
        <div class="attestation-section-content">
          <div class="attestation-pcrs">${pcrsHtml}</div>
        </div>
      </details>
    `;
  }
  _renderSourcesSection() {
    if (!this.result?.manifest) return "";
    const manifest = this.result.manifest;
    let sourcesHtml = "";
    if (manifest.app_source) {
      sourcesHtml += this._renderSourceItem("App", manifest.app_source);
    }
    if (manifest.enclave_source) {
      sourcesHtml += this._renderSourceItem("Enclave", manifest.enclave_source);
    }
    if (manifest.framework_source) {
      sourcesHtml += this._renderSourceItem("Framework", manifest.framework_source);
    }
    if (!sourcesHtml) return "";
    return `
      <details class="attestation-section">
        <summary>Sources</summary>
        <div class="attestation-section-content">
          <div class="attestation-sources">${sourcesHtml}</div>
        </div>
      </details>
    `;
  }
  _renderSourceItem(label, source) {
    const url = this._getSourceUrl(source);
    const commit = source.commit ? source.commit.slice(0, 12) : "";
    const branch = source.branch || "";
    let urlHtml = url ? `<a href="${this._escapeHtml(url)}" target="_blank" rel="noopener" class="attestation-source-link">${this._escapeHtml(url)}</a>` : `<span class="attestation-source-value">${this._escapeHtml(this._formatSource(source))}</span>`;
    return `
      <div class="attestation-source">
        <span class="attestation-source-label">${label}:</span>
        <div class="attestation-source-details">
          ${urlHtml}
          ${commit ? `<span class="attestation-source-meta">@ ${commit}</span>` : ""}
          ${branch ? `<span class="attestation-source-branch">(${branch})</span>` : ""}
        </div>
      </div>
    `;
  }
  _renderRawSection() {
    if (!this.rawResponse) return "";
    return `
      <details class="attestation-section">
        <summary>Raw Response</summary>
        <div class="attestation-section-content">
          <pre class="attestation-raw">${this._escapeHtml(JSON.stringify(this.rawResponse, null, 2))}</pre>
        </div>
      </details>
    `;
  }
  _updateContent(html) {
    const content = this.container.querySelector(".attestation-content");
    if (content) {
      content.innerHTML = html;
      this._bindCopyButtons();
    }
  }
  _getSourceUrl(source) {
    if (!source) return null;
    if (typeof source === "string") return source.startsWith("http") ? source : null;
    return source.urls?.[0] || source.url || null;
  }
  _formatSource(source) {
    if (typeof source === "string") return source;
    return source.url || JSON.stringify(source);
  }
  _bytesToBase64(bytes) {
    return bytes.toBase64();
  }
  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  /**
   * Close the widget (for modal mode)
   */
  close() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.onClose();
  }
  /**
   * Destroy the widget and clean up
   */
  destroy() {
    this.close();
  }
};
function showModal(options = {}) {
  const widget = new AttestationWidget({
    ...options,
    mode: "modal"
  });
  widget.render(document.body);
  return widget;
}
function renderInline(target, options = {}) {
  const widget = new AttestationWidget({
    ...options,
    mode: "inline"
  });
  widget.render(target);
  return widget;
}
var src_default = AttestationWidget;
var AttestationWidgetElement = class extends HTMLElement {
  constructor() {
    super();
    this.widget = null;
  }
  connectedCallback() {
    const attestationUrl = this.getAttribute("attestation-url") || window.location.origin + "/attestation";
    const mode = this.getAttribute("mode") || "inline";
    const autoVerify = this.getAttribute("auto-verify") !== "false";
    this.widget = new AttestationWidget({
      attestationUrl,
      mode,
      autoVerify,
      showBanner: this.getAttribute("show-banner") !== "false",
      showVerifyButton: this.getAttribute("show-verify-button") !== "false",
      showChecks: this.getAttribute("show-checks") !== "false",
      showUserData: this.getAttribute("show-user-data") !== "false",
      showPCRs: this.getAttribute("show-pcrs") !== "false",
      showSources: this.getAttribute("show-sources") !== "false",
      showRaw: this.getAttribute("show-raw") !== "false",
      showConnectionStatus: this.getAttribute("show-connection-status") !== "false"
    });
    this.widget.render(this);
  }
  disconnectedCallback() {
    if (this.widget) {
      this.widget.destroy();
      this.widget = null;
    }
  }
};
if (typeof window !== "undefined" && window.customElements) {
  customElements.define("attestation-widget", AttestationWidgetElement);
}
export {
  AttestationWidget,
  src_default as default,
  renderInline,
  showModal
};
