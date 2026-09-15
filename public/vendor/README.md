# Local browser assets

These pinned upstream files are served locally so a CDN outage cannot block login, checkout or the map controls.

- `leaflet/`: `leaflet@1.9.4`, obtained with `npm pack leaflet@1.9.4 --ignore-scripts`. Includes the unmodified distribution JavaScript, source map, CSS, images and BSD license. Upstream: https://leafletjs.com/ and https://github.com/Leaflet/Leaflet/tree/v1.9.4.
- `inter/`: Latin normal weights 400–800 from `@fontsource/inter@5.2.6`, obtained with `npm pack @fontsource/inter@5.2.6 --ignore-scripts`. Includes the upstream SIL Open Font License and a local `font-display: swap` stylesheet. Tamil text uses the browser's fallback fonts. Upstream: https://github.com/rsms/inter.

To upgrade, fetch a reviewed, explicitly pinned package version using `npm pack --ignore-scripts`, replace only its corresponding distribution files, retain the license, update this record and run the browser suites. Do not copy the package's scripts or development dependencies into `public`.

Map tiles and weather data still require internet access; local assets do not provide offline railway maps or live telemetry.
