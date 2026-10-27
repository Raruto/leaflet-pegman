/**
 * leaflet-pegman
 *
 * @author    Raruto
 * @license   GPL-3.0+
 * @link https://github.com/Raruto/leaflet-pegman
 * @desc Leaflet plugin that allows an easy integration with the Google StreetView Service API
 */
L.Control.Pegman = L.Control.extend({
  includes: Object.fromEntries(Object.getOwnPropertyNames(L.Evented.prototype).filter((name) => name !== "constructor").map((name) => [name, L.Evented.prototype[name]])),
  options: {
    position: "bottomright",
    theme: "leaflet-pegman-v3-default",
    // or "leaflet-pegman-v3-small"
    debug: false,
    apiKey: "",
    libraries: "geometry",
    mutant: {
      attribution: 'Map data: &copy; <a href="https://www.google.com/intl/en/help/terms_maps.html">Google</a>',
      pane: "overlayPane",
      type: null
      // Non-image map type (used to force a transparent background)
    },
    pano: {
      enableCloseButton: true,
      fullscreenControl: false,
      imageDateControl: true
    },
    marker: {
      draggable: true,
      icon: new L.Icon({
        className: "pegman-marker",
        iconSize: [52, 52],
        iconAnchor: [24, 33],
        iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAFElEQVR4XgXAAQ0AAABAMP1L30IDCPwC/o5WcS4AAAAASUVORK5CYII="
      })
    }
  },
  __gmapsURL: "https://maps.googleapis.com/maps/api/js?v=3",
  __mutantURL: "https://unpkg.com/leaflet.gridlayer.googlemutant@0.16.0/dist/Leaflet.GoogleMutant.js",
  initialize(options) {
    options = options || {};
    L.Util.setOptions(this, options);
    this._mousePos = {
      direction: {},
      old: {}
    };
    this._pegmanMarkerCoords = null;
    this._streetViewCoords = null;
    this._streetViewLayerEnabled = false;
    this._lazyLoaderAdded = false;
    this._pointerDownHandler = this._onPointerDown.bind(this);
    this._pointerMoveHandler = this._onPointerMove.bind(this);
    this._pointerUpHandler = this._onPointerUp.bind(this);
    this._pointerCancelHandler = this._onPointerCancel.bind(this);
    this._controlClickHandler = this._onControlClick.bind(this);
  },
  onAdd(map) {
    this._map = map;
    this._lazyLoaderAdded = false;
    this._container = L.DomUtil.create("div", "leaflet-pegman pegman-control leaflet-bar");
    this._pegman = L.DomUtil.create("div", "pegman", this._container);
    this._pegmanButton = L.DomUtil.create("div", "pegman-button", this._container);
    this._pegmanMarker = new L.Marker([0, 0], this.options.marker);
    this._panoDiv = this.options.panoDiv ? document.querySelector(this.options.panoDiv) : L.DomUtil.create("div", "", this._map._container);
    this._panoDisplay = this._panoDiv.style.display;
    this._panoHadClass = this._panoDiv.classList.contains("pano-canvas");
    this._mapHadTheme = map._container.classList.contains(this.options.theme);
    this._panoDiv.classList.add("pano-canvas");
    this._map._container.classList.add(this.options.theme);
    L.DomEvent.disableClickPropagation(this._panoDiv);
    L.DomEvent.on(this._container, "click mousedown dblclick", this._disableClickPropagation, this);
    this._pegman.addEventListener("pointerdown", this._pointerDownHandler);
    this._container.addEventListener("click", this._controlClickHandler);
    this._container.addEventListener("touchstart", this._loadScripts.bind(this, !L.Browser.touch), { once: true });
    this._container.addEventListener("mousedown", this._loadScripts.bind(this, true), { once: true });
    this._container.addEventListener("mouseover", this._loadScripts.bind(this, false), { once: true });
    this._loadGoogleHandlers();
    L.DomEvent.on(document, "mousemove", this.mouseMoveTracking, this);
    L.DomEvent.on(document, "keyup", this.keyUpTracking, this);
    this._pegmanMarker.on("dragend", this.onPegmanMarkerDragged, this);
    this._map.on("click", this.onMapClick, this);
    this._map.on("layeradd", this.onMapLayerAdd, this);
    return this._container;
  },
  onRemove(map) {
    this._finishPointerDrag(null, true);
    this._pegman.removeEventListener("pointerdown", this._pointerDownHandler);
    this._container.removeEventListener("click", this._controlClickHandler);
    this.clear();
    if (this._googleStreetViewLayer) this._googleStreetViewLayer.remove();
    if (this._pegmanMarker) this._pegmanMarker.remove();
    if (this._panoramaListeners) this._panoramaListeners.forEach(function(listener) {
      listener.remove();
    });
    this._panoramaListeners = null;
    this._panorama = this._streetViewService = this._googleStreetViewLayer = null;
    this._pegmanMarker.off("dragend", this.onPegmanMarkerDragged, this);
    if (this.options.panoDiv) {
      this._panoDiv.style.display = this._panoDisplay;
      if (!this._panoHadClass) this._panoDiv.classList.remove("pano-canvas");
    } else {
      this._panoDiv.remove();
    }
    if (!this._mapHadTheme) map._container.classList.remove(this.options.theme);
    L.DomEvent.off(document, "mousemove", this.mouseMoveTracking, this);
    L.DomEvent.off(document, "keyup", this.keyUpTracking, this);
    map.off("mousemove", this._setMouseCursor, this);
    map.off("click", this.onMapClick, this);
    map.off("layeradd", this.onMapLayerAdd, this);
    map._container.style.cursor = this.defaultDraggableCursor || "";
  },
  _onPointerDown(e) {
    if (!this._map || e.button !== 0 || this._pointerId != null) return;
    this._loadScripts(true);
    this._pointerId = e.pointerId;
    this._pointerStart = { x: e.clientX, y: e.clientY };
    this._pointerLast = this._pointerStart;
    this._isDragging = false;
    this._dropTarget = false;
    e.preventDefault();
    document.addEventListener("pointermove", this._pointerMoveHandler);
    document.addEventListener("pointerup", this._pointerUpHandler);
    document.addEventListener("pointercancel", this._pointerCancelHandler);
  },
  _onPointerMove(e) {
    if (e.pointerId !== this._pointerId) return;
    const dx = e.clientX - this._pointerLast.x;
    const dy = e.clientY - this._pointerLast.y;
    if (!this._isDragging) {
      const startX = e.clientX - this._pointerStart.x;
      const startY = e.clientY - this._pointerStart.y;
      if (startX * startX + startY * startY < 9) return;
      this._isDragging = true;
      this._mapDraggingWasEnabled = this._map.dragging.enabled();
      if (this._mapDraggingWasEnabled) this._map.dragging.disable();
      this.onDropZoneActivated(e);
    }
    this._pointerLast = { x: e.clientX, y: e.clientY };
    this.onDraggableMove({ pageX: e.pageX, pageY: e.pageY, dx, dy });
    const overMap = this._pegmanOverMap();
    if (overMap && !this._dropTarget) {
      this._dropTarget = true;
      this.onDropZoneDragEntered(e);
    } else if (!overMap && this._dropTarget) {
      this._dropTarget = false;
      this.onDropZoneDragLeaved(e);
    }
  },
  _onPointerUp(e) {
    this._finishPointerDrag(e, false);
  },
  _onPointerCancel(e) {
    this._finishPointerDrag(e, true);
  },
  _finishPointerDrag(e, canceled) {
    if (this._pointerId == null) return;
    document.removeEventListener("pointermove", this._pointerMoveHandler);
    document.removeEventListener("pointerup", this._pointerUpHandler);
    document.removeEventListener("pointercancel", this._pointerCancelHandler);
    if (this._isDragging) {
      if (!canceled) {
        if (this._dropTarget) this.onDropZoneDropped(e);
        this.onDraggableEnd(e);
      } else {
        this._translateElement(this._pegman, false, false);
        this._removeClasses(this._container, "dragging");
      }
      this.onDropZoneDeactivated(e);
      if (!canceled) {
        this._suppressClick = true;
        setTimeout(function() {
          this._suppressClick = false;
        }.bind(this), 0);
      }
    }
    if (this._mapDraggingWasEnabled) this._map.dragging.enable();
    this._pointerId = null;
    this._isDragging = false;
    this._dropTarget = false;
    this._mapDraggingWasEnabled = false;
  },
  _pegmanOverMap() {
    const pegman = this._pegman.getBoundingClientRect();
    const map = this._map._container.getBoundingClientRect();
    const width = Math.max(0, Math.min(pegman.right, map.right) - Math.max(pegman.left, map.left));
    const height = Math.max(0, Math.min(pegman.bottom, map.bottom) - Math.max(pegman.top, map.top));
    return pegman.width * pegman.height > 0 && width * height / (pegman.width * pegman.height) >= 0.75;
  },
  _onControlClick(e) {
    if (this._suppressClick) {
      this._suppressClick = false;
      return;
    }
    this.toggleStreetViewLayer(e);
  },
  _log(args) {
    if (this.options.debug) {
      console.log(args);
    }
  },
  _addClasses(el, classNames) {
    classNames = classNames.split(" ");
    for (const s in classNames) {
      el.classList.add(classNames[s]);
    }
  },
  _removeClasses(el, classNames) {
    classNames = classNames.split(" ");
    for (const s in classNames) {
      el.classList.remove(classNames[s]);
    }
  },
  _removeAttributes(el, attrNames) {
    for (const a in attrNames) {
      el.removeAttribute(attrNames[a]);
    }
  },
  _translateElement(el, dx, dy) {
    if (dx === false && dy === false) {
      this._removeAttributes(this._pegman, ["style", "data-x", "data-y"]);
    }
    const x = (parseFloat(el.getAttribute("data-x")) || 0) + dx;
    const y = (parseFloat(el.getAttribute("data-y")) || 0) + dy;
    el.style.webkitTransform = el.style.transform = "translate(" + x + "px, " + y + "px)";
    el.setAttribute("data-x", x);
    el.setAttribute("data-y", y);
  },
  _updateClasses(action) {
    switch (action) {
      case "pegman-dragging":
        this._removeClasses(this._pegman, "dropped");
        this._addClasses(this._container, "dragging");
        break;
      case "pegman-dragged":
        this._removeClasses(this._pegman, "can-drop dragged left right active dropped");
        this._removeAttributes(this._pegman, ["style", "data-x", "data-y"]);
        break;
      case "dropzone-actived":
        this._addClasses(this._map._container, "drop-active");
        break;
      case "dropzone-drag-entered":
        this._addClasses(this._pegman, "active can-drop");
        this._addClasses(this._map._container, "drop-target");
        break;
      case "dropzone-drag-leaved":
        this._removeClasses(this._map._container, "drop-target");
        this._removeClasses(this._pegman, "can-drop");
        break;
      case "dropzone-drop":
        this._removeClasses(this._container, "dragging");
        this._removeClasses(this._pegman, "active left right");
        this._addClasses(this._pegman, "dropped");
        this._removeClasses(this._pegman, "can-drop dragged left right active dropped");
        break;
      case "dropzone-deactivated":
        this._removeClasses(this._pegman, "active left right");
        this._removeClasses(this._map._container, "drop-active drop-target");
        break;
      case "mousemove-top":
        this._addClasses(this._pegman, "top");
        this._removeClasses(this._pegman, "bottom right left");
        break;
      case "mousemove-bottom":
        this._addClasses(this._pegman, "bottom");
        this._removeClasses(this._pegman, "top right left");
        break;
      case "mousemove-left":
        this._addClasses(this._pegman, "left");
        this._removeClasses(this._pegman, "right top bottom");
        break;
      case "mousemove-right":
        this._addClasses(this._pegman, "right");
        this._removeClasses(this._pegman, "left top bottom");
        break;
      case "pegman-added":
        this._addClasses(this._container, "active");
        break;
      case "pegman-removed":
        this._removeClasses(this._container, "active");
        break;
      case "streetview-shown":
        this._addClasses(this._container, "streetview-layer-active");
        break;
      case "streetview-hidden":
        this._removeClasses(this._container, "streetview-layer-active");
        break;
      default:
        throw "Unhandled event:" + action;
    }
    this.fire("svpc_" + action);
  },
  onDraggableMove(e) {
    this.mouseMoveTracking(e);
    this.pegmanRemove();
    this._updateClasses("pegman-dragging");
    this._translateElement(this._pegman, e.dx, e.dy);
  },
  onDraggableEnd(e) {
    this._pegmanMarkerCoords = (this._map.pointerEventToLatLng || this._map.mouseEventToLatLng).call(this._map, e);
    this.pegmanAdd();
    this.findStreetViewData(this._pegmanMarkerCoords.lat, this._pegmanMarkerCoords.lng);
    this._updateClasses("pegman-dragged");
  },
  onDropZoneActivated(e) {
    this._updateClasses("dropzone-actived");
  },
  onDropZoneDragEntered(e) {
    this.showStreetViewLayer();
    this._updateClasses("dropzone-drag-entered");
  },
  onDropZoneDragLeaved(e) {
    this._updateClasses("dropzone-drag-leaved");
  },
  onDropZoneDropped(e) {
    this._updateClasses("dropzone-drop");
    this._translateElement(this._pegman, false, false);
  },
  onDropZoneDeactivated(e) {
    this._updateClasses("dropzone-deactivated");
  },
  onPegmanMarkerDragged(e) {
    this._pegmanMarkerCoords = this._pegmanMarker.getLatLng();
    this.findStreetViewData(this._pegmanMarkerCoords.lat, this._pegmanMarkerCoords.lng);
  },
  onMapClick(e) {
    if (this._streetViewLayerEnabled) {
      this.findStreetViewData(e.latlng.lat, e.latlng.lng);
    }
  },
  onMapLayerAdd(e) {
    if (this._googleStreetViewLayer)
      this._googleStreetViewLayer.bringToFront();
  },
  onStreetViewPanoramaClose() {
    this.clear();
  },
  onPanoramaPositionChanged() {
    let pos = this._panorama.getPosition();
    pos = new L.LatLng(pos.lat(), pos.lng());
    if (this._map && !this._map.getBounds().pad(-0.05).contains(pos)) {
      this._map.panTo(pos);
    }
    this._pegmanMarker.setLatLng(pos);
  },
  onPanoramaPovChanged() {
    const pov = this._panorama.getPov();
    const marker = this._pegmanMarker.getElement();
    if (marker) marker.style.backgroundPosition = "0 " + -Math.abs(Math.round(pov.heading / (360 / 16)) % 16 * Math.round(835 / 16)) + "px";
  },
  clear() {
    this.pegmanRemove();
    this.hideStreetViewLayer();
    this.closeStreetViewPanorama();
  },
  toggleStreetViewLayer(e) {
    if (this._streetViewLayerEnabled) this.clear();
    else this.showStreetViewLayer();
    this._log("streetview-layer-toggled");
  },
  pegmanAdd() {
    this._pegmanMarker.addTo(this._map);
    this._pegmanMarker.setLatLng(this._pegmanMarkerCoords);
    this.findStreetViewData(this._pegmanMarkerCoords.lat, this._pegmanMarkerCoords.lng);
    this._updateClasses("pegman-added");
  },
  pegmanRemove() {
    this._pegmanMarker.removeFrom(this._map);
    this._updateClasses("pegman-removed");
  },
  closeStreetViewPanorama() {
    this._panoDiv.style.display = "none";
    if (this._panorama) this._panorama.setVisible(false);
  },
  openStreetViewPanorama() {
    this._panoDiv.style.display = "block";
  },
  hideStreetViewLayer() {
    if (this._googleStreetViewLayer) {
      this._googleStreetViewLayer.removeFrom(this._map);
      this._streetViewLayerEnabled = false;
      this._updateClasses("streetview-hidden");
    }
  },
  showStreetViewLayer() {
    if (this._googleStreetViewLayer) {
      this._googleStreetViewLayer.addTo(this._map);
      this._streetViewLayerEnabled = true;
      this._updateClasses("streetview-shown");
    }
  },
  findStreetViewData(lat, lng) {
    if (!this._map) return;
    if (!this._streetViewService) {
      this._loadScripts(true);
      return this.once("svpc_streetview-shown", this.findStreetViewData.bind(this, lat, lng));
    }
    if (!this._pegmanMarker._map && this._map) {
      this._pegmanMarkerCoords = new L.LatLng(lat, lng);
      return this.pegmanAdd();
    }
    this._streetViewCoords = new google.maps.LatLng(lat, lng);
    const searchRadius = this._getStreetViewSearchRadius();
    const panorama = this._panorama;
    this._streetViewService.getPanoramaByLocation(this._streetViewCoords, searchRadius, function(data, status) {
      if (this._map && this._panorama === panorama) this.processStreetViewServiceData(data, status);
    }.bind(this));
  },
  _getStreetViewSearchRadius() {
    const zoom = this._map.getZoom();
    if (zoom < 6) return 5e3;
    if (zoom < 10) return 500;
    if (zoom < 15) return 250;
    if (zoom >= 17) return 50;
    return 100;
  },
  processStreetViewServiceData(data, status) {
    if (status == google.maps.StreetViewStatus.OK) {
      this.openStreetViewPanorama();
      this._panorama.setPano(data.location.pano);
      this._panorama.setPov({
        heading: google.maps.geometry.spherical.computeHeading(data.location.latLng, this._streetViewCoords),
        pitch: 0,
        zoom: 0
      });
      this._panorama.setVisible(true);
    } else {
      console.warn("Street View data not found for this location.");
    }
  },
  /**
   * mouseMoveTracking
   * @desc internal function used to style pegman while dragging
   */
  mouseMoveTracking(e) {
    const mousePos = this._mousePos;
    if (e.pageY < mousePos.old.y) {
      mousePos.direction.y = "top";
      this._updateClasses("mousemove-top");
    } else if (e.pageY > mousePos.old.y) {
      mousePos.direction.y = "bottom";
      this._updateClasses("mousemove-bottom");
    }
    if (e.pageX < mousePos.old.x) {
      mousePos.direction.x = "left";
      this._updateClasses("mousemove-left");
    } else if (e.pageX > mousePos.old.x) {
      mousePos.direction.x = "right";
      this._updateClasses("mousemove-right");
    }
    mousePos.old.x = e.pageX;
    mousePos.old.y = e.pageY;
  },
  /**
   * keyUpTracking
   * @desc internal function used to track keyup events
   */
  keyUpTracking(e) {
    if (e.keyCode == 27) {
      this._log("escape pressed");
      this.clear();
    }
  },
  _disableClickPropagation(e) {
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
  },
  _loadGoogleHandlers(toggleStreetView) {
    if (!this._map || typeof google !== "object" || typeof google.maps !== "object" || typeof L.GridLayer.GoogleMutant !== "function") return;
    if (this._panorama) {
      if (toggleStreetView) this.showStreetViewLayer();
      return;
    }
    this._initGoogleMaps(toggleStreetView);
    this._initMouseTracker();
  },
  _initGoogleMaps(toggleStreetView) {
    this._googleStreetViewLayer = new L.GridLayer.GoogleMutant(this.options.mutant);
    this._googleStreetViewLayer.addGoogleLayer("StreetViewCoverageLayer");
    this._panorama = new google.maps.StreetViewPanorama(this._panoDiv, this.options.pano);
    this._streetViewService = new google.maps.StreetViewService();
    this._panoramaListeners = [
      this._panorama.addListener("closeclick", this.onStreetViewPanoramaClose.bind(this)),
      this._panorama.addListener("position_changed", this.onPanoramaPositionChanged.bind(this)),
      this._panorama.addListener("pov_changed", this.onPanoramaPovChanged.bind(this))
    ];
    if (toggleStreetView) {
      this.showStreetViewLayer();
    }
  },
  _initMouseTracker() {
    if (!this._googleStreetViewLayer) return;
    const tileSize = this._googleStreetViewLayer.getTileSize();
    this.tileWidth = tileSize.x;
    this.tileHeight = tileSize.y;
    this.defaultDraggableCursor = this._map._container.style.cursor;
    this._map.on("mousemove", this._setMouseCursor, this);
  },
  _setMouseCursor(e) {
    const coords = this._getTileCoords(e.latlng.lat, e.latlng.lng, this._map.getZoom());
    const img = this._getTileImage(coords);
    const pixel = this._getTilePixelPoint(img, e.originalEvent);
    const hasTileData = this._hasTileData(img, pixel);
    this._map._container.style.cursor = hasTileData ? "pointer" : this.defaultDraggableCursor;
  },
  _getTileCoords(lat, lon, zoom) {
    const xtile = parseInt(Math.floor((lon + 180) / 360 * (1 << zoom)));
    const ytile = parseInt(Math.floor((1 - Math.log(Math.tan(this._toRad(lat)) + 1 / Math.cos(this._toRad(lat))) / Math.PI) / 2 * (1 << zoom)));
    return {
      x: xtile,
      y: ytile,
      z: zoom
    };
  },
  _getTileImage(coords) {
    if (!this._googleStreetViewLayer || !this._googleStreetViewLayer._tiles) return;
    const key = this._googleStreetViewLayer._tileCoordsToKey(coords);
    const tile = this._googleStreetViewLayer._tiles[key];
    if (!tile) return;
    const img = tile.el.querySelector("img");
    if (!img) return;
    this._downloadTile(img.src, this._tileLoaded);
    return img;
  },
  _getTilePixelPoint(img, e) {
    if (!img) return;
    const imgRect = img.getBoundingClientRect();
    const imgPos = {
      pageY: (imgRect.top + window.scrollY).toFixed(0),
      pageX: (imgRect.left + window.scrollX).toFixed(0)
    };
    const mousePos = {
      x: e.pageX - imgPos.pageX,
      y: e.pageY - imgPos.pageY
    };
    return mousePos;
  },
  _hasTileData(img, pixelPoint) {
    if (!this.tileContext || !pixelPoint) return;
    const pixelData = this.tileContext.getImageData(pixelPoint.x, pixelPoint.y, 1, 1).data;
    const alpha = pixelData[3];
    const hasTileData = alpha != 0;
    return hasTileData;
  },
  _toRad(number) {
    return number * Math.PI / 180;
  },
  _downloadTile(imageSrc, callback) {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.addEventListener("load", callback.bind(this, img), false);
    img.src = imageSrc;
  },
  _tileLoaded(img) {
    this.tileCanvas = document.createElement("canvas");
    this.tileContext = this.tileCanvas.getContext("2d");
    this.tileCanvas.width = this.tileWidth;
    this.tileCanvas.height = this.tileHeight;
    this.tileContext.drawImage(img, 0, 0);
  },
  _loadScripts(toggleStreetView) {
    if (!this._map || this._lazyLoaderAdded) return;
    this._lazyLoaderAdded = true;
    this._loadJS(this.__gmapsURL + "&key=" + this.options.apiKey + "&libraries=" + this.options.libraries + "&callback=?", this._loadGoogleHandlers.bind(this, toggleStreetView), typeof google !== "object" || typeof google.maps !== "object");
    this._loadJS(this.__mutantURL, this._loadGoogleHandlers.bind(this, toggleStreetView), typeof L.GridLayer.GoogleMutant !== "function");
  },
  _loadJS(url, callback, condition) {
    if (!condition) {
      callback();
      return;
    }
    if (url.indexOf("callback=?") !== -1) {
      this._jsonp(url, callback);
    } else {
      const script = document.createElement("script");
      script.src = url;
      const loaded = function() {
        script.onload = script.onreadystatechange = null;
        this._log(url + " loaded");
        callback();
      }.bind(this);
      script.onerror = function() {
        console.error("Failed to load " + url);
      };
      script.onload = script.onreadystatechange = loaded;
      const head = document.head || document.getElementsByTagName("head")[0] || document.documentElement;
      head.insertBefore(script, head.firstChild);
    }
  },
  _jsonp(url, callback, params) {
    let query = url.indexOf("?") === -1 ? "?" : "&";
    params = params || {};
    for (const key in params) {
      if (params.hasOwnProperty(key)) {
        query += encodeURIComponent(key) + "=" + encodeURIComponent(params[key]) + "&";
      }
    }
    const timestamp = (/* @__PURE__ */ new Date()).getUTCMilliseconds();
    const jsonp = "json_call_" + timestamp;
    window[jsonp] = function(data) {
      callback(data);
      window[jsonp] = void 0;
    };
    const script = document.createElement("script");
    if (url.indexOf("callback=?") !== -1) {
      script.src = url.replace("callback=?", "callback=" + jsonp) + query.slice(0, -1);
    } else {
      script.src = url + query + "callback=" + jsonp;
    }
    const loaded = function() {
      if (!this.readyState || this.readyState === "loaded" || this.readyState === "complete") {
        script.onload = script.onreadystatechange = null;
        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }
    };
    script.async = true;
    script.onload = script.onreadystatechange = loaded;
    const head = document.head || document.getElementsByTagName("head")[0] || document.documentElement;
    head.insertBefore(script, head.firstChild);
  }
});

(L.control || L.Control).pegman = function(options) {
  return new L.Control.Pegman(options);
};