package main

// Steel & Spell's names, copied from web/games/steelspell/js/data (balance 0.2.3) so
// made-up runs read like real ones. Nothing breaks if the game renames something: a
// run carries the names it was played with.

type ssNamed struct{ id, name string }

type ssWeaponDef struct {
	id, name, kind string
	evos           []ssNamed
}

type ssItemDef struct{ id, name, rarity string }

var ssWeapons = []ssWeaponDef{
	{"fireball", "Fireball", "Magic", []ssNamed{{"inferno", "Inferno Orb"}, {"scatter", "Scatter Flame"}}},
	{"aura", "Aura", "Magic", []ssNamed{{"emp", "EMP Aura"}, {"sanctum", "Sanctum"}}},
	{"meteor", "Meteor", "Magic", []ssNamed{{"shower", "Meteor Shower"}, {"cataclysm", "Cataclysm"}}},
	{"chain", "Chain Lightning", "Magic", []ssNamed{{"web", "Storm Web"}, {"overcharge", "Overcharge"}}},
	{"icearrow", "Ice Arrow", "Magic", []ssNamed{{"glacier", "Glacier Lance"}, {"shatter", "Shatter"}}},
	{"phase", "Phase Dash", "Magic", []ssNamed{{"blink", "Blink Strike"}, {"shroud", "Shroud"}}},
	{"laser", "Laser", "Magic", []ssNamed{{"prism", "Prism"}, {"sweeper", "Sweeper"}}},
	{"flamethrower", "Flamethrower", "Physical", []ssNamed{{"dragon", "Dragon's Breath"}, {"napalm", "Napalm"}}},
	{"firetrail", "Fire Trail", "Magic", []ssNamed{{"wildfire", "Wildfire"}, {"comet", "Comet Tail"}}},
	{"spear", "Spear", "Physical", []ssNamed{{"pike", "Pike Wall"}, {"javelin", "Javelin"}}},
	{"boomerang", "Boomerang", "Physical", []ssNamed{{"glaive", "Glaive"}, {"orbit", "Orbit Blades"}}},
	{"pistol", "Pistol", "Physical", []ssNamed{{"revolver", "Revolver"}, {"dual", "Dual Wield"}}},
	{"sword", "Sword", "Physical", []ssNamed{{"great", "Greatsword"}, {"parry", "Parry Blade"}}},
	{"shield", "Shield", "Physical", []ssNamed{{"bulwark", "Bulwark"}, {"spiked", "Spiked Shield"}}},
	{"rocket", "Rocket", "Physical", []ssNamed{{"barrage", "Barrage"}, {"nuke", "Nuke"}}},
	{"drone", "Drone", "Physical", []ssNamed{{"squadron", "Squadron"}, {"guardian", "Guardian"}}},
	{"hurricane", "Hurricane", "Magic", []ssNamed{{"twin", "Twin Gales"}, {"eye", "Eye of the Storm"}}},
	{"shotgun", "Shotgun", "Physical", []ssNamed{{"double", "Double Barrel"}, {"sawnoff", "Sawn-off"}}},
	{"iceflash", "Ice Flash", "Magic", []ssNamed{{"darkice", "Dark Ice"}, {"permafrost", "Permafrost"}}},
	{"summon", "Summon", "Magic", []ssNamed{{"gunner", "Gunslinger"}, {"twins", "Twin Copies"}}},
}
var ssItems = []ssItemDef{
	{"vest", "Leather Vest", "grey"},
	{"boots", "Light Boots", "grey"},
	{"quiver", "Spare Quiver", "grey"},
	{"coin", "Lucky Coin", "grey"},
	{"whetstone", "Whetstone", "grey"},
	{"knuckles", "Iron Knuckles", "grey"},
	{"filings", "Iron Filings", "grey"},
	{"mail", "Plated Mail", "grey"},
	{"dice", "Loaded Dice", "grey"},
	{"hide", "Troll Hide", "blue"},
	{"lens", "Wide Lens", "blue"},
	{"mark", "Hunter's Mark", "blue"},
	{"banner", "War Banner", "blue"},
	{"sand", "Slow Sand", "blue"},
	{"oil", "Lamp Oil", "blue"},
	{"piercer", "Armor Piercer", "blue"},
	{"needle", "Spell Needle", "blue"},
	{"thorned", "Thorned Mail", "blue"},
	{"clover", "Four-leaf Clover", "blue"},
	{"bracers", "Giant's Bracers", "purple"},
	{"tome", "Scholar's Tome", "purple"},
	{"heart", "Stone Heart", "purple"},
	{"lodestone", "Lodestone", "purple"},
	{"lesson", "Mentor's Lesson", "purple"},
	{"steel", "Tempered Steel", "purple"},
	{"focus", "Arcane Focus", "purple"},
	{"kindling", "Kindling", "purple"},
	{"wind", "Second Wind", "purple"},
	{"fang", "Vampire Fang", "purple"},
	{"siege", "Siege Edge", "purple"},
	{"hexlens", "Hex Lens", "purple"},
	{"weakspot", "Weak Spot", "purple"},
	{"rubber", "Rubber Bullets", "purple"},
	{"plate", "Bulwark Plate", "purple"},
	{"edge", "Void Edge", "legendary"},
	{"pact", "Blood Pact", "legendary"},
	{"feather", "Phoenix Feather", "legendary"},
	{"hourglass", "Hourglass", "legendary"},
	{"armory", "Armory Key", "legendary"},
	{"compass", "Compass", "legendary"},
	{"crown", "Cursed Crown", "legendary"},
	{"echo", "Echo Stone", "legendary"},
	{"pocket", "Pocket Magnet", "legendary"},
	{"medal", "Veteran's Medal", "legendary"},
}
var ssActives = []ssNamed{{"flash", "Flash"}, {"ghost", "Ghost"}, {"berserk", "Berserk"}, {"ignite", "Ignite"}, {"stash", "Stash"}, {"inspiration", "Inspiration"}}
var ssStatNames = []string{"Damage", "Haste", "Size", "Count", "Crit chance", "Crit damage", "Duration", "Speed", "XP", "Magnet", "Armor", "Vitality", "Recovery"}
