# leaflet-pegman.js
A Leaflet plugin that allows easy integration with the Google StreetView Service API

_For a working example (without API Key) see [demo](https://raruto.github.io/examples/leaflet-pegman/leaflet-pegman.html)_

---

<p align="center">
    <a href="https://raruto.github.io" rel="nofollow"><img src="https://raruto.github.io/img/pegman-bio.png" alt="Pegman Bio" /></a>
</p>

> _Initally based on the [work](http://jsfiddle.net/pegues/a5mn1ogu/) of **Daniel Pegues**_

## How to use

1. **include CSS & JavaScript**
    ```html
    <head>
    ...
    <style> html, body, #map { height: 100%; width: 100%; padding: 0; margin: 0; } </style>
    <!-- Google Maps API -->
    <script src="https://maps.googleapis.com/maps/api/js?key=<INSERT_HERE_API_KEY>"></script>
    <!-- interact.js -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/interact.js/1.2.9/interact.min.js"></script>
    <!-- Leaflet (JS/CSS) -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.4/leaflet.css" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.4/leaflet.js"></script>
    <!-- Leaflet-GoogleMutant -->
    <script src="https://unpkg.com/leaflet.gridlayer.googlemutant@0.7.0/Leaflet.GoogleMutant.js"></script>
    <!-- Leaflet-Pegman -->
    <link rel="stylesheet" href="https://raruto.github.io/cdn/leaflet-pegman/0.0.1/leaflet-pegman.css" />
    <script src="https://raruto.github.io/cdn/leaflet-pegman/0.0.1/leaflet-pegman.js"></script>
    ...
    </head>
    ```
2. **choose a div container used for the slippy map**
    ```html
    <body>
    ...
	  <div id="map"></div>
    ...
    </body>
    ```
3. **create your first simple “leaflet-google” slippy map**
    ```html
    <script>
      var lmap = L.map('lmap');
      lmap.setView(new L.LatLng(45, 9.5), 5);

      var OpenTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map data: &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        opacity: 0.90
        });
      OpenTopoMap.addTo(lmap);

      var pegmanControl = new L.Control.Pegman({
        position: 'bottomright', // position of control inside the map
        clickableStreetViewLayer: false, // WARNING: when enabled it will violate Google ToS rules
        theme: "leaflet-pegman-v3-default", // or "leaflet-pegman-v3-small"
      });
      pegmanControl.addTo(lmap);
    </script>
    ```

_**NB** to be able to use the “pegman” (a.k.a. “Street View Control”) you **MUST** use a valid [Google Maps API Key](https://developers.google.com/maps/documentation/javascript/get-api-key)._

---

**Compatibile with:** leaflet@1.3.4, gmaps@3.34, leaflet-googlemutant@0.7.0, interactJS@1.2.9

---

**Contributors:** [Pegues](http://jsfiddle.net/user/pegues/fiddles/), [Raruto](https://github.com/Raruto/leaflet-google)
