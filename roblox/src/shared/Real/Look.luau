--!strict
-- How each real city looks: materials, colours and street furniture styles.
-- Used by the server (city shapes) and the client (facade details).

local Look = {}

Look.M = 3 -- studs per metre

-- material codes written by tools/osm_to_luau.py
Look.MAT = {
	[0] = "Brick",
	[1] = "Plaster",
	[2] = "Limestone",
	[3] = "Concrete",
	[4] = "Glass",
	[5] = "Sandstone",
	[6] = "WoodPlanks",
	[7] = "Granite",
	[8] = "Metal",
}

-- street surface codes
Look.SURF = {
	[0] = { mat = "Asphalt", col = 0x3B3C40 },
	[1] = { mat = "Brick", col = 0x8A6658 }, -- Dutch klinkers
	[2] = { mat = "Cobblestone", col = 0x77726B }, -- Paris pavés
	[3] = { mat = "Asphalt", col = 0x9A3D33 }, -- red Dutch bike path
	[4] = { mat = "Concrete", col = 0x9D9B96 },
	[5] = { mat = "Pavement", col = 0xB5AEA2 },
	[6] = { mat = "Sand", col = 0xD2C09C }, -- park gravel
	[7] = { mat = "WoodPlanks", col = 0x8A6A4A },
	[8] = { mat = "Granite", col = 0x9A968F },
	[9] = { mat = "Grass", col = 0x5B8A3C },
}

export type CityLook = {
	quay: { mat: string, col: number },
	cap: { mat: string, col: number },
	deck: { mat: string, col: number },
	parapet: { mat: string, col: number },
	crown: { number },
	treeHeight: number, -- metres
	crownRadius: number,
	lamp: string,
	lampColor: number,
	bollard: number,
	bench: number,
	bikeColors: { number },
	shareBike: number?,
	-- facades
	groundFloor: number, -- metres
	floor: number,
	bay: number,
	window: { number }, -- width, height (metres)
	frame: number,
	glass: number,
	doorColors: { number },
	awnings: { number },
}

Look.city = {
	amsterdam = {
		quay = { mat = "Brick", col = 0x5E3B2E },
		cap = { mat = "Granite", col = 0x8E8A84 },
		deck = { mat = "Brick", col = 0x6A3C2E },
		parapet = { mat = "Brick", col = 0x6A3C2E },
		crown = { 0x4C7A34, 0x557F38, 0x46702F, 0x5E8A3F },
		treeHeight = 13,
		crownRadius = 4.2,
		lamp = "amsterdam",
		lampColor = 0x1F2B24,
		bollard = 0x5A2A22,
		bench = 0x2F4A33,
		bikeColors = { 0x1E1E20, 0x23395D, 0x2D5A3C, 0x8C2F2F, 0xD9D4C7, 0x5A4636 },
		shareBike = nil,
		groundFloor = 3.6,
		floor = 3.1,
		bay = 2.3,
		window = { 1.15, 1.9 },
		frame = 0xF2F0EA,
		glass = 0x23292E,
		doorColors = { 0x1F3A2A, 0x22324A, 0x6B1E1E, 0x1C1C1C, 0x5A3A24, 0x2E4E4E },
		awnings = { 0x2D5A3C, 0x8C2F2F, 0x23395D, 0x3B3B3B },
	} :: CityLook,
	paris = {
		quay = { mat = "Limestone", col = 0xB8AD98 },
		cap = { mat = "Limestone", col = 0xCFC4AE },
		deck = { mat = "Limestone", col = 0xC9BEA6 },
		parapet = { mat = "Limestone", col = 0xD3C8B0 },
		crown = { 0x5C7F3A, 0x678A41, 0x557636 },
		treeHeight = 16,
		crownRadius = 4.8,
		lamp = "paris",
		lampColor = 0x1E2420,
		bollard = 0x2C3A30,
		bench = 0x2C3A30,
		bikeColors = { 0x1E1E20, 0x5C6E58, 0xD9D4C7, 0x8C2F2F },
		shareBike = 0x7FA88A, -- Vélib' green
		groundFloor = 4.4,
		floor = 3.0,
		bay = 3.1,
		window = { 1.25, 2.3 },
		frame = 0xE9E4D8,
		glass = 0x2A3036,
		doorColors = { 0x1F3A2A, 0x22324A, 0x2B2B2B, 0x4A2E22 },
		awnings = { 0x8C2F2F, 0x23395D, 0x1F3A2A, 0x6B1E1E },
	} :: CityLook,
	newyork = {
		quay = { mat = "Concrete", col = 0x7D7A74 },
		cap = { mat = "Granite", col = 0x8A8680 },
		deck = { mat = "Granite", col = 0x8A8680 },
		parapet = { mat = "Granite", col = 0x8A8680 },
		crown = { 0x5A8A3A, 0x6A9444, 0x4E7A33 },
		treeHeight = 10,
		crownRadius = 3.4,
		lamp = "newyork",
		lampColor = 0x6E7378,
		bollard = 0x55595D,
		bench = 0x2F4A33,
		bikeColors = { 0x1E1E20, 0x8C2F2F, 0x23395D },
		shareBike = 0x1E6FD9, -- Citi Bike blue
		groundFloor = 4.5,
		floor = 3.4,
		bay = 2.6,
		window = { 1.1, 1.75 },
		frame = 0xD9D4C7,
		glass = 0x2A3138,
		doorColors = { 0x1C1C1C, 0x3A2A20, 0x22324A },
		awnings = { 0x8C2F2F, 0x23395D, 0x1F3A2A, 0xC8A02E, 0x3B3B3B },
	} :: CityLook,
}

function Look.get(style: string): CityLook
	return Look.city[style] or Look.city.amsterdam
end

return Look
