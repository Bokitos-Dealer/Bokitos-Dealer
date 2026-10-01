--!strict
-- The hub: a round island with a big globe, a practice loop, the bike shop
-- and one glowing portal per city.

local Build = require(script.Parent.Parent.Build)
local Kit = require(script.Parent.Parent.Kit)
local Roads = require(script.Parent.Parent.Roads)

type BuildList = Build.BuildList

local M = Kit.M
local S = Roads.SURF
local TOP = Roads.TOP

local Hub = {}

export type PortalCity = { id: string, name: string, col: number }

local DEFAULT_CITIES: { PortalCity } = {
	{ id = "amsterdam", name = "Amsterdam", col = 0xe63c28 },
	{ id = "paris", name = "Paris", col = 0x2850c8 },
	{ id = "newyork", name = "New York", col = 0xfac828 },
}

function Hub.generate(cities: { PortalCity }?): BuildList
	local list = cities or DEFAULT_CITIES
	local b = Build.new()
	local rng = Build.rng(42)
	local R = 70 * M
	-- island, grass ring and the sea around it
	b:cyl(0, -6, 0, 12, R, { roll = math.pi / 2, mat = "Grass", col = 0x5a8f3a })
	b:cyl(0, TOP.plaza - 0.3, 0, 0.6, 52 * M, { roll = math.pi / 2, mat = "Pavement", col = 0xc4bcae })
	for x = -260 * M, 200 * M, 200 * M do
		for z = -260 * M, 200 * M, 200 * M do
			b:addWater(x + 30 * M, -9, z + 30 * M, 200 * M, 12, 200 * M)
		end
	end
	-- practice loop with coins
	Roads.arc(b, 30 * M, 38 * M, -math.pi, math.pi, TOP.road + 0.05, S.asphalt, 24)
	Roads.arc(b, 29 * M, 30 * M, -math.pi, math.pi, TOP.bike + 0.06, S.bike, 24)
	Roads.arc(b, 38 * M, 39 * M, -math.pi, math.pi, TOP.bike + 0.06, S.bike, 24)
	local loop = {}
	for k = 0, 48 do
		local a = k / 48 * math.pi * 2
		table.insert(loop, { math.sin(a) * 34 * M, TOP.road + 0.4, math.cos(a) * 34 * M })
		if k % 3 == 0 and k < 48 then
			b:coin(math.sin(a) * 34 * M, TOP.road + 3, math.cos(a) * 34 * M)
		end
	end
	b:lane("bike", loop, true)
	-- the globe
	b:cyl(0, 2.5 * M, 0, 5 * M, 7 * M, { roll = math.pi / 2, mat = "Marble", col = 0xe6e2da })
	b:ball(0, 16 * M, 0, 10 * M, { mat = "SmoothPlastic", col = 0x2b6cb0 })
	for k = 1, 9 do
		local a = rng:range(0, math.pi * 2)
		local e = rng:range(-0.9, 0.9)
		local x, y, z = math.cos(a) * math.cos(e), math.sin(e), math.sin(a) * math.cos(e)
		b:ball(x * 8.6 * M, 16 * M + y * 8.6 * M, z * 8.6 * M, rng:range(2.5, 4.5) * M, { mat = "Grass", col = 0x4f9d4a })
	end
	b:sign(0, 30 * M, 0, 0, 40 * M, 6 * M, "BIKE THE WORLD", 0xffffff, 0x1d3f8f)
	b:sign(0, 30 * M, 0, math.pi, 40 * M, 6 * M, "BIKE THE WORLD", 0xffffff, 0x1d3f8f)
	-- portals
	local n = #list
	for i, c in list do
		local a = math.pi + (i - (n + 1) / 2) * (math.pi / 2.4)
		local r = 47 * M
		local x, z = math.sin(a) * r, math.cos(a) * r
		local yaw = Kit.faceYaw(-math.sin(a), -math.cos(a)) -- face the globe
		local w, h = 14 * M, 16 * M
		local frame = { mat = "Neon", col = c.col }
		b:obox(x, z, yaw, -w / 2, h / 2, 0, 1.5 * M, h, 1.5 * M, frame)
		b:obox(x, z, yaw, w / 2, h / 2, 0, 1.5 * M, h, 1.5 * M, frame)
		b:obox(x, z, yaw, 0, h, 0, w + 1.5 * M, 1.5 * M, 1.5 * M, frame)
		b:obox(x, z, yaw, 0, h / 2, 0, w - 1.5 * M, h - 1, 0.6, { mat = "ForceField", col = c.col, transp = 0.2, coll = false, tag = "Portal:" .. c.id })
		local sx, sz = Build.rot(yaw, 0, -1.2 * M)
		b:sign(x + sx, h + 4 * M, z + sz, yaw, w + 4 * M, 3.2 * M, c.name, 0xffffff, c.col)
		table.insert(b.portals, { id = c.id, x = x, y = h / 2, z = z, yaw = yaw })
		-- flower boxes either side
		for _, sd in { -1, 1 } do
			local fx, fz = Build.rot(yaw, sd * (w / 2 + 3 * M), -2 * M)
			Kit.flowerBox(b, rng, x + fx, z + fz, yaw)
		end
	end
	-- bike shop kiosk
	local kx, kz = math.sin(0.4) * 46 * M, math.cos(0.4) * 46 * M
	local kyaw = Kit.faceYaw(-math.sin(0.4), -math.cos(0.4))
	b:obox(kx, kz, kyaw, 0, 2 * M, 0, 12 * M, 4 * M, 6 * M, { mat = "Wood", col = 0xb5651d })
	b:obox(kx, kz, kyaw, 0, 1.2 * M, -3.5 * M, 12 * M, 2.4 * M, 1 * M, { mat = "Wood", col = 0x8b4513, tag = "ShopKiosk" })
	b:obox(kx, kz, kyaw, 0, 4.6 * M, -1.5 * M, 13 * M, 0.4 * M, 9 * M, { mat = "Fabric", col = 0xe63c28, pitch = -0.2 })
	local sx, sz = Build.rot(kyaw, 0, -4.2 * M)
	b:sign(kx + sx, 6.2 * M, kz + sz, kyaw, 12 * M, 2.4 * M, "BIKE SHOP", 0xffffff, 0x2d6a4f)
	for j = -2, 2 do
		local px, pz = Build.rot(kyaw, j * 2.2 * M, -6 * M)
		Kit.parkedBike(b, rng, kx + px, kz + pz, kyaw + math.pi / 2)
	end
	-- trees and benches on the grass ring
	for k = 0, 23 do
		local a = k / 24 * math.pi * 2 + 0.13
		if math.abs(math.cos(a - math.pi)) < 0.6 or k % 2 == 0 then
			Kit.tree(b, rng, math.sin(a) * 61 * M, math.cos(a) * 61 * M, 1.1)
		end
		if k % 4 == 1 then
			Kit.lamp(b, math.sin(a) * 51 * M, math.cos(a) * 51 * M)
		end
	end
	-- an invisible fence at the shore
	Roads.arcWall(b, R + 1, -math.pi, math.pi, -2, 40, 2, { mat = "SmoothPlastic", col = 0xfffffe }, 40)
	for _, p in b.prims do
		if p.col == 0xfffffe then
			p.transp = 1
			p.shadow = false
		end
	end
	b.spawn = { x = 0, y = 4, z = 20 * M, yaw = math.pi }
	return b
end

return Hub
