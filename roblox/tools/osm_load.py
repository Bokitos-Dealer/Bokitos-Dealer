"""Load and merge OSM XML tiles into plain dictionaries."""
import glob
import os
import xml.etree.ElementTree as ET


class OSM:
    def __init__(self):
        self.nodes = {}  # id -> (lat, lon, tags)
        self.ways = {}  # id -> (node ids, tags)
        self.rels = {}  # id -> (members [(type, ref, role)], tags)

    def load_dir(self, d):
        for path in sorted(glob.glob(os.path.join(d, "*.osm"))):
            self.load(path)
        return self

    def load(self, path):
        for _, el in ET.iterparse(path, events=("end",)):
            tag = el.tag
            if tag == "node":
                i = int(el.get("id"))
                if i not in self.nodes:
                    tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
                    self.nodes[i] = (float(el.get("lat")), float(el.get("lon")), tags)
                el.clear()
            elif tag == "way":
                i = int(el.get("id"))
                if i not in self.ways:
                    nds = [int(n.get("ref")) for n in el.findall("nd")]
                    tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
                    self.ways[i] = (nds, tags)
                el.clear()
            elif tag == "relation":
                i = int(el.get("id"))
                members = [(m.get("type"), int(m.get("ref")), m.get("role") or "") for m in el.findall("member")]
                tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
                if i not in self.rels or len(members) > len(self.rels[i][0]):
                    self.rels[i] = (members, tags)
                el.clear()
        return self
