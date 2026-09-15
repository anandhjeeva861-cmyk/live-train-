# Public data provenance

The bundled catalogue contains **10,516 distinct train numbers**, not 10,516 certified currently operating trains. It combines two public sources and never duplicates identifiers to reach a target count.

| Source | Included trains | Reviewed snapshot | License declared by publisher |
|---|---:|---|---|
| [Indian Trains Schedule & Routes — Rohan Patel](https://www.kaggle.com/datasets/rohan26x/indian-express-train-dataset) | 8,490 | Version 2, published 2025-09-15 | MIT |
| [DataMeet Indian Railways](https://github.com/datameet/railways/tree/e0c538a1e41ae5eace454d2818902e1065608e16) | 2,026 additional identifiers | Commit `e0c538a1e41ae5eace454d2818902e1065608e16`, 2016-08-08 | CC0 |

The newer dataset wins duplicate numbers. 69 nonstandard identifiers were excluded. The source files, dates, raw checksums, normalized checksums and exclusions are recorded in [manifest.json](public/data/manifest.json). The importer pins the reviewed Kaggle zip SHA-256 and DataMeet commit. Changing a source requires reviewing its licensing, dates, schema and counts before updating metadata.

Stations are matched by code, using DataMeet coordinates where available. There are 9,494 referenced stations, 1,106 without coordinates, and 289,363 route entries. Repeated station visits are retained. Times and journey days come from source entries; missing values remain null. Duration is computed only when endpoint times and source day numbers permit it. An empty source name is displayed as `Train <number> (name unavailable)`. No synthetic stops, fares, seats, ratings or platforms are added. The older DataMeet schedule can contain passing stations with unknown halt status.

## Attractions and photographs

[Wikidata](https://www.wikidata.org/) provides CC0 place identifiers, labels, categories, country, coordinates and P18 image statements. The reproducible SPARQL query and retrieval date are in [tourism-source.json](public/data/tourism-source.json). Selected types include temples, forts, palaces, museums, parks, lakes and other photographed destinations. These types and source completeness limit coverage.

5,142 unique places have a bitmap image and usable attribution from the [Wikimedia Commons imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo). Each [place record](public/data/tourist-spots.json) contains its source URL, original photo page, author, license and license URL. The app exposes these credits alongside the photo. It displays resized/cropped thumbnails. The import excludes image records without supported reuse terms, missing authors and many map/logo/drawing filenames. The photographs are sourced images, not generated assets. Crowdsourced source mistakes remain possible.

The homepage uses Bangalore Palace by SMit224, [original photograph](https://commons.wikimedia.org/wiki/File:Bangalore_palace.jpg), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), with a visual crop and overlay. No generated train image is used.

Route tourism matches the minimum straight-line distance from an attraction to any mapped route station, deduplicates by Wikidata ID and sorts by route order then distance. Selecting one station limits matching to that station. This does not measure walking/road distance or establish that a place can be visited within the train's halt time. Google Maps supplies external directions. Coverage is not every attraction at every station; the interface lists stations with no nearby indexed photograph or unknown coordinates and links to Google Maps area searches.

## Source license notice

The Kaggle publisher declares the MIT license. Attribution: Rohan Patel, Indian Trains Schedule & Routes, version 2 (2025). Retain any upstream copyright notices with redistributed data. MIT permission text:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

DataMeet and Wikidata structured data use [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Each photograph retains its individual license; dataset licensing does not replace photograph licensing.
