/**
 * leaflet-pegman
 *
 * @author    Raruto
 * @license   GPL-3.0+
 * @link https://github.com/Raruto/leaflet-pegman
 * @desc Leaflet plugin that allows an easy integration with the Google StreetView Service API
 */
L.Control.Pegman = L.Control.extend({
	includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,
	options: {
		position: 'bottomright', // position of control inside the map
		clickableStreetViewLayer: false, // WARNING: when enabled it will violate Google ToS rules
		theme: "leaflet-pegman-v3-default", // or "leaflet-pegman-v3-small"
		logging: false, // enable console logging (debugging)
	},

	initialize: function(options) {
		L.Util.setOptions(this, options);

		// Grab Left/Right/Up/Down Direction of Mouse for Pegman Image
		this._mousePos = {
			direction: {},
			old: {},
		};

		this._pegmanMarkerCoords = null;
		this._streetViewCoords = null;
		this._streetViewLayerEnabled = false;

		this.options.clickableStreetViewLayer = typeof(L.gridLayer.googleMutant) === "undefined" || this.options.clickableStreetViewLayer;

		this._dropzoneMapOpts = {
			accept: '.draggable', // Only Accept Elements Matching this CSS Selector
			overlap: 0.75, // Require a 75% Element Overlap for a Drop to be Possible
			ondropactivate: L.bind(this.onDropZoneActivated, this),
			ondragenter: L.bind(this.onDropZoneDragEntered, this),
			ondragleave: L.bind(this.onDropZoneDragLeaved, this),
			ondrop: L.bind(this.onDropZoneDropped, this),
			ondropdeactivate: L.bind(this.onDropZoneDeactivated, this),
		};
		this._draggableMarkerOpts = {
			inertia: false,
			onmove: L.bind(this.onDraggableMove, this),
			onend: L.bind(this.onDraggableEnd, this),
		};

		this._pegmanMarkerOpts = {
			draggable: true,
			icon: L.icon({
				className: "pegman-marker",
				iconSize: [52, 52],
				iconAnchor: [26, 13],
				iconUrl: 'data:image/png;base64,' + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAFElEQVR4XgXAAQ0AAABAMP1L30IDCPwC/o5WcS4AAAAASUVORK5CYII=",
			}),
		};
	},

	onAdd: function(map) {
		this._map = map;

		this._container = L.DomUtil.create('div', 'leaflet-pegman pegman-control leaflet-bar');
		this._pegman = L.DomUtil.create('div', 'pegman draggable drag-drop', this._container);
		this._pegmanButton = L.DomUtil.create('div', 'pegman-button', this._container);
		this._pegmanMarker = L.marker([0, 0], this._pegmanMarkerOpts);
		this._panoDiv = L.DomUtil.create('div', 'pano-canvas', this._map._container);

		if (this.options.theme) {
			L.DomUtil.addClass(this._map._container, this.options.theme);
		}

		/********************************************************/
		/* Google maps */
		if (this.options.clickableStreetViewLayer) {
			// @link https://developers.google.com/terms/api-services-user-data-policy
			// You SHOULD NOT USE UNDOCUMENTED APIs without google's express permission.
			this._googleStreetViewLayer = L.tileLayer('https://{s}.googleapis.com/vt?lyrs=svv&style=40,18&x={x}&y={y}&z={z}', {
				attribution: 'Map data: &copy; <a href="https://www.google.com/intl/en/help/terms_maps.html">Google</a>',
				subdomains: ['mts1', 'mts2', 'mts3'],
			});
			this._mouseTileTracker = new this.MouseTileTracker(this._map);
		} else {
			// @link https://gitlab.com/IvanSanchez/Leaflet.GridLayer.GoogleMutant
			// GoogleMutant SHOULD PROVIDE a ToS compliant way of loading Google Map's tiles into Leaflet
			this._googleStreetViewLayer = L.gridLayer.googleMutant({
				attribution: 'Map data: &copy; <a href="https://www.google.com/intl/en/help/terms_maps.html">Google</a>',
				//type: null, // (illegal?) workaround used to force a transparent background using null maptype_id
				type: "roadmap",
				styles: [{
					"stylers": [{
						"visibility": "off"
					}]
				}]
			});
			this._googleStreetViewLayer.addGoogleLayer('StreetViewCoverageLayer');
		}

		this._panorama = new google.maps.StreetViewPanorama(this._panoDiv, {
			enableCloseButton: true,
		});

		this._streetViewService = new google.maps.StreetViewService();

		/* ******************************************************* */

		// Enable Draggable Element to be Dropped into Map Container
		this._draggable = interact(this._pegman).draggable(this._draggableMarkerOpts);
		this._dropzone = interact(this._map._container).dropzone(this._dropzoneMapOpts);

		this._draggable.styleCursor(false);

		// Toggle on/off SV Layer on Pegman's Container single clicks
		interact(this._container).on("tap", L.bind(this.toggleStreetViewLayer, this));

		// Disable "mousedown touchstart dblclick" events
		L.DomEvent.disableClickPropagation(this._container);

		/* ******************************************************* */

		L.DomEvent.on(document, 'mousemove', this.mouseMoveTracking, this);
		L.DomEvent.on(document, 'keyup', this.keyUpTracking, this);

		this._pegmanMarker.on("dragend", this.onPegmanMarkerDragged, this);
		this._map.on("click", this.onMapClick, this);

		google.maps.event.addListener(this._panorama, 'closeclick', L.bind(this.onStreetViewPanoramaClose, this));

		return this._container;
	},

	onRemove: function(map) {
		this._googleStreetViewLayer.remove();
		this._pegmanMarker.remove()

		L.DomUtil.remove(this._panoDiv);

		L.DomEvent.off(document, 'mousemove', this.mouseMoveTracking, this);
		L.DomEvent.off(document, 'keyup', this.keyUpTracking, this);
	},

	/* ******************************************************* */

	_log: function(args) {
		if (this.options.logging) {
			console.log(args);
		}
	},

	_addClasses: function(el, classNames) {
		var classNames = classNames.split(" ");
		for (var s in classNames) {
			L.DomUtil.addClass(el, classNames[s]);
		}
	},

	_removeClasses: function(el, classNames) {
		var classNames = classNames.split(" ");
		for (var s in classNames) {
			L.DomUtil.removeClass(el, classNames[s]);
		}
	},

	_removeAttributes: function(el, attrNames) {
		for (var a in attrNames) {
			el.removeAttribute(attrNames[a]);
		}
	},

	_insertAfter: function(targetNode, newNode) {
		targetNode.parentNode.insertBefore(newNode, targetNode.nextSibling);
	},

	_translateElement: function(el, dx, dy) {
		if (dx === false && dy === false) {
			this._removeAttributes(this._pegman, ["style", "data-x", "data-y"]);
		}
		// Element's position is preserved within the data-x/data-y attributes
		var x = (parseFloat(el.getAttribute('data-x')) || 0) + dx;
		var y = (parseFloat(el.getAttribute('data-y')) || 0) + dy;

		// Translate element
		el.style.webkitTransform = el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';

		// Update position attributes
		el.setAttribute('data-x', x);
		el.setAttribute('data-y', y);
	},

	_updateClasses: function(action) {
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
				return;
		}
		this._log(action);
		this.fireEvent("svpc_" + action);
	},

	/* ******************************************************* */

	onDraggableMove: function(e) {
		this.mouseMoveTracking(e);
		this._updateClasses("pegman-dragging");
		this._translateElement(this._pegman, e.dx, e.dy);
	},

	onDraggableEnd: function(e) {
		this._pegmanMarkerCoords = this._map.mouseEventToLatLng(e);
		this.pegmanAdd();
		this._updateClasses("pegman-dragged");
	},

	onDropZoneActivated: function(e) {
		this._updateClasses("dropzone-actived");
	},

	onDropZoneDragEntered: function(e) {
		this.showStreetViewLayer();
		this._updateClasses("dropzone-drag-entered");
	},

	onDropZoneDragLeaved: function(e) {
		this._updateClasses("dropzone-drag-leaved");
	},

	onDropZoneDropped: function(e) {
		this._updateClasses("dropzone-drop");
		this._translateElement(this._pegman, false, false);
	},

	onDropZoneDeactivated: function(e) {
		this._updateClasses("dropzone-deactivated");
	},

	onPegmanMarkerDragged: function(e) {
		this._pegmanMarkerCoords = this._pegmanMarker.getLatLng();
		this.findStreetViewData(this._pegmanMarkerCoords.lat, this._pegmanMarkerCoords.lng);
	},

	onMapClick: function(e) {
		if (this._streetViewLayerEnabled)
			this.findStreetViewData(e.latlng.lat, e.latlng.lng);
	},

	onStreetViewPanoramaClose: function() {
		this.clear();
	},

	/* ******************************************************* */

	clear: function() {
		this.pegmanRemove();
		this.hideStreetViewLayer();
		this.closeStreetViewPanorama();
	},

	toggleStreetViewLayer: function(e) {
		this._streetViewLayerEnabled ? this.clear() : this.showStreetViewLayer();
	},

	pegmanAdd: function() {
		this._pegmanMarker.addTo(this._map);
		this._pegmanMarker.setLatLng(this._pegmanMarkerCoords);
		this.findStreetViewData(this._pegmanMarkerCoords.lat, this._pegmanMarkerCoords.lng);
		this._updateClasses("pegman-added");
	},

	pegmanRemove: function() {
		this._pegmanMarker.removeFrom(this._map);
		this._updateClasses("pegman-removed");
	},

	/* ******************************************************* */

	closeStreetViewPanorama: function() {
		this._panoDiv.style.display = "none";
	},

	openStreetViewPanorama: function() {
		this._panoDiv.style.display = "block";
	},

	hideStreetViewLayer: function() {
		this._googleStreetViewLayer.removeFrom(this._map);
		this._streetViewLayerEnabled = false;
		this._updateClasses("streetview-hidden");
	},

	showStreetViewLayer: function() {
		this._googleStreetViewLayer.addTo(this._map);
		this._streetViewLayerEnabled = true;
		this._updateClasses("streetview-shown");
	},

	findStreetViewData: function(lat, lng) {
		this._streetViewCoords = new google.maps.LatLng(lat, lng);
		var zoom = this._map.getZoom();
		var searchRadius = 100;

		if (zoom < 6) searchRadius = 5000;
		else if (zoom < 10) searchRadius = 500;
		else if (zoom < 15) searchRadius = 250;
		else if (zoom >= 17) searchRadius = 50;
		else searchRadius = 100;

		this._streetViewService.getPanoramaByLocation(this._streetViewCoords, searchRadius, L.bind(this.processStreetViewServiceData, this));
	},

	processStreetViewServiceData: function(data, status) {
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
			this._log("Street View data not found for this location.");
			// this.clear(); // TODO: add a visual feedback when no SV data available
		}
	},

	/********************************************************/

	/**
	 * mouseMoveTracking
	 * @desc internal function used to style pegman while dragging
	 */
	mouseMoveTracking: function(e) {
		var mousePos = this._mousePos;

		// Top <--> Bottom
		if (e.pageY < mousePos.old.y) {
			mousePos.direction.y = 'top';
			this._updateClasses("mousemove-top");
		} else if (e.pageY > mousePos.old.y) {
			mousePos.direction.y = 'bottom';
			this._updateClasses("mousemove-bottom");
		}
		// Left <--> Right
		if (e.pageX < mousePos.old.x) {
			mousePos.direction.x = 'left';
			this._updateClasses("mousemove-left");
		} else if (e.pageX > mousePos.old.x) {
			mousePos.direction.x = 'right';
			this._updateClasses("mousemove-right");
		}

		mousePos.old.x = e.pageX;
		mousePos.old.y = e.pageY;
	},

	/**
	 * keyUpTracking
	 * @desc internal function used to track keyup events
	 */
	keyUpTracking: function(e) {
		if (e.keyCode == 27) {
			this._log('escape pressed');
			this.clear();
		}
	},

	/********************************************************/

	/**
	 * MouseTileTracker
	 * @desc internal class used to add cursor:"pointer" when hovering a semi-transparent tiled overlay
	 *
	 * TODO: code refactoring + add support for the GoogleMutant StreetView layer
	 */
	MouseTileTracker: function(map) {

		var self = this;

		self._init = function(map) {
			self.map = map;
			self.mouse = {
				pageX: 0,
				pageY: 0
			};

			if (typeof(Number.prototype.toRad) === "undefined") {
				Number.prototype.toRad = function() {
					return this * Math.PI / 180;
				}
			}

			self.defaultDraggableCursor = self.map._container.style.cursor;

			self.map._container.addEventListener('mousemove', self.onMapDivMouseMove);
			self.map.on('mousemove', self.onMapMouseMove);
		};

		self.getTileURL = function(lat, lon, zoom) {
			var xtile = parseInt(Math.floor((lon + 180) / 360 * (1 << zoom)));
			var ytile = parseInt(Math.floor((1 - Math.log(Math.tan(lat.toRad()) + 1 / Math.cos(lat.toRad())) / Math.PI) / 2 * (1 << zoom)));
			return {
				x: xtile,
				y: ytile,
				z: zoom,
			};
		};

		self._startTracking = function(baseUrl, tileCoordinate, tileWidth, tileHeight, subdomain = null) {
			self.tileData = null;
			self.downloadedTile = null;
			self.tileCanvas = null;
			self.tileSrc = "";

			self.baseUrl = baseUrl;
			self.tileCoordinate = tileCoordinate;
			self.tileWidth = tileWidth;
			self.tileHeight = tileHeight;

			var protocolsRegex = /(^\w+:|^)\/\//; //eg. http://
			var subdomainRegex = /.*\{s\}.*\./; //eg. mts{s}.
			var cssSelectorSrc;

			self.tileSrc = self.baseUrl;
			self.tileSrc = self.tileSrc.replace("{x}", self.tileCoordinate.x);
			self.tileSrc = self.tileSrc.replace("{y}", self.tileCoordinate.y);
			self.tileSrc = self.tileSrc.replace("{z}", self.map.getZoom());

			cssSelectorSrc = self.tileSrc;

			if (subdomain) {
				self.tileSrc = self.tileSrc.replace("{s}", subdomain);
			}
			cssSelectorSrc = cssSelectorSrc.replace(protocolsRegex, '');
			cssSelectorSrc = cssSelectorSrc.replace(subdomainRegex, '');

			self.downloadTile(self.tileSrc);

			if (!self.tileData) {
				self.tileLoaded();
			}

			self.mapTile = document.querySelector('.leaflet-container img[src$="' + cssSelectorSrc + '"]');

			if (!self.mapTile) return;

			self.rect = self.mapTile.getBoundingClientRect();

			self.imgPos = {
				top: (self.rect.top + window.scrollY).toFixed(0),
				left: (self.rect.left + window.scrollX).toFixed(0)
			};
			self.mousePos = {
				x: self.mouse.pageX - self.imgPos.left,
				y: self.mouse.pageY - self.imgPos.top
			};

			self.pixelData = self.tileCanvas.getContext('2d').getImageData(self.mousePos.x, self.mousePos.y, 1, 1).data;
			self.alpha = self.pixelData[3];

			self.hasTileData = (self.alpha != 0);
		};

		self.downloadTile = function(imageSrc) {
			self.downloadedTile = new Image();
			self.downloadedTile.crossOrigin = "Anonymous";
			self.downloadedTile.addEventListener("load", self.tileLoaded, false);
			self.downloadedTile.src = imageSrc;
		};

		self.tileLoaded = function() {
			self.tileCanvas = document.createElement("canvas");
			self.context = self.tileCanvas.getContext("2d");

			self.tileCanvas.width = self.tileWidth;
			self.tileCanvas.height = self.tileHeight;

			self.context.drawImage(self.downloadedTile, 0, 0);

			self.tileData = self.context.getImageData(0, 0, self.tileWidth, self.tileHeight);
		};

		self.onMapDivMouseMove = function(e) {
			self.mouse.pageX = e.pageX;
			self.mouse.pageY = e.pageY;
		};

		self.onMapMouseMove = function(mev) {
			var TILE_SIZE = 256;
			var tileCoordinate = self.getTileURL(mev.latlng.lat, mev.latlng.lng, self.map.getZoom());
			var toggledOverlays = self.map._layers;
			var mouseTracker, hasTileData = false;
			var subdomain;
			var layer;

			for (var i in toggledOverlays) {
				var layer = toggledOverlays[i];
				if (!layer._url || layer._url.indexOf("google") < 0) { //Some sort of whitelist of pointable layers
					continue;
				}
				if (layer.options && layer.options.subdomains && layer.options.subdomains[0]) {
					subdomain = layer.options.subdomains[0];
				} else {
					subdomain = null;
				}
				self._startTracking(layer._url, tileCoordinate, TILE_SIZE, TILE_SIZE, subdomain);
				if (self.hasTileData) {
					hasTileData = true;
				}
			}

			self.map._container.style.cursor = hasTileData ? 'pointer' : self.defaultDraggableCursor;
		};

		self._init(map);
	},

});

L.control.pegman = function(options) {
	return new L.Control.Pegman(options);
};
