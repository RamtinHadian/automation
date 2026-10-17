// Talks to the web service of Sepidar accounting (document "مستند نحوه استفاده از وب‌سرویس نرم‌افزار سپیدار", API version 101).
// Nothing here needs a package: only what Node.js itself has.
import crypto from 'node:crypto';

const b64u = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The key of the device is its 8-letter serial written twice (16 bytes: AES-128, CBC, PKCS7). */
const deviceKey = (serial) => {
  const key = Buffer.from(serial + serial, 'utf8');
  if (key.length !== 16) throw new Error('سریال دستگاه باید دقیقاً ۸ نویسه باشد (همان کدی که سپیدار بعد از ذخیرهٔ «دستگاه جدید» می‌دهد).');
  return key;
};

export const aesEncrypt = (serial, text) => {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-128-cbc', deviceKey(serial), iv);
  return { Cypher: Buffer.concat([c.update(text, 'utf8'), c.final()]).toString('base64'), IV: iv.toString('base64') };
};

export const aesDecrypt = (serial, cypher, iv) => {
  const d = crypto.createDecipheriv('aes-128-cbc', deviceKey(serial), Buffer.from(iv, 'base64'));
  return Buffer.concat([d.update(Buffer.from(cypher, 'base64')), d.final()]).toString('utf8');
};

/** <RSAKeyValue><Modulus>…</Modulus><Exponent>…</Exponent></RSAKeyValue> -> a key Node can encrypt with. */
export const publicKeyFromXml = (xml) => {
  const n = /<Modulus>([^<]+)<\/Modulus>/.exec(xml)?.[1];
  const e = /<Exponent>([^<]+)<\/Exponent>/.exec(xml)?.[1];
  if (!n || !e) throw new Error('کلید عمومی دریافت‌شده از سپیدار قابل خواندن نیست.');
  return crypto.createPublicKey({ key: { kty: 'RSA', n: b64u(n.trim()), e: b64u(e.trim()) }, format: 'jwk' });
};

export const rsaEncrypt = (publicKey, text) => crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(text, 'utf8')).toString('base64');

export const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

/** A stable GUID made from some text (the same customer or deal always gets the same one, so nothing is registered twice). */
export const guidFrom = (text) => {
  const h = crypto.createHash('sha1').update('hoormand:' + text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** fetch with a time limit and a clear Persian message when the other side cannot be reached (who = «هورمند» / «سپیدار»). */
export async function netFetch(url, opts = {}, who = 'سرور', seconds = 20) {
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(seconds * 1000) });
  } catch (e) {
    const code = e?.cause?.code || e?.cause?.errors?.[0]?.code || e?.code || '';
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return url;
      }
    })();
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new Error(`${who} در ${seconds} ثانیه جواب نداد (${host}). نشانی یا اینترنت یا روشن‌بودن سرویس را بررسی کنید.`);
    if (code === 'ECONNREFUSED') throw new Error(`اتصال به ${who} رد شد (${host}): سرویس روشن نیست یا پورت درست نیست.${who === 'سپیدار' ? ' در سپیدار دکمهٔ سبز «شروع» را بزنید.' : ''}`);
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') throw new Error(`نشانی ${who} پیدا نشد (${host}): نشانی را درست بنویسید و اینترنت را بررسی کنید.`);
    throw new Error(`اتصال به ${who} برقرار نشد (${host})${code ? ' [' + code + ']' : ''}: ${e?.message || ''}`);
  }
}

export class SepidarError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class Sepidar {
  /** cfg: { url, serial, userName, password, generationVersion?, authScheme? }; state: { publicKeyXml?, token? } (kept by the caller) */
  constructor(cfg, state = {}) {
    this.cfg = { generationVersion: '101', authScheme: 'Bearer', ...cfg };
    if (state && state.generationVersion && !cfg.generationVersion) this.cfg.generationVersion = state.generationVersion;
    this.state = state;
    this.base = this.cfg.url.replace(/\/+$/, '');
  }

  get integrationId() {
    return Number(this.cfg.serial.slice(0, 4));
  }

  async raw(method, path, { headers = {}, body } = {}) {
    const res = await netFetch(this.base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, 'سپیدار');
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = (data && (data.Message || data.message || data.error)) || (typeof data === 'string' ? data : '') || res.statusText;
      throw new SepidarError(res.status, `سپیدار (${res.status}): ${msg}`);
    }
    return data;
  }

  /** The API version this Sepidar speaks (the header GenerationVersion of every call); asked from Sepidar itself, else the configured / default one. */
  async detectVersion() {
    if (this.cfg.generationVersionFixed) return this.cfg.generationVersion;
    try {
      const r = await this.raw('GET', '/api/General/GenerationVersion');
      const v = typeof r === 'object' && r !== null ? r.GenerationVersion ?? r.Version ?? Object.values(r)[0] : r;
      if (v !== undefined && v !== null && String(v).trim() !== '' && !Number.isNaN(Number(v))) this.cfg.generationVersion = String(v).trim();
    } catch {
      /* the default version is used */
    }
    return this.cfg.generationVersion;
  }

  /** Done once: introduces this program to Sepidar and keeps the public key it answers with. */
  async register() {
    const id = this.integrationId;
    if (!Number.isInteger(id) || id <= 0) throw new SepidarError(0, `سریال دستگاه درست نیست: چهار نویسهٔ اولش باید عدد باشد (سریال «${this.cfg.serial}»). سریال را از صفحهٔ «دستگاه جدید» سپیدار کپی کنید.`);
    const version = await this.detectVersion();
    // The request is sent with the version header; if Sepidar still answers 400 / 401 the other usual shapes are tried before giving up
    const versions = [...new Set([version, '101', '100', '102'])];
    const shapes = [];
    for (const v of versions) for (const asText of [false, true]) shapes.push({ v, asText });
    const errors = [];
    for (const { v, asText } of shapes) {
      try {
        const { Cypher, IV } = aesEncrypt(this.cfg.serial, String(id));
        const r = await this.raw('POST', '/api/Devices/Register', {
          headers: { GenerationVersion: v },
          body: { Cypher, IntegrationID: asText ? String(id) : id, IV },
        });
        this.state.publicKeyXml = aesDecrypt(this.cfg.serial, r.Cypher, r.IV);
        publicKeyFromXml(this.state.publicKeyXml); // fails early if it is not a key
        this.cfg.generationVersion = v;
        this.state.generationVersion = v;
        return r.DeviceTitle;
      } catch (e) {
        if (!(e instanceof SepidarError) || ![400, 401, 415].includes(e.status)) throw e;
        const line = `نسخهٔ ${v}${asText ? '، شناسه به‌صورت متن' : ''}: ${e.message}`;
        if (!errors.includes(line)) errors.push(line);
      }
    }
    throw new SepidarError(401, 'سپیدار هر شکل درخواست را رد کرد: ' + errors.join(' | '));
  }

  /** The headers every call needs: a new GUID each time, and the same GUID encrypted with the public key. */
  deviceHeaders() {
    if (!this.state.publicKeyXml) throw new Error('هنوز دستگاه در سپیدار ثبت نشده است؛ اول دستور register را اجرا کنید.');
    const code = crypto.randomUUID();
    return {
      GenerationVersion: this.cfg.generationVersion,
      IntegrationID: String(this.integrationId),
      ArbitraryCode: code,
      EncArbitraryCode: rsaEncrypt(publicKeyFromXml(this.state.publicKeyXml), code),
    };
  }

  async login() {
    const r = await this.raw('POST', '/api/users/login', {
      headers: this.deviceHeaders(),
      body: { UserName: this.cfg.userName, PasswordHash: md5(this.cfg.password) },
    });
    this.token = r.Token;
    return r;
  }

  async call(method, path, body) {
    if (!this.token) await this.login();
    const go = () => this.raw(method, path, { headers: { ...this.deviceHeaders(), Authorization: `${this.cfg.authScheme} ${this.token}`.trim() }, body });
    try {
      return await go();
    } catch (e) {
      if (e instanceof SepidarError && e.status === 401) { // the token may have been replaced after a change of the user's rights
        await this.login();
        return go();
      }
      throw e;
    }
  }

  get(path) {
    return this.call('GET', path);
  }
  post(path, body) {
    return this.call('POST', path, body);
  }
}
