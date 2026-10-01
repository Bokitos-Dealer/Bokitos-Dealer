// Bundles Luau modules + a test file into one script that runs in the plain
// `luau` CLI. Roblox-style requires (require(script.Parent.X)) are emulated
// with fake `script` objects that resolve to file paths.
//
// usage: node tests/bundle.mjs tests/cities.test.luau > /tmp/bundle.luau
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src');
const testFile = process.argv[2];

const modules = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.luau') && !name.includes('.server.') && !name.includes('.client.')) modules.push(p);
  }
}
walk(join(src, 'shared'));

let out = `
local __defs = {}
local __cache = {}
local __node
__node = function(path)
  return setmetatable({ __path = path }, {
    __index = function(t, k)
      if k == "Parent" then
        local parent = string.match(path, "^(.*)/[^/]+$") or ""
        return __node(parent)
      end
      if k == "Name" then return string.match(path, "([^/]+)$") end
      return __node(path .. "/" .. k)
    end,
  })
end
local function __require(node)
  local path = rawget(node, "__path")
  if __cache[path] ~= nil then return __cache[path] end
  local def = __defs[path]
  if not def then error("module not found: " .. tostring(path)) end
  local result = def(node, __require)
  __cache[path] = result
  return result
end
-- minimal Roblox stand-ins used by shared modules
Color3 = { fromRGB = function(r, g, b) return { R = r / 255, G = g / 255, B = b / 255 } end }
Vector3 = { new = function(x, y, z) return { X = x, Y = y, Z = z } end }
`;
for (const file of modules) {
  const rel = relative(src, file).replace(/\.luau$/, '').replace(/\\/g, '/');
  const code = readFileSync(file, 'utf8').replace(/^--!strict\s*$/m, '');
  out += `\n__defs[${JSON.stringify(rel)}] = function(script, require)\n${code}\nend\n`;
}
const test = readFileSync(testFile, 'utf8');
out += `\nlocal function __root(path) return __node(path) end\nlocal require = __require\nlocal shared = __node("shared")\n${test}\n`;
process.stdout.write(out);
