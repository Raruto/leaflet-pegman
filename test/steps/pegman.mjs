import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';

Given('the {string} plugin and its dependencies are loaded', async function(bundle) {
  await this.page.goto(this.testURL('leaflet-pegman.html', bundle));
  await this.page.evaluate(() => {
    map.setView([45, 9], 15);
    pegmanControl.remove();
    installGoogleStub();
  });
  assert.equal(await this.page.evaluate(() => L.version), this.leafletVersion);
});
When('I add a Pegman control', async function() {
  await this.page.evaluate(() => { window.control = new L.Control.Pegman().addTo(map); });
  assert.equal(await this.page.locator('.pegman-control').count(), 1);
});
Then('clicking the control toggles coverage', async function() {
  await this.page.locator('.pegman-control').click();
  await this.page.waitForFunction(() => control._streetViewLayerEnabled && googleState.coverage.length === 1);
  assert.equal(await this.page.evaluate(() => control._googleStreetViewLayer instanceof L.GridLayer.GoogleMutant), true);
  await this.page.waitForFunction(() => !!control._googleStreetViewLayer._attributionContainer);
  await this.page.locator('.pegman-control').click();
  assert.equal(await this.page.evaluate(() => control._streetViewLayerEnabled), false);
  await this.page.locator('.pegman-control').click();
  await this.page.waitForFunction(() => control._streetViewLayerEnabled);
});
Then('clicking the map opens a panorama and synchronizes the marker', async function() {
  await this.page.locator('#map').click({ position: { x: 300, y: 200 } });
  const actual = await this.page.evaluate(() => {
    const panorama = googleState.panoramas[0];
    panorama.position = new google.maps.LatLng(45.001, 9.002);
    panorama.listeners.position_changed();
    panorama.listeners.pov_changed();
    return {
      visible: panorama.visible, pano: panorama.pano,
      marker: control._pegmanMarker.getLatLng(),
      radius: googleState.requests.at(-1).radius,
      sprite: control._pegmanMarker.getElement().style.backgroundPosition,
    };
  });
  assert.equal(actual.visible, true);
  assert.equal(actual.pano, 'local-panorama');
  assert.deepEqual(actual.marker, { lat: 45.001, lng: 9.002 });
  assert.equal(actual.radius, 100);
  assert.equal(actual.sprite, '0px -208px');
});
Then('Escape and the panorama close button clear Street View', async function() {
  await this.page.keyboard.press('Escape');
  assert.deepEqual(await this.page.evaluate(() => [
    control._streetViewLayerEnabled, map.hasLayer(control._pegmanMarker), control._panoDiv.style.display,
  ]), [false, false, 'none']);
  await this.page.evaluate(() => {
    control.showStreetViewLayer();
    control.findStreetViewData(45, 9);
    googleState.panoramas[0].listeners.closeclick();
  });
  assert.equal(await this.page.evaluate(() => map.hasLayer(control._pegmanMarker)), false);
  assert.deepEqual(this.external, []);
});
Given('a lazy Pegman control', async function() {
  await this.page.goto(this.testURL('leaflet-pegman-lazyLoading.html'));
  await this.page.evaluate(() => {
    pegmanControl.remove();
    window.control = new L.Control.Pegman({ apiKey: 'test-key' }).addTo(map);
  });
});
Then('removing and readding it before loading dependencies is safe', async function() {
  assert.deepEqual(await this.page.evaluate(() => {
    control.remove();
    control.addTo(map);
    control.remove();
    return [
      document.querySelectorAll('.pano-canvas').length, map.listens('click'),
      (map._events.layeradd || []).some(listener => listener.fn === control.onMapLayerAdd && listener.ctx === control),
    ];
  }), [0, false, false]);
});
When('I request Street View before dependencies load', async function() {
  await this.page.evaluate(() => control.findStreetViewData(45, 9));
});
Then('the mocked lazy services open one panorama', async function() {
  await this.page.waitForFunction(() => window.googleState?.panoramas[0]?.visible);
  assert.deepEqual(await this.page.evaluate(() => [
    googleState.panoramas.length, control._streetViewLayerEnabled, control._pegman.hasAttribute('draggable'),
  ]), [1, true, false]);
  const googleUrl = new URL(this.requests.find(url => url.includes('maps.googleapis.com')));
  assert.equal(googleUrl.searchParams.get('key'), 'test-key');
  assert.ok(googleUrl.searchParams.get('libraries').split(',').includes('geometry'));
  assert.ok(this.requests.some(url => url.includes('@0.16.0/dist/Leaflet.GoogleMutant.js')));
  if (this.leafletVersion.startsWith('2.')) {
    assert.equal(await this.page.evaluate(() => control._googleStreetViewLayer instanceof L.GridLayer.GoogleMutant), true);
    assert.ok(!(await this.page.evaluate(() => 'gridLayer' in L)), 'No Leaflet factory polyfill');
  }
});
Then('removing and readding a detached control cleans its lifecycle', async function() {
  await this.page.goto(this.testURL('leaflet-pegman-panoDiv.html'));
  const actual = await this.page.evaluate(() => {
    pegmanControl.remove();
    window.control = new L.Control.Pegman({ panoDiv: '#panorama' }).addTo(map);
    control._loadGoogleHandlers();
    const panorama = control._panorama;
    control.remove();
    const removed = [
      !!document.querySelector('#panorama'), document.querySelector('#panorama').className,
      Object.keys(panorama.listeners).length, map.listens('click'),
      (map._events.layeradd || []).some(listener => listener.fn === control.onMapLayerAdd && listener.ctx === control),
      document.querySelector('#map').classList.contains('leaflet-pegman-v3-default'),
    ];
    control.addTo(map);
    control.findStreetViewData(45, 9);
    const count = googleState.requests.length;
    control.remove();
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }));
    document.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 27 }));
    map.fire('click', { latlng: new L.LatLng(45, 9) });
    return { removed, requests: googleState.requests.length - count };
  });
  assert.deepEqual(actual, { removed: [true, 'panorama', 0, false, false, false], requests: 0 });
});
Then('delayed service callbacks after removal are ignored', async function() {
  assert.deepEqual(await this.page.evaluate(() => {
    window.control = new L.Control.Pegman().addTo(map);
    googleState.defer = true;
    control.findStreetViewData(45, 9);
    const oldPanorama = control._panorama;
    control.remove();
    control.addTo(map);
    googleState.pending.forEach(respond => respond());
    return [!!oldPanorama.visible, !!control._panorama.visible, control._panoDiv.style.display];
  }), [false, false, '']);
});
Then('dragging Pegman activates coverage and selects the drop location', async function() {
  const bounds = await this.page.locator('.pegman').boundingBox();
  await this.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await this.page.mouse.down();
  await this.page.mouse.move(300, 200, { steps: 10 });
  await this.page.mouse.up();
  assert.deepEqual(await this.page.evaluate(() => [
    control._streetViewLayerEnabled, map.hasLayer(control._pegmanMarker),
    control._container.classList.contains('dragging'),
    control._map.getContainer().classList.contains('drop-active'),
    control._pegmanMarker.getLatLng().equals(
      map.containerPointToLatLng([300 - map.getContainer().getBoundingClientRect().left,
        200 - map.getContainer().getBoundingClientRect().top])),
    map.dragging.enabled(), control._pointerId,
  ]), [true, true, false, false, true, true, null]);
});
Then('both public stylesheets retain the original image URLs', async function() {
  for (const suffix of ['', '.min']) {
    const css = await (await fetch(`${this.baseUrl}/leaflet-pegman${suffix}.css`)).text();
    for (const path of ['api-3/cb_scout5.png', 'pegman_v3/runway-1x.png', 'pegman_v3/runway-2x.png']) {
      assert.ok(css.includes(`maps.gstatic.com/${path}`));
      const response = await fetch(`${this.baseUrl}/maps.gstatic.com/${path}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
    }
    assert.equal(/url\([^)]*(?:\.\.\/|-[A-Z0-9]{8}\.)/.test(css), false);
    await this.page.addStyleTag({ url: `${this.baseUrl}/leaflet-pegman${suffix}.css` });
    await this.page.evaluate(() => { window.control = new L.Control.Pegman().addTo(map); });
    const image = await this.page.locator('.pegman-button').evaluate(element => getComputedStyle(element).backgroundImage);
    assert.ok(image.includes('/maps.gstatic.com/pegman_v3/runway-2x.png'));
    await this.page.evaluate(() => control.remove());
  }
});
Then('local coverage tiles can be sampled for the mouse cursor', async function() {
  await this.page.evaluate(() => control.showStreetViewLayer());
  await this.page.waitForFunction(() => !!control._googleStreetViewLayer._mutant);
  await this.page.evaluate(() => {
    const coords = control._getTileCoords(45, 9, map.getZoom());
    window.coverageCoords = coords;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = 'red';
    context.fillRect(0, 0, 256, 256);
    const image = new Image();
    image.src = canvas.toDataURL() + `#x=${coords.x}&y=${coords.y}&z=${coords.z}`;
    control._googleStreetViewLayer._mutantContainer.appendChild(image);
  });
  await this.page.waitForFunction(() => {
    const layer = control._googleStreetViewLayer;
    return !!layer._tiles[layer._tileCoordsToKey(coverageCoords)]?.el.querySelector('img');
  });
  await this.page.evaluate(() => control._getTileImage(coverageCoords));
  await this.page.waitForFunction(() => !!control.tileContext);
  assert.equal(await this.page.evaluate(() => control._hasTileData(null, { x: 10, y: 10 })), true);
  await this.page.evaluate(() => control.tileContext.clearRect(0, 0, 256, 256));
  assert.equal(await this.page.evaluate(() => control._hasTileData(null, { x: 10, y: 10 })), false);
});
