import { Readable } from 'stream';
import { connect, constants as http2Constants } from 'http2';

const { HTTP2_HEADER_CONTENT_TYPE } = http2Constants;

// TODO: Maybe implement session connection retry on error, goaway, etc.

/**
 * @typedef RequestOptions
 * @property {Object<string, *>} headers
 * @property {string | Readable} body
 * @property {number} [timeout]
 */

/**
 * @typedef Response
 * @property {Object<string, *>} headers
 * @property {string|Readable} body
 */

export class Client {
  /**
   * Caching strategy for sessions
   * @type {Map<any, any>}
   */
  #sessionPool = new Map();

  constructor() {}

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
   * @param {RequestOptions} options
   * @return {Promise<Response>}
   */
  request(authority, options = {}) {
    const { body } = options;

    if (body && typeof body !== 'string' && !(body instanceof Readable)) {
      throw new Error('Invalid body type');
    }

    return new Promise(async (resolve, reject) => {
      let session;

      try {
        session = await this.#getSession(authority);
      } catch (err) {
        reject(err);
        return;
      }

      const stream = session.request(options.headers, { endStream: false });
      let responded = false;

      if (options.timeout) {
        stream.setTimeout(options.timeout, () => {
          if (!responded) {
            stream.close();
            const timeoutError = new Error(`Stream timed out because of no activity for ${options.timeout} ms`);
            timeoutError.name = "TimeoutError";
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

        if (typeof body === 'string') {
          stream.write(body);
          stream.end();
        }

        if (body instanceof Readable) {
          body.pipe(stream);
        }
      };

      if (stream.id) {
        pipeData();
      } else {
        stream.on('ready', pipeData);
      }

      stream.on('response', (headers) => {
        responded = true;

        if (headers[HTTP2_HEADER_CONTENT_TYPE]?.includes('stream')) {
          resolve({
            headers,
            body: stream
          });
          return;
        }

        let data;

        stream.on('data', (chunk) => {
          data = (data || '') + chunk;
        });

        stream.on('end', () => {
          resolve({
            headers,
            body: data
          });
        });
      });
    });
  };

  /**
   * Gets the memoized session by its authority
   * @private
   * @param {string} authority
   * @return {Promise<>}
   */
  #getSession(authority) {
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
