import { ClientHttp2Session, connect } from 'http2';

// TODO: Maybe implement session connection retry on error, goaway, etc.

export type Headers = Record<string, any>;

export interface RequestParams {
  headers?: Headers;
  body?: string | Uint8Array | ArrayBuffer;
  timeout?: number;
}

export interface Response {
  headers: Headers;
  body?: Buffer;
}

interface ClientOptions {}

export class Client {
  /** Caching strategy for sessions */
  #sessionPool = new Map<string, ClientHttp2Session>();

  #options: ClientOptions = {};

  constructor(options?: ClientOptions) {
    this.#options = options || {};
  }

  /**
   * Destroys the existing sessions in the client.
   */
  destroy() {
    for (const [_, session] of this.#sessionPool) {
      session.destroy();
    }

    this.#sessionPool.clear();
  }

  /**
   * Makes the request to the provided authority, returning either a promise with the result or
   * a promise with the unopened data stream depending on the server response.
   * @param {string} authority
   * @param {Object} params
   * @return {Promise<Response>}
   */
  request(authority: string, params: RequestParams = {}) {
    const { body } = params;

    if (body) {
      if (!(typeof body === 'string' || body instanceof Uint8Array || body instanceof ArrayBuffer)) {
        throw new Error('Invalid body type');
      }
    }

    return new Promise(async (resolve, reject) => {
      let session: ClientHttp2Session;

      try {
        session = await this.#getSession(authority);
      } catch (err) {
        reject(err);
        return;
      }

      const stream = session.request(params.headers, { endStream: false });
      let responded = false;

      if (params.timeout) {
        stream.setTimeout(params.timeout, () => {
          if (!responded) {
            stream.close();
            const timeoutError = new Error(`Stream timed out because of no activity for ${params.timeout} ms`);
            timeoutError.name = 'TimeoutError';
            reject(timeoutError);
          }
        });
      }

      stream.on('error', (err) => {
        reject(err);
      });

      const pipeData = () => {
        if (!body) {
          stream.end();
        }

        if (typeof body === 'string' || body instanceof Uint8Array || body instanceof ArrayBuffer) {
          stream.write(body);
          stream.end();
        }
      };

      if (stream.id) {
        pipeData();
      } else {
        stream.on('ready', pipeData);
      }

      stream.on('response', (headers) => {
        responded = true;

        const chunks: Array<Buffer> = [];

        stream.on('data', (chunk) => {
          chunks.push(chunk);
        });

        stream.on('end', () => {
          resolve({
            headers,
            body: Buffer.concat(chunks)
          });
        });
      });
    });
  };

  /**
   * Gets the memoized session by its authority
   * @private
   * @param {string} authority
   * @return {Promise<ClientHttp2Session | undefined>}
   */
  #getSession(authority: string): Promise<ClientHttp2Session | undefined> {
    return new Promise((resolve, reject) => {
      let session;

      if (this.#sessionPool.has(authority)) {
        session = this.#sessionPool.get(authority);
        resolve(session);
      } else {
        session = connect(authority);

        session.on('close', () => {
          this.#sessionPool.delete(authority);
          reject(new Error('Session closed'));
        });

        session.on('timeout', () => {
          this.#sessionPool.delete(authority);
          reject(new Error('Session timeout'));
        });

        session.on('error', (err) => {
          this.#sessionPool.delete(authority);
          reject(err);
        });

        session.on('goaway', () => {
          this.#sessionPool.delete(authority);
          reject(new Error('Session goaway'));
        });

        session.on('connect', () => {
          this.#sessionPool.set(authority, session);
          resolve(session);
        });
      }
    });
  };
}