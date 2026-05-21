import { NotFoundError, handleError } from './errors.js';

export class Router {
  constructor() {
    this.routes = [];
    this.middleware = [];
  }

  use(fn) {
    this.middleware.push(fn);
    return this;
  }

  post(path, handler) {
    this.routes.push({ method: 'POST', path, handler });
    return this;
  }

  get(path, handler) {
    this.routes.push({ method: 'GET', path, handler });
    return this;
  }

  async dispatch(request) {
    try {
      const url = new URL(request.url);
      const method = request.method;
      const pathname = url.pathname;

      for (const route of this.routes) {
        const params = this._match(route.path, pathname);
        if (route.method === method && params !== null) {

          const ctx = { request, params, url, pathname };

          for (const mw of this.middleware) {
            const result = await mw(ctx);
            if (result === false) {
              return new Response(null, { status: 204 });
            }
          }

          const response = await route.handler(ctx);
          // Attach CORS headers from middleware (set in ctx.responseHeaders)
          return this._applyHeaders(response, ctx, request);
        }
      }

      throw new NotFoundError(`Route: ${method} ${pathname}`);
    } catch (err) {
      const errorResponse = handleError(err);
      return this._applyHeaders(errorResponse, null, request);
    }
  }

  _applyHeaders(response, ctx, request) {
    // If middleware set ctx.responseHeaders, merge them into the response
    if (ctx && ctx.responseHeaders) {
      const newHeaders = new Headers(response.headers);
      for (const [key, val] of Object.entries(ctx.responseHeaders)) {
        newHeaders.set(key, val);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }

    // Fallback: ensure CORS on every response
    if (!response.headers.has('Access-Control-Allow-Origin')) {
      const origin = request.headers.get('Origin') || '';
      const allowed = ['https://ai-lesson-engine.pages.dev', 'http://localhost:8787', 'http://localhost:3000', 'http://127.0.0.1:8787', 'http://127.0.0.1:3000'];
      if (allowed.includes(origin)) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', origin);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders
        });
      }
    }
    return response;
  }

  _match(routePath, requestPath) {
    const routeParts = routePath.split('/');
    const requestParts = requestPath.split('/');

    if (routeParts.length !== requestParts.length) return null;

    const params = {};
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = decodeURIComponent(requestParts[i]);
      } else if (routeParts[i] !== requestParts[i]) {
        return null;
      }
    }
    return params;
  }
}
