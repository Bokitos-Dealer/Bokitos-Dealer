#!/usr/bin/env python3
"""Download OpenStreetMap data for the game's cities.

Map data (c) OpenStreetMap contributors, available under the Open Database
License (ODbL): https://www.openstreetmap.org/copyright

Usage: python3 tools/fetch_osm.py OUT_DIR [city ...]
Downloads small tiles from the OSM API (it only allows small areas per
request) with a pause between requests, and skips tiles already present.
"""
import os
import sys
import time
import urllib.request

UA = "BikeTheWorld-map-import/1.0 (Roblox game; one-off city data download)"

# (min_lon, min_lat, max_lon, max_lat), tile size in degrees (lon, lat)
CITIES = {
    "amsterdam": ((4.8760, 52.3585, 4.9060, 52.3815), (0.0075, 0.0046)),
    "paris": ((2.2840, 48.8520, 2.3260, 48.8760), (0.0070, 0.0048)),
    "newyork": ((-73.9950, 40.7400, -73.9700, 40.7680), (0.0083, 0.0056)),
}


def tiles(bbox, step):
    x0, y0, x1, y1 = bbox
    sx, sy = step
    y = y0
    while y < y1 - 1e-9:
        x = x0
        while x < x1 - 1e-9:
            yield (round(x, 6), round(y, 6), round(min(x + sx, x1), 6), round(min(y + sy, y1), 6))
            x += sx
        y += sy


def fetch(url, path):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            with open(path + ".part", "wb") as f:
                f.write(data)
            os.replace(path + ".part", path)
            return len(data)
        except Exception as e:  # network hiccups: wait and retry
            print("  retry", attempt + 1, e, flush=True)
            time.sleep(4 * (attempt + 1))
    raise RuntimeError("failed: " + url)


def main():
    out = sys.argv[1]
    names = sys.argv[2:] or list(CITIES)
    for name in names:
        bbox, step = CITIES[name]
        d = os.path.join(out, name)
        os.makedirs(d, exist_ok=True)
        for i, t in enumerate(tiles(bbox, step)):
            path = os.path.join(d, "tile_%03d.osm" % i)
            if os.path.exists(path):
                continue
            url = "https://www.openstreetmap.org/api/0.6/map?bbox=%f,%f,%f,%f" % t
            n = fetch(url, path)
            print("%s tile %d %s %.1f MB" % (name, i, t, n / 1e6), flush=True)
            time.sleep(1.5)


if __name__ == "__main__":
    main()
