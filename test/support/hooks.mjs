import assert from 'node:assert/strict';
import { After, AfterAll, Before, BeforeAll, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium } from 'playwright';
import { startServer } from '../../build/server.mjs';

setDefaultTimeout(15000);
let server;
let browser;
let baseUrl;
const cdnResponses = new Map();

function installGoogleStub() {
  const state = window.googleState = { maps: [], panoramas: [], coverage: [], requests: [], pending: [] };
  class LatLng {
    constructor(lat, lng) { this.latitude = lat; this.longitude = lng; }
    lat() { return this.latitude; }
    lng() { return this.longitude; }
  }
  class GoogleMap {
    constructor(container, options) {
      this.options = options;
      this.zoom = options.zoom;
      const positions = new Map();
      for (const index of [1, 2, 3]) positions.set(index, document.createElement('div'));
      this.__gm = { layoutManager: { positions } };
      state.maps.push(this);
    }
    getZoom() { return this.zoom; }
    setZoom(zoom) { this.zoom = zoom; }
    setCenter(center) { this.center = center; }
  }
  class StreetViewCoverageLayer {
    constructor() { state.coverage.push(this); }
    setMap(map) { this.map = map; }
  }
  class StreetViewPanorama {
    constructor(container, options) {
      this.container = container;
      this.options = options;
      this.listeners = {};
      this.position = new LatLng(45, 9);
      this.pov = { heading: 90 };
      state.panoramas.push(this);
    }
    addListener(name, callback) {
      this.listeners[name] = callback;
      return { remove: () => delete this.listeners[name] };
    }
    setPano(pano) { this.pano = pano; }
    setPov(pov) { this.pov = pov; this.listeners.pov_changed?.(); }
    setVisible(visible) { this.visible = visible; }
    getPosition() { return this.position; }
    getPov() { return this.pov; }
  }
  class StreetViewService {
    getPanoramaByLocation(position, radius, callback) {
      state.requests.push({ lat: position.lat(), lng: position.lng(), radius });
      const respond = () => callback({
        location: { pano: 'local-panorama', latLng: position },
      }, state.status || 'OK');
      if (state.defer) state.pending.push(respond);
      else respond();
    }
  }
  window.google = { maps: {
    Map: GoogleMap, LatLng, StreetViewCoverageLayer, StreetViewPanorama, StreetViewService,
    StreetViewStatus: { OK: 'OK' },
    ControlPosition: { BOTTOM_LEFT: 2, BOTTOM_RIGHT: 3 },
    geometry: { spherical: { computeHeading: () => 90 } },
    event: {
      addListenerOnce: (target, name, callback) => { queueMicrotask(callback); },
      clearListeners: () => {},
    },
  } };
}

function fetchCdn(url) {
  if (!cdnResponses.has(url)) {
    cdnResponses.set(url, fetch(url).then(async response => {
      if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
      return {
        body: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type'),
      };
    }));
  }
  return cdnResponses.get(url);
}

BeforeAll(async () => {
  server = await startServer(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
Before(async function() { this.baseUrl = baseUrl; });
Before({ tags: '@browser' }, async function() {
  this.leafletVersion = process.env.LEAFLET_VERSION || '1.9.4';
  this.testURL = (example, bundle = 'readable') =>
    `${baseUrl}/examples/${example}?leaflet=${this.leafletVersion}&bundle=${bundle}`;
  browser ??= await chromium.launch();
  this.context = await browser.newContext();
  this.external = [];
  this.requests = [];
  await this.context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(`${baseUrl}/leaflet-pegman.`)) {
      const requestURL = new URL(url);
      const pageURL = new URL(route.request().frame().url());
      const bundle = pageURL.searchParams.get('bundle') || 'readable';
      const extension = requestURL.pathname.endsWith('.css') ? 'css' : 'js';
      const filename = `leaflet-pegman${bundle === 'minified' ? '.min' : ''}.${extension}`;
      const { body, contentType } = await fetchCdn(`${baseUrl}/${filename}`);
      return route.fulfill({ body, contentType });
    }
    if (url.startsWith(`${baseUrl}/`)) return route.continue();
    this.requests.push(url);
    if (url.startsWith('https://unpkg.com/')) {
      const requestURL = new URL(url);
      const pageURL = new URL(route.request().frame().url());
      const version = pageURL.searchParams.get('leaflet') || this.leafletVersion;
      if (requestURL.pathname.startsWith('/leaflet@')) {
        requestURL.pathname = requestURL.pathname.replace(/leaflet@[^/]+\/dist\//, `leaflet@${version}/dist/`);
        if (version.startsWith('2.') && requestURL.pathname.endsWith('/leaflet.js')) {
          requestURL.pathname = requestURL.pathname.replace(/leaflet\.js$/, 'leaflet-global.js');
        }
        const { body, contentType } = await fetchCdn(requestURL.href);
        return route.fulfill({
          body: version.startsWith('2.') && requestURL.pathname.endsWith('leaflet-global.js')
            ? `${body}\nwindow.L = window.leaflet;`
            : body,
          contentType,
        });
      }
      const { body, contentType } = await fetchCdn(url);
      return route.fulfill({ body, contentType });
    }
    if (url.startsWith('https://maps.googleapis.com/maps/api/js')) {
      const callback = new URL(url).searchParams.get('callback');
      return route.fulfill({
        contentType: 'text/javascript',
        body: `${installGoogleStub.toString()}\ninstallGoogleStub();${callback ? `window[${JSON.stringify(callback)}]();` : ''}`,
      });
    }
    if (url.includes('.tile.openstreetmap.org/') || url.includes('.tile.opentopomap.org/')
      || url.includes('raruto.github.io/img/view-on-github.png')) {
      return route.abort();
    }
    this.external.push(url);
    return route.abort();
  });
  this.page = await this.context.newPage();
  this.errors = [];
  this.page.on('pageerror', error => this.errors.push(error.message));
});
After({ tags: '@browser' }, async function() {
  try {
    assert.deepEqual(this.errors, [], 'Unexpected browser errors');
  } finally {
    await this.context?.close();
  }
});
AfterAll({ timeout: 60000 }, async () => {
  try { await browser?.close(); }
  finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});
