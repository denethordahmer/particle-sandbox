#!/usr/bin/env python3
"""Particle Sandbox: full 48x48 interaction board, readable sheets."""

from PIL import Image, ImageDraw, ImageFont

FD = "/usr/share/fonts/truetype/dejavu/"
def font(s, b=False):
    return ImageFont.truetype(FD + ("DejaVuSans-Bold.ttf" if b else "DejaVuSans.ttf"), s)

BG, TEXT, MUTED, DIM = (13,15,21),(233,237,245),(146,157,176),(96,105,122)
ACCENT = (140,190,235)

CAT_COL = {"structure":(108,170,255), "granular":(232,192,92),
           "liquid":(88,200,255), "gas":(160,140,255),
           "fire":(255,140,60), "reactive":(120,235,180), "metal":(200,200,120)}

def m(cat, col, state, dens=1.0, heat=0, melt=99, ignite=0, chill=0,
      fuel=0, explode=False, conduct=False, inert=False, soluble=False,
      absorb=False, acidic=False, acidvuln=0, freezable=False, shatter=False,
      cool=0, coolto=None, mob=1.0, spread=0, drift=0.3, rise=1):
    """One material and how it disperses.

    Dispersion is per-material, not per-state, because the way a heap of gold
    nuggets settles has nothing to do with the way a puff of steam spreads.

      mob     powders: 0..1 chance of rolling off a slope each tick. 1 is dry
              sand at its natural angle of repose; lower is stickier or
              blockier, so it heaps steeper.
      spread  liquids: how many cells sideways the liquid creeps per tick when
              it cannot fall. High is thin and mobile, low is thick.
      drift   gases: 0..1 chance of sliding sideways per tick instead of
              climbing. High is a lazy cloud, low is a straight jet.
      rise    gases: cells climbed per tick. Buoyancy, so lighter gas climbs
              faster: hydrogen and steam outpace a toxic gas haze.
      cool    hot materials: ticks of heat before it sets into `coolto`. A hot
              cell that melts or burns something spends heat faster.
    """
    return dict(cat=cat, col=col, state=state, dens=dens, heat=heat, melt=melt,
                ignite=ignite, chill=chill, fuel=fuel, explode=explode,
                conduct=conduct, inert=inert, soluble=soluble, absorb=absorb,
                acidic=acidic, acidvuln=acidvuln, freezable=freezable,
                shatter=shatter, cool=cool, coolto=coolto,
                mob=mob, spread=spread, drift=drift, rise=rise)

M = {}
# ---- structure
# Fixed things. Nothing here moves on its own except Wood and Sponge, which are
# lighter than water and must float up through it.
M["Stone"]    = m("structure",(107,114,128),"solid", 2.6, melt=2, acidvuln=2, shatter=True)
M["Bedrock"]  = m("structure",(63,63,70),"solid", 3.0, inert=True)
M["Ice"]      = m("structure",(165,232,240),"solid", 0.9, melt=1, shatter=True)
M["Glass"]    = m("structure",(207,232,245),"solid", 2.5, melt=2, acidvuln=1, shatter=True)
M["Metal"]    = m("structure",(154,165,177),"solid", 7.8, melt=2, acidvuln=2, conduct=True)
M["Wood"]     = m("structure",(139,90,43),"solid", 0.6, fuel=2, acidvuln=2, shatter=True)
M["Sponge"]   = m("structure",(217,178,106),"solid", 0.3, fuel=1, absorb=True, acidvuln=1)
M["Clay"]     = m("structure",(176,107,74),"solid", 1.8, melt=2, acidvuln=2, shatter=True)
# ---- granular
# Dry, free-running grains tumble off a slope at ~35 degrees. Powders that are
# damp, sticky or blocky heap up steeper, so they read as different stuff.
M["Sand"]     = m("granular",(224,192,112),"powder", 1.6, melt=2, acidvuln=1, shatter=True, mob=1.0)
M["Salt"]     = m("granular",(240,240,240),"powder", 2.2, melt=2, soluble=True, acidvuln=2, mob=1.0)
M["Gravel"]   = m("granular",(141,141,141),"powder", 2.0, melt=2, acidvuln=1, shatter=True, mob=0.9)
M["Soil"]     = m("granular",(107,74,47),"powder", 1.3, acidvuln=2, mob=0.45)
M["Gunpowder"]= m("granular",(74,74,74),"powder", 1.0, fuel=4, explode=True, mob=1.0)
M["Snow"]     = m("granular",(255,255,255),"powder", 0.3, melt=1, mob=0.8)
M["Coal"]     = m("granular",(42,42,42),"powder", 1.4, fuel=2, shatter=True, mob=0.7)
# ---- liquid
# Thin liquids level out fast and creep a long way; thick ones ooze. Mercury
# is the most mobile, tar the least.
M["Water"]    = m("liquid",(59,130,246),"liquid", 1.0, conduct=True, freezable=True, spread=3)
M["Oil"]      = m("liquid",(122,96,40),"liquid", 0.8, fuel=3, freezable=True, spread=3)
M["Lava"]     = m("liquid",(255,90,31),"liquid", 3.0, heat=3, ignite=3, spread=1,
                   cool=2400, coolto="Stone")
M["Acid"]     = m("liquid",(125,219,42),"liquid", 1.2, acidic=True, spread=3)
M["Alkali"]   = m("liquid",(34,211,197),"liquid", 1.1, spread=3)
M["Mercury"]  = m("liquid",(192,200,208),"liquid", 13.6, conduct=True, freezable=True, spread=4)
M["Tar"]      = m("liquid",(26,26,26),"liquid", 1.15, fuel=3, freezable=True, spread=1)
# ---- gas & sky
# Buoyancy decides how fast each one climbs; drift decides how much it wanders.
M["Steam"]    = m("gas",(200,212,224),"gas", 0.1, freezable=True, rise=2, drift=0.5)
M["Cloud"]    = m("gas",(232,238,245),"gas", 0.05, rise=1, drift=0.6)
M["Rain"]     = m("gas",(91,155,213),"liquid", 1.0, conduct=True, freezable=True, spread=3)
M["Frost"]    = m("gas",(207,233,255),"powder", 0.2, chill=2, mob=0.8)
M["Lightning"]= m("gas",(255,224,102),"energy", 0.0, heat=2, ignite=2, rise=1, drift=0.2)
M["Plasma"]   = m("gas",(255,79,216),"energy", 0.0, heat=3, ignite=3, rise=2, drift=0.1)
M["Toxic Gas"]= m("gas",(154,205,50),"gas", 0.4, acidic=True, rise=1, drift=0.55)
# ---- fire & energy
M["Fire"]     = m("fire",(255,138,0),"energy", 0.0, heat=1, ignite=2, rise=1, drift=0.5)
M["Spark"]    = m("fire",(255,225,77),"energy", 0.0, heat=1, ignite=2, rise=1, drift=0.2)
M["Molten Metal"]=m("fire",(255,154,60),"liquid", 7.0, heat=2, ignite=2, conduct=True,
                   spread=1, cool=900, coolto="Metal")
M["Phosphor"] = m("fire",(182,255,92),"powder", 1.8, heat=1, ignite=1, fuel=2, mob=0.9)
# ---- reactive
# Foam is nearly weightless and barely tumbles; thermite powder is heavy and
# free-running; wax is soft enough to smear into a heap.
M["Foam"]     = m("reactive",(245,245,220),"powder", 0.1, absorb=True, mob=0.2)
M["Bomb"]     = m("reactive",(185,28,28),"powder", 2.0, explode=True, shatter=True, mob=0.9)
M["Hydrogen"] = m("reactive",(219,234,254),"gas", 0.05, fuel=4, explode=True, rise=3, drift=0.4)
M["Thermite"] = m("reactive",(194,65,12),"powder", 3.5, fuel=3, mob=1.0)
M["Crystal"]  = m("reactive",(126,231,255),"powder", 2.6, melt=2, acidvuln=1, shatter=True, mob=0.8)
M["Obsidian"] = m("reactive",(30,27,46),"solid", 2.4, melt=3, shatter=True)
M["Quicklime"]= m("reactive",(232,224,208),"powder", 1.0, acidvuln=2, mob=0.6)
M["Dry Ice"]  = m("reactive",(223,246,255),"powder", 1.5, chill=3, mob=0.7)
# ---- metals
# Nuggets, chunky ore and rust flake are all heavy and run freely.
M["Gold"]     = m("metal",(255,210,74),"powder", 19.3, melt=2, mob=0.9)
M["Iron Ore"] = m("metal",(138,90,60),"powder", 5.0, melt=2, acidvuln=2, shatter=True, mob=0.9)
M["Rust"]     = m("metal",(160,82,45),"powder", 4.0, melt=2, acidvuln=2, mob=0.9)
M["Sulphur"]  = m("metal",(232,212,77),"powder", 2.0, fuel=2, acidvuln=1, mob=0.9)
M["Limestone"]= m("structure",(214,208,190),"solid", 2.5, melt=2, acidvuln=2, shatter=True)
M["Wax"]      = m("reactive",(246,232,178),"powder", 0.9, melt=1, fuel=2, mob=0.35)
M["Rubber"]   = m("structure",(46,44,48),"powder", 1.1, melt=1, fuel=2, mob=0.4)

ORDER = ["Stone","Bedrock","Ice","Glass","Metal","Wood","Sponge","Clay",
         "Limestone","Rubber",
         "Sand","Salt","Gravel","Soil","Gunpowder","Snow","Coal",
         "Water","Oil","Lava","Acid","Alkali","Mercury","Tar",
         "Steam","Cloud","Rain","Frost","Lightning","Plasma","Toxic Gas",
         "Fire","Spark","Molten Metal","Phosphor",
         "Foam","Bomb","Hydrogen","Thermite","Crystal","Obsidian","Quicklime","Dry Ice",
         "Wax",
         "Gold","Iron Ore","Rust","Sulphur"]
assert len(ORDER) == 48

SPECIAL = {}
def sp(a, b, sym, why):
    assert a in M and b in M, (a, b)
    SPECIAL[frozenset((a, b))] = (sym, why)

# ================= explicit interactions =================
E = [
# water
("Water","Lava","R","obsidian + steam"),("Water","Fire","X","extinguished"),
("Water","Spark","X","extinguished"),("Water","Plasma","X","flashes to steam"),
("Water","Molten Metal","X","steam + solid metal"),("Water","Acid","R","diluted"),
("Water","Alkali","R","heats up"),("Water","Quicklime","R","hissing heat"),
("Water","Salt","D","dissolves"),("Water","Soil","R","mud"),
("Water","Clay","R","softens to mud"),("Water","Sponge","R","soaked up"),
("Water","Metal","R","rusts"),("Water","Iron Ore","R","rusts"),
("Water","Gunpowder","X","ruined"),("Water","Bomb","X","dud charge"),
("Water","Dry Ice","R","rolling fog"),('Water','Ice', "." , "ice floats, does not freeze the pool"),
("Water","Snow","F","freezes solid"),("Water","Frost","F","freezes solid"),
("Water","Steam","R","condenses"),("Water","Cloud","R","feeds the cloud"),
("Water","Rain","R","merges"),("Water","Mercury","^","mercury sinks through"),
("Water","Oil","^","oil floats"),("Water","Tar","^","tar sinks, water rides over"),
("Water","Phosphor","X","quenched"),("Water","Wood","R","soaks in"),
("Water","Toxic Gas","X","absorbed"),("Water","Lightning","R","conducts the shock"),
("Water","Hydrogen","^","escapes upward"),("Water","Crystal","R","slow growth"),
("Water","Foam","R","absorbs"),("Water","Coal","X","quenched"),
("Water","Glass","." ,"no reaction"),("Water","Gold","." ,"no reaction"),
("Water","Bedrock","." ,"no reaction"),("Water","Slag","." ,"no reaction"),
("Water","Obsidian","." ,"no reaction"),("Water","Sulphur","." ,"no reaction"),
("Water","Rust","R","spreads the rust"),("Water","Lead","." ,"no reaction"),
("Water","Gravel","R","packs wet"),("Water","Sand","R","packs wet"),
# lava
("Lava","Ice","R","steam + stone"),("Lava","Snow","R","steam + stone"),
("Lava","Frost","R","steam"),("Lava","Dry Ice","R","violent steam burst"),
("Lava","Foam","R","pops, spits"),("Lava","Steam","R","superheated steam"),
("Lava","Cloud","X","burns the cloud away"),("Lava","Rain","R","obsidian + steam"),
("Lava","Acid","R","bubbles, spatters"),("Lava","Alkali","R","bubbles, spatters"),
("Lava","Mercury","R","vaporises the mercury"),("Lava","Sand","R","molten glass"),
("Lava","Salt","R","molten salt"),("Lava","Clay","R","baked brick"),
("Lava","Soil","R","baked crust"),("Lava","Stone","M","melts to lava"),
("Lava","Gravel","M","melts to lava"),("Lava","Glass","M","melts, runs together"),
("Lava","Metal","M","melts"),("Lava","Gold","M","melts"),
("Lava","Lead","M","melts"),("Lava","Iron Ore","R","smelts to molten metal"),
("Lava","Crystal","M","melts"),("Lava","Obsidian","M","melts slowly"),
("Lava","Slag","M","melts"),("Lava","Rust","M","melts back to iron"),
("Lava","Wood","B","bursts into flame"),("Lava","Coal","B","ignites"),
("Lava","Oil","B","ignites"),("Lava","Tar","B","roaring black fire"),
("Lava","Sulphur","B","burns blue"),("Lava","Gunpowder","X","explodes on contact"),
("Lava","Bomb","X","detonates"),("Lava","Hydrogen","X","detonates"),
("Lava","Thermite","B","burns white hot"),("Lava","Phosphor","B","flares"),
("Lava","Plasma","R","fuses, spits"),("Lava","Lightning","R","arcing spatter"),
("Lava","Sponge","B","burns away"),("Lava","Toxic Gas","X","burns it off"),
("Lava","Bedrock","." ,"nothing affects bedrock"),
("Lava","Glow Dust","R","glows hotter"),
# fire
("Fire","Wood","B","burns"),("Fire","Coal","B","burns long and hot"),
("Fire","Oil","B","spreads fast"),("Fire","Tar","B","heavy black smoke"),
("Fire","Sulphur","B","blue flame"),("Fire","Gunpowder","X","explodes"),
("Fire","Bomb","X","detonates"),("Fire","Hydrogen","X","fireball"),
("Fire","Thermite","R","molten iron"),("Fire","Phosphor","B","flares"),
("Fire","Sponge","B","dries then burns"),("Fire","Ice","M","melts it"),
("Fire","Snow","M","melts it"),("Fire","Frost","M","melts it"),
("Fire","Steam","X","smothered"),("Fire","Cloud","X","smothered"),
("Fire","Rain","X","put out"),("Fire","Foam","X","put out"),
("Fire","Sand","X","smothered"),("Fire","Salt","X","smothered"),
("Fire","Soil","X","smothered"),("Fire","Gravel","X","smothered"),
("Fire","Toxic Gas","X","smothered"),("Fire","Dry Ice","X","killed by cold gas"),
("Fire","Water","X","put out"),("Fire","Lava","B","feeds it"),
("Fire","Plasma","R","merges"),("Fire","Lightning","R","merges"),
("Fire","Molten Metal","B","feeds it"),("Fire","Metal","." ,"too little heat"),
("Fire","Glass","." ,"too little heat"),("Fire","Clay","R","bakes to brick"),
("Fire","Quicklime","R","bakes"),("Fire","Crystal","." ,"too little heat"),
("Fire","Stone","." ,"too little heat"),("Fire","Obsidian","." ,"too little heat"),
("Fire","Gold","." ,"too little heat"),("Fire","Lead","." ,"too little heat"),
("Fire","Mercury","R","vaporises it slowly"),("Fire","Acid","." ,"no reaction"),
("Fire","Alkali","." ,"no reaction"),("Fire","Bedrock","." ,"no reaction"),
("Fire","Coal","B","burns"),
# spark
("Spark","Gunpowder","X","explodes"),("Spark","Bomb","X","detonates"),
("Spark","Hydrogen","X","fireball"),("Spark","Thermite","R","molten iron"),
("Spark","Oil","B","ignites"),("Spark","Tar","B","ignites"),
("Spark","Wood","B","ignites"),("Spark","Coal","B","ignites"),
("Spark","Sulphur","B","ignites"),("Spark","Phosphor","B","ignites"),
("Spark","Sponge","B","ignites"),("Spark","Water","X","extinguished"),
("Spark","Steam","X","extinguished"),("Spark","Rain","X","extinguished"),
("Spark","Foam","X","smothered"),("Spark","Sand","X","smothered"),
("Spark","Lava","R","merges"),("Spark","Plasma","R","merges"),
("Spark","Lightning","R","merges"),("Spark","Molten Metal","R","merges"),
# acid
("Acid","Stone","D","etched away"),("Acid","Metal","D","corroded"),
("Acid","Sand","D","dissolved"),("Acid","Wood","D","eaten through"),
("Acid","Clay","D","dissolved"),("Acid","Soil","D","dissolved"),
("Acid","Gravel","D","dissolved"),("Acid","Lead","D","corroded"),
("Acid","Iron Ore","D","corroded"),("Acid","Rust","D","dissolved"),
("Acid","Quicklime","R","violent fizz"),("Acid","Alkali","R","neutralised"),
("Acid","Sulphur","R","toxic gas"),("Acid","Ice","M","melts it"),
("Acid","Snow","M","melts it"),("Acid","Frost","M","melts it"),
("Acid","Glass","." ,"etches only"),("Acid","Obsidian","." ,"resists acid"),
("Acid","Gold","." ,"resists acid"),("Acid","Slag","." ,"resists acid"),
("Acid","Bedrock","." ,"nothing affects bedrock"),("Acid","Crystal","D","slowly dissolves"),
("Acid","Phosphor","B","ignites"),("Acid","Water","R","diluted"),
("Acid","Salt","R","fizzes, salt breaks down"),("Acid","Toxic Gas","R","thickens"),
("Acid","Foam","R","breaks down"),("Acid","Steam","R","acid mist"),
("Acid","Mercury","R","slow attack"),("Acid","Sponge","R","soaks then eats"),
("Acid","Gunpowder","R","fizzes, spoils"),("Acid","Glow Dust","." ,"no reaction"),
("Acid","Rain","R","diluted"),("Acid","Cloud","R","acid rain"),
# alkali
("Alkali","Metal","D","attacks the metal"),("Alkali","Lead","D","attacks the metal"),
("Alkali","Gold","." ,"no reaction"),("Alkali","Acid","R","neutralised"),
("Alkali","Water","R","heats up"),("Alkali","Ice","M","melts it"),
("Alkali","Snow","M","melts it"),("Alkali","Glass","D","etches it"),
("Alkali","Clay","R","softens"),("Alkali","Sulphur","R","warm stink"),
("Alkali","Foam","R","breaks down"),("Alkali","Stone","." ,"slow attack"),
("Alkali","Crystal","D","dissolves"),("Alkali","Toxic Gas","R","absorbed"),
("Alkali","Iron Ore","D","corroded"),("Alkali","Bedrock","." ,"nothing affects bedrock"),
# oil
("Oil","Water","^","floats"),("Oil","Lava","B","ignites"),
("Oil","Fire","B","ignites"),("Oil","Spark","B","ignites"),
("Oil","Plasma","B","ignites"),("Oil","Lightning","B","ignites"),
("Oil","Molten Metal","B","ignites"),("Oil","Tar","R","mixes thick"),
("Oil","Mercury","^","mercury sinks"),("Oil","Acid","R","sludge"),
("Oil","Sand","R","soaks, sticks"),("Oil","Soil","R","soaked earth"),
("Oil","Sponge","R","absorbed"),("Oil","Foam","R","absorbed"),
("Oil","Steam","^","rides on the steam"),("Oil","Phosphor","B","ignites"),
("Oil","Coal","B","ignites"),("Oil","Wood","R","soaks, burns hotter"),
("Oil","Gunpowder","X","spoils it"),("Oil","Dry Ice","R","chills, thickens"),
# mercury
("Mercury","Gold","R","amalgam, gold dissolves"),("Mercury","Metal","R","amalgam"),
("Mercury","Lead","R","amalgam"),("Mercury","Iron Ore","R","amalgam"),
("Mercury","Water","^","sinks"),("Mercury","Oil","^","sinks"),
("Mercury","Tar","^","sinks"),("Mercury","Lava","R","vaporises"),
("Mercury","Lightning","R","conducts"),("Mercury","Plasma","R","vaporises"),
("Mercury","Acid","R","slow attack"),("Mercury","Bedrock","." ,"nothing affects bedrock"),
("Mercury","Dry Ice","F","freezes solid"),("Mercury","Frost","F","freezes solid"),
("Mercury","Ice","F","freezes solid"),("Mercury","Sulphur","R","amalgam paste"),
# tar
("Tar","Water","^","sinks"),("Tar","Lava","B","roaring fire"),
("Tar","Fire","B","burns"),("Tar","Spark","B","burns"),
("Tar","Plasma","B","burns"),("Tar","Lightning","B","burns"),
("Tar","Oil","R","mixes"),("Tar","Sand","R","sticky clumps"),
("Tar","Sponge","R","clogs the sponge"),("Tar","Gravel","R","binds the gravel"),
("Tar","Soil","R","binds the soil"),("Tar","Foam","R","clogs it"),
("Tar","Molten Metal","B","ignites"),("Tar","Dry Ice","F","brittle, cracks"),
("Tar","Frost","F","brittle, cracks"),("Tar","Ice","F","brittle, cracks"),
# steam
("Steam","Ice","R","condenses to water"),("Steam","Snow","R","melts it to water"),
("Steam","Frost","R","condenses"),("Steam","Cloud","R","joins the cloud"),
("Steam","Metal","R","condenses on cold metal"),("Steam","Glass","R","fogs it"),
("Steam","Salt","D","dissolves salt"),("Steam","Plasma","R","superheated"),
("Steam","Fire","X","smothered"),("Steam","Lava","R","superheated"),
("Steam","Acid","R","acid mist"),("Steam","Dry Ice","R","thick fog"),
("Steam","Gunpowder","X","damps it"),("Steam","Bomb","X","damps it"),
("Steam","Hydrogen","^","carries it up"),("Steam","Toxic Gas","R","spreads it"),
("Steam","Phosphor","X","quenched"),("Steam","Iron Ore","R","rusts it"),
# cloud
("Cloud","Lightning","R","storm, lightning forms"),("Cloud","Rain","R","heavier rain"),
("Cloud","Frost","R","snow"),("Cloud","Snow","R","snow"),
("Cloud","Fire","X","burned off"),("Cloud","Lava","X","burned off"),
("Cloud","Toxic Gas","R","acid rain"),("Cloud","Plasma","X","burned off"),
("Cloud","Steam","R","grows"),("Cloud","Soil","R","rains on it, mud"),
("Cloud","Sand","R","rains on it"),("Cloud","Salt","D","rains, dissolves salt"),
("Cloud","Metal","R","rains, rusts it"),("Cloud","Clay","R","rains, softens"),
("Cloud","Foam","R","rains on it"),
# rain
("Rain","Fire","X","puts out"),("Rain","Lava","R","obsidian + steam"),
("Rain","Snow","R","melts the snow"),("Rain","Ice","F","freezes"),
("Rain","Frost","F","freezes"),("Rain","Soil","R","mud"),
("Rain","Clay","R","softens"),("Rain","Salt","D","dissolves"),
("Rain","Metal","R","rusts"),("Rain","Gunpowder","X","ruined"),
("Rain","Cloud","R","joins"),("Rain","Plasma","X","steam"),
("Rain","Sand","R","packs wet"),("Rain","Gravel","R","packs wet"),
("Rain","Foam","R","absorbs"),("Rain","Bomb","X","dud"),
("Rain","Quicklime","R","hissing heat"),("Rain","Phosphor","X","quenched"),
("Rain","Steam","R","joins"),("Rain","Toxic Gas","X","washed out"),
# frost
("Frost","Water","F","freezes it"),("Frost","Steam","R","condenses"),
("Frost","Ice","R","thickens the ice"),("Frost","Snow","R","packs it"),
("Frost","Fire","M","melts"),("Frost","Lava","R","steam"),
("Frost","Metal","R","coats in ice"),("Frost","Glass","R","crystals on the glass"),
("Frost","Acid","M","melts"),("Frost","Alkali","M","melts"),
("Frost","Phosphor","X","chilled, dims"),("Frost","Soil","R","frozen crust"),
("Frost","Sand","R","frozen crust"),("Frost","Clay","R","frozen solid"),
("Frost","Rain","F","freezes"),("Frost","Oil","F","thickens"),
("Frost","Dry Ice","R","more frost"),("Frost","Gravel","R","frosts it"),
# lightning
("Lightning","Sand","R","fulgurite glass"),("Lightning","Glass","X","shatters"),
("Lightning","Stone","X","shatters"),("Lightning","Ice","X","shatters"),
("Lightning","Wood","B","splinters, burns"),("Lightning","Coal","B","ignites"),
("Lightning","Sulphur","B","ignites"),("Lightning","Metal","R","conducts, arcs"),
("Lightning","Water","R","conducts"),("Lightning","Mercury","R","conducts"),
("Lightning","Iron Ore","R","conducts"),("Lightning","Gold","R","conducts"),
("Lightning","Lead","R","conducts"),("Lightning","Gunpowder","X","explodes"),
("Lightning","Bomb","X","detonates"),("Lightning","Hydrogen","X","detonates"),
("Lightning","Crystal","X","shatters"),("Lightning","Clay","R","fused to brick"),
("Lightning","Soil","R","fused crust"),("Lightning","Glow Dust","R","flares bright"),
("Lightning","Obsidian","X","shatters"),("Lightning","Gravel","R","fused crust"),
("Lightning","Rust","R","fused"),("Lightning","Thermite","R","molten iron"),
("Lightning","Oil","B","ignites"),("Lightning","Tar","B","ignites"),
("Lightning","Foam","." ,"insulated"),("Lightning","Bedrock","." ,"nothing affects bedrock"),
("Lightning","Slag","." ,"inert"),("Lightning","Salt","R","fused"),
# plasma
("Plasma","Metal","M","melts"),("Plasma","Glass","M","melts"),
("Plasma","Stone","M","melts"),("Plasma","Sand","R","molten glass"),
("Plasma","Ice","M","sublimates"),("Plasma","Water","X","flashes to steam"),
("Plasma","Oil","B","ignites"),("Plasma","Wood","B","ignites"),
("Plasma","Coal","B","ignites"),("Plasma","Sulphur","B","ignites"),
("Plasma","Tar","B","ignites"),("Plasma","Gunpowder","X","detonates"),
("Plasma","Bomb","X","detonates"),("Plasma","Hydrogen","X","detonates"),
("Plasma","Thermite","R","molten iron"),("Plasma","Crystal","M","melts"),
("Plasma","Obsidian","M","melts"),("Plasma","Gold","M","melts"),
("Plasma","Lead","M","melts"),("Plasma","Mercury","R","vaporises"),
("Plasma","Slag","M","melts"),("Plasma","Steam","R","superheats"),
("Plasma","Phosphor","B","flares"),("Plasma","Clay","R","vitrified"),
("Plasma","Soil","R","vitrified"),("Plasma","Gravel","M","melts"),
("Plasma","Rust","M","melts"),("Plasma","Iron Ore","R","smelts"),
("Plasma","Snow","M","sublimates"),("Plasma","Frost","M","sublimates"),
("Plasma","Salt","M","melts"),("Plasma","Foam","R","pops"),
("Plasma","Glow Dust","R","flares bright"),("Plasma","Bedrock","." ,"nothing affects bedrock"),
# toxic gas
("Toxic Gas","Fire","X","smothers"),("Toxic Gas","Metal","D","corrodes"),
("Toxic Gas","Iron Ore","D","corrodes"),("Toxic Gas","Rust","D","corrodes"),
("Toxic Gas","Acid","R","thickens"),("Toxic Gas","Alkali","R","absorbed"),
("Toxic Gas","Water","X","absorbed"),("Toxic Gas","Foam","X","absorbed"),
("Toxic Gas","Cloud","R","acid rain"),("Toxic Gas","Phosphor","X","smothered"),
("Toxic Gas","Glow Dust","." ,"no reaction"),("Toxic Gas","Lead","D","corrodes"),
("Toxic Gas","Sponge","R","soaks it up"),("Toxic Gas","Bedrock","." ,"nothing affects bedrock"),
# molten metal
("Molten Metal","Ice","M","melts it, steam"),("Molten Metal","Snow","M","melts it"),
("Molten Metal","Water","X","steam + metal"),("Molten Metal","Glass","M","fuses"),
("Molten Metal","Metal","R","welds together"),("Molten Metal","Gold","R","alloys"),
("Molten Metal","Lead","R","alloys"),("Molten Metal","Iron Ore","R","smelts it"),
("Molten Metal","Sand","R","molten glass"),("Molten Metal","Stone","M","melts"),
("Molten Metal","Thermite","B","feeds it"),("Molten Metal","Oil","B","ignites"),
("Molten Metal","Wood","B","ignites"),("Molten Metal","Coal","B","ignites"),
("Molten Metal","Gunpowder","X","detonates"),("Molten Metal","Bomb","X","detonates"),
("Molten Metal","Hydrogen","X","detonates"),("Molten Metal","Crystal","M","melts"),
("Molten Metal","Obsidian","M","melts"),("Molten Metal","Slag","R","merges with slag"),
("Molten Metal","Clay","R","bakes"),("Molten Metal","Sulphur","B","ignites"),
("Molten Metal","Tar","B","ignites"),("Molten Metal","Phosphor","B","flares"),
("Molten Metal","Rust","R","melts back to iron"),("Molten Metal","Soil","R","bakes"),
("Molten Metal","Gravel","M","melts"),("Molten Metal","Salt","R","molten salt"),
("Molten Metal","Plasma","R","merges"),("Molten Metal","Lightning","R","arcing"),
("Molten Metal","Mercury","R","amalgam"),("Molten Metal","Bedrock","." ,"nothing affects bedrock"),
# phosphor
("Phosphor","Water","X","quenched"),("Phosphor","Steam","X","quenched"),
("Phosphor","Foam","X","smothered"),("Phosphor","Sand","X","smothered"),
("Phosphor","Salt","X","smothered"),("Phosphor","Ice","X","chilled"),
("Phosphor","Snow","X","chilled"),("Phosphor","Dry Ice","X","chilled"),
("Phosphor","Acid","B","ignites"),("Phosphor","Toxic Gas","X","smothered"),
("Phosphor","Coal","B","burns together"),("Phosphor","Sulphur","B","burns together"),
# foam
("Foam","Fire","X","smothers"),("Foam","Lava","R","pops, spits"),
("Foam","Plasma","R","pops"),("Foam","Oil","R","absorbed"),
("Foam","Water","R","absorbs"),("Foam","Acid","R","breaks down"),
("Foam","Alkali","R","breaks down"),("Foam","Toxic Gas","X","absorbs"),
("Foam","Metal","R","clings"),("Foam","Wood","R","clings"),
("Foam","Ice","R","insulates"),("Foam","Steam","R","absorbs"),
("Foam","Cloud","R","absorbs"),("Foam","Rain","R","absorbs"),
("Foam","Snow","R","insulates"),("Foam","Frost","R","insulates"),
("Foam","Molten Metal","X","pops, spits"),("Foam","Spark","X","smothered"),
("Foam","Gunpowder","X","ruined"),("Foam","Bomb","X","dud"),
# bomb
("Bomb","Stone","X","shatters to gravel"),("Bomb","Glass","X","shatters"),
("Bomb","Ice","X","shatters"),("Bomb","Metal","X","blasts apart"),
("Bomb","Wood","X","splinters"),("Bomb","Clay","X","shatters"),
("Bomb","Crystal","X","shatters"),("Bomb","Obsidian","X","shatters"),
("Bomb","Coal","X","scatters, ignites"),("Bomb","Sand","X","scatters"),
("Bomb","Gravel","X","scatters"),("Bomb","Soil","X","scatters"),
("Bomb","Salt","X","scatters"),("Bomb","Gunpowder","X","chain explosion"),
("Bomb","Hydrogen","X","chain explosion"),("Bomb","Water","X","duds"),
("Bomb","Foam","X","duds"),("Bomb","Bedrock","." ,"nothing affects bedrock"),
("Bomb","Lead","X","blasts apart"),("Bomb","Gold","X","blasts apart"),
("Bomb","Rust","X","scatters"),("Bomb","Slag","X","scatters"),
("Bomb","Thermite","X","ignites"),("Bomb","Quicklime","X","dust cloud"),
("Bomb","Dry Ice","X","blasts apart"),("Bomb","Toxic Gas","X","disperses"),
("Bomb","Mercury","X","scatters"),("Bomb","Tar","X","ignites"),
("Bomb","Oil","X","ignites"),("Bomb","Lava","X","spatters"),
("Bomb","Plasma","X","detonates"),("Bomb","Lightning","X","detonates"),
("Bomb","Molten Metal","X","spatters"),("Bomb","Phosphor","X","scatters, ignites"),
("Bomb","Glow Dust","X","scatters, glows"),("Bomb","Sponge","X","shreds"),
("Bomb","Iron Ore","X","shatters"),("Bomb","Sulphur","X","scatters, ignites"),
("Bomb","Snow","X","scatters"),("Bomb","Steam","X","damps it"),
# hydrogen
("Hydrogen","Fire","X","fireball"),("Hydrogen","Spark","X","fireball"),
("Hydrogen","Plasma","X","fireball"),("Hydrogen","Lightning","X","fireball"),
("Hydrogen","Lava","X","fireball"),("Hydrogen","Steam","^","rises"),
("Hydrogen","Cloud","^","rises"),("Hydrogen","Water","^","escapes"),
("Hydrogen","Metal","R","embrittles it"),("Hydrogen","Iron Ore","R","reduces the ore"),
("Hydrogen","Bedrock","." ,"nothing affects bedrock"),("Hydrogen","Bomb","X","chain blast"),
("Hydrogen","Gunpowder","X","chain blast"),("Hydrogen","Thermite","X","fireball"),
("Hydrogen","Molten Metal","X","fireball"),("Hydrogen","Toxic Gas","^","mixes"),
("Hydrogen","Foam","X","absorbed"),("Hydrogen","Slag","." ,"inert"),
# thermite
("Thermite","Fire","R","molten iron"),("Thermite","Spark","R","molten iron"),
("Thermite","Lava","B","white-hot"),("Thermite","Plasma","R","molten iron"),
("Thermite","Metal","R","burns straight through"),("Thermite","Iron Ore","R","molten iron"),
("Thermite","Glass","M","melts through"),("Thermite","Stone","M","melts through"),
("Thermite","Ice","M","melts it"),("Thermite","Snow","M","melts it"),
("Thermite","Water","X","doused"),("Thermite","Sand","X","smothered"),
("Thermite","Bedrock","." ,"nothing affects bedrock"),("Thermite","Coal","B","ignites"),
("Thermite","Oil","B","ignites"),("Thermite","Wood","B","ignites"),
("Thermite","Sulphur","B","ignites"),("Thermite","Tar","B","ignites"),
("Thermite","Clay","R","bakes"),("Thermite","Crystal","M","melts"),
("Thermite","Obsidian","M","melts slowly"),("Thermite","Gold","M","melts"),
("Thermite","Lead","M","melts"),("Thermite","Mercury","R","vaporises"),
("Thermite","Slag","M","melts"),("Thermite","Quicklime","R","bakes"),
("Thermite","Dry Ice","R","steam burst"),("Thermite","Foam","X","doused"),
("Thermite","Molten Metal","B","feeds it"),("Thermite","Lightning","R","molten iron"),
("Thermite","Rust","R","molten iron"),("Thermite","Gravel","M","melts"),
# crystal
("Crystal","Salt","R","grows in salt"),("Crystal","Water","R","slow growth"),
("Crystal","Steam","R","grows on it"),("Crystal","Acid","D","dissolves"),
("Crystal","Alkali","D","dissolves"),("Crystal","Lightning","X","shatters"),
("Crystal","Bomb","X","shatters"),("Crystal","Lava","M","melts"),
("Crystal","Fire","." ,"too little heat"),("Crystal","Plasma","M","melts"),
("Crystal","Stone","R","grows on the surface"),("Crystal","Glass","R","grows on the glass"),
("Crystal","Sand","R","grows between the grains"),("Crystal","Dry Ice","X","cold stress, shatters"),
("Crystal","Frost","R","frost crystals join"),("Crystal","Ice","R","joins the ice"),
("Crystal","Rain","R","grows"),("Crystal","Metal","." ,"no reaction"),
("Crystal","Gold","." ,"no reaction"),("Crystal","Clay","." ,"no reaction"),
("Crystal","Obsidian","." ,"no reaction"),("Crystal","Bedrock","." ,"nothing affects bedrock"),
("Crystal","Glow Dust","R","grows around the dust"),("Crystal","Mercury","." ,"no reaction"),
# obsidian
("Obsidian","Acid","." ,"resists acid"),("Obsidian","Lava","M","melts slowly"),
("Obsidian","Plasma","M","melts"),("Obsidian","Bomb","X","shatters sharp"),
("Obsidian","Lightning","X","shatters"),("Obsidian","Water","." ,"no reaction"),
("Obsidian","Stone","." ,"no reaction"),("Obsidian","Bedrock","." ,"nothing affects bedrock"),
("Obsidian","Fire","." ,"too little heat"),("Obsidian","Crystal","." ,"no reaction"),
# quicklime
("Quicklime","Water","R","hissing heat"),("Quicklime","Steam","R","sets hard"),
("Quicklime","Rain","R","hissing heat"),("Quicklime","Acid","R","violent fizz"),
("Quicklime","Fire","R","bakes"),("Quicklime","Soil","R","sets like cement"),
("Quicklime","Sand","R","mortar mix"),("Quicklime","Gravel","R","mortar mix"),
("Quicklime","Ice","R","melts it, heat"),("Quicklime","Snow","R","melts it, heat"),
("Quicklime","Bedrock","." ,"nothing affects bedrock"),("Quicklime","Foam","R","breaks down"),
("Quicklime","Clay","R","cement"),("Quicklime","Bomb","X","dust cloud"),
("Quicklime","Alkali","R","sets"),("Quicklime","Toxic Gas","R","absorbs it"),
("Quicklime","Frost","R","melts it, heat"),("Quicklime","Cloud","R","absorbs"),
# dry ice
("Dry Ice","Water","R","rolling fog"),("Dry Ice","Steam","R","thick fog"),
("Dry Ice","Cloud","R","heavy fog"),("Dry Ice","Fire","X","kills the flame"),
("Dry Ice","Lava","R","violent steam burst"),("Dry Ice","Metal","R","frosts it over"),
("Dry Ice","Glass","R","frosts it"),("Dry Ice","Oil","R","chills, thickens"),
("Dry Ice","Frost","R","more frost"),("Dry Ice","Ice","R","chills it"),
("Dry Ice","Sand","R","frosts it"),("Dry Ice","Soil","R","frozen ground"),
("Dry Ice","Stone","R","frosts it"),("Dry Ice","Crystal","X","cold stress, shatters"),
("Dry Ice","Thermite","R","steam burst"),("Dry Ice","Mercury","F","freezes solid"),
("Dry Ice","Sponge","R","frosts it"),("Dry Ice","Salt","R","chills it"),
("Dry Ice","Bedrock","." ,"nothing affects bedrock"),("Dry Ice","Gold","." ,"no reaction"),
("Dry Ice","Rain","F","freezes"),("Dry Ice","Plasma","R","explosive sublimation"),
# gold
("Gold","Mercury","R","amalgam"),("Gold","Lava","M","melts"),
("Gold","Plasma","M","melts"),("Gold","Acid","." ,"resists acid"),
("Gold","Alkali","." ,"no reaction"),("Gold","Water","." ,"no reaction"),
("Gold","Bedrock","." ,"nothing affects bedrock"),("Gold","Metal","R","alloys"),
("Gold","Lead","R","alloys"),("Gold","Molten Metal","R","alloys"),
("Gold","Thermite","M","melts"),("Gold","Lightning","R","conducts"),
("Gold","Salt","." ,"no reaction"),("Gold","Sulphur","." ,"no reaction"),
("Gold","Rust","." ,"no reaction"),("Gold","Slag","." ,"no reaction"),
# lead
("Lead","Lava","M","melts"),("Lead","Plasma","M","melts"),
("Lead","Acid","D","corroded"),("Lead","Alkali","D","attacked"),
("Lead","Mercury","R","amalgam"),("Lead","Molten Metal","R","alloys"),
("Lead","Metal","R","alloys"),("Lead","Thermite","M","melts"),
("Lead","Lightning","R","conducts"),("Lead","Salt","D","pits the metal"),
("Lead","Water","R","slowly corrodes"),("Lead","Steam","R","corrodes"),
("Lead","Sulphur","D","tarnishes"),
# iron ore
("Iron Ore","Lava","R","smelts to molten metal"),("Iron Ore","Fire","." ,"too little heat"),
("Iron Ore","Plasma","R","smelts"),("Iron Ore","Coal","R","reduces the ore"),
("Iron Ore","Acid","D","corroded"),("Iron Ore","Water","R","rusts"),
("Iron Ore","Steam","R","rusts"),("Iron Ore","Metal","R","welds"),
("Iron Ore","Hydrogen","R","reduces the ore"),("Iron Ore","Thermite","R","molten iron"),
("Iron Ore","Lightning","R","conducts"),("Iron Ore","Molten Metal","R","smelts"),
("Iron Ore","Salt","D","pits the ore"),
# rust
("Rust","Acid","D","dissolved"),("Rust","Lava","M","melts back to iron"),
("Rust","Plasma","M","melts"),("Rust","Metal","R","spreads the rust"),
("Rust","Water","R","spreads"),("Rust","Coal","R","reduces it in the fire"),
("Rust","Thermite","R","molten iron"),("Rust","Molten Metal","R","melts back to iron"),
("Rust","Salt","D","dissolves"),("Rust","Lightning","R","fused"),
# slag
("Slag","Lava","M","melts"),("Slag","Plasma","M","melts"),
("Slag","Acid","." ,"resists acid"),("Slag","Water","." ,"no reaction"),
("Slag","Molten Metal","R","merges"),("Slag","Bedrock","." ,"nothing affects bedrock"),
("Slag","Lightning","." ,"inert"),("Slag","Bomb","X","scatters"),
("Slag","Thermite","M","melts"),
# sulphur
("Sulphur","Fire","B","burns blue"),("Sulphur","Spark","B","burns blue"),
("Sulphur","Lava","B","burns blue"),("Sulphur","Plasma","B","burns blue"),
("Sulphur","Acid","R","toxic gas"),("Sulphur","Alkali","R","warm stink"),
("Sulphur","Metal","D","tarnishes it"),("Sulphur","Lightning","B","ignites"),
("Sulphur","Water","." ,"no reaction"),("Sulphur","Molten Metal","B","ignites"),
("Sulphur","Iron Ore","D","tarnishes"),
# structure extras
("Stone","Acid","D","etched"),("Stone","Lava","M","melts"),
("Stone","Plasma","M","melts"),("Stone","Bomb","X","shatters to gravel"),
("Stone","Lightning","X","shatters"),("Stone","Gravel","R","piles together"),
("Stone","Sand","R","piles together"),("Stone","Metal","." ,"no reaction"),
("Stone","Glass","." ,"no reaction"),("Stone","Crystal","R","crystals grow on it"),
("Stone","Ice","." ,"no reaction"),("Stone","Clay","." ,"no reaction"),
("Bedrock","Acid","." ,"nothing affects bedrock"),("Bedrock","Lava","." ,"nothing affects bedrock"),
("Bedrock","Plasma","." ,"nothing affects bedrock"),("Bedrock","Bomb","." ,"nothing affects bedrock"),
("Bedrock","Lightning","." ,"nothing affects bedrock"),
("Ice","Salt","M","melts it"),("Ice","Fire","M","melts"),
("Ice","Lava","R","steam + stone"),("Ice","Steam","R","condenses"),
("Ice","Plasma","M","sublimates"),("Ice","Bomb","X","shatters"),
("Ice","Lightning","X","shatters"),('Ice','Water', "^" , "floats"),
("Ice","Acid","M","melts"),("Ice","Alkali","M","melts"),
("Ice","Stone","." ,"no reaction"),("Ice","Metal","." ,"no reaction"),
("Ice","Clay","." ,"no reaction"),("Ice","Snow","R","packs together"),
("Ice","Frost","R","thickens"),
("Glass","Bomb","X","shatters"),("Glass","Lightning","X","shatters"),
("Glass","Lava","M","melts"),("Glass","Plasma","M","melts"),
("Glass","Sand","R","sand fuses back"),("Glass","Acid","." ,"etches only"),
("Glass","Alkali","D","etches it"),("Glass","Crystal","R","crystals grow on it"),
("Glass","Metal","." ,"no reaction"),("Glass","Stone","." ,"no reaction"),
("Metal","Acid","D","corroded"),("Metal","Lava","M","melts"),
("Metal","Plasma","M","melts"),("Metal","Water","R","rusts"),
("Metal","Steam","R","rusts"),("Metal","Lightning","R","conducts"),
("Metal","Mercury","R","amalgam"),("Metal","Salt","D","salt pits the metal"),
("Metal","Thermite","R","burned through"),("Metal","Molten Metal","R","welds"),
("Metal","Iron Ore","R","welds"),("Metal","Gold","R","alloys"),
("Metal","Lead","R","alloys"),("Metal","Sulphur","D","tarnishes"),
("Metal","Stone","." ,"no reaction"),("Metal","Clay","." ,"no reaction"),
("Wood","Fire","B","burns"),("Wood","Lava","B","burns"),
("Wood","Plasma","B","burns"),("Wood","Spark","B","ignites"),
("Wood","Lightning","B","splinters, burns"),("Wood","Acid","D","eaten through"),
("Wood","Water","R","soaks"),("Wood","Oil","R","soaks, burns hotter"),
("Wood","Tar","R","coated, burns hot"),("Wood","Coal","B","burns together"),
("Wood","Gunpowder","X","blast"),("Wood","Bomb","X","splinters"),
("Wood","Molten Metal","B","ignites"),("Wood","Sulphur","B","burns together"),
("Wood","Thermite","B","ignites"),("Wood","Alkali","D","eaten through"),
("Wood","Stone","." ,"no reaction"),("Wood","Metal","." ,"no reaction"),
("Sponge","Water","R","soaked"),("Sponge","Oil","R","soaked"),
("Sponge","Acid","R","soaks, then dissolves"),("Sponge","Alkali","R","soaks"),
("Sponge","Fire","B","dries then burns"),("Sponge","Lava","B","burns away"),
("Sponge","Tar","R","clogged"),("Sponge","Mercury","R","soaks the mercury"),
("Sponge","Gunpowder","R","soaks up powder"),("Sponge","Bomb","X","shreds"),
("Sponge","Molten Metal","B","burns away"),("Sponge","Sulphur","R","soaks it"),
("Clay","Water","R","softens to mud"),("Clay","Fire","R","bakes to brick"),
("Clay","Lava","R","baked brick"),("Clay","Acid","D","dissolved"),
("Clay","Bomb","X","shatters"),("Clay","Lightning","R","fused to brick"),
("Clay","Soil","R","mixes to mud"),("Clay","Sand","R","mixes to mud"),
("Clay","Alkali","R","softens"),("Clay","Molten Metal","R","bakes"),
("Clay","Plasma","R","vitrified"),("Clay","Thermite","R","bakes"),
("Clay","Crystal","." ,"no reaction"),("Clay","Metal","." ,"no reaction"),
("Sand","Lava","R","molten glass"),("Sand","Plasma","R","molten glass"),
("Sand","Lightning","R","fulgurite glass"),("Sand","Acid","D","dissolved"),
("Sand","Fire","X","smothers"),("Sand","Water","R","packs wet"),
("Sand","Bomb","X","scatters"),("Sand","Glass","R","fuses to glass"),
("Sand","Quicklime","R","mortar"),("Sand","Soil","R","mixes"),
("Sand","Clay","R","mixes to mud"),("Sand","Stone","R","piles together"),
("Sand","Gravel","R","piles together"),("Sand","Salt","R","mixes"),
("Sand","Molten Metal","R","molten glass"),("Sand","Dry Ice","R","frosts it"),
("Sand","Steam","." ,"no reaction"),("Sand","Metal","." ,"no reaction"),
("Salt","Water","D","dissolves"),("Salt","Ice","M","melts it"),
("Salt","Fire","X","smothers"),("Salt","Lava","R","molten salt"),
("Salt","Plasma","M","melts"),("Salt","Acid","R","fizzes"),
("Salt","Metal","D","pits the metal"),("Salt","Crystal","R","crystal grows"),
("Salt","Steam","D","dissolves"),("Salt","Molten Metal","R","molten salt"),
("Salt","Sand","R","mixes"),("Salt","Soil","R","salts the soil"),
("Salt","Bomb","X","scatters"),("Salt","Lightning","R","fused"),
("Salt","Gold","." ,"no reaction"),("Salt","Glass","." ,"no reaction"),
("Gravel","Lava","M","melts"),("Gravel","Plasma","M","melts"),
("Gravel","Acid","D","dissolved"),("Gravel","Bomb","X","scatters"),
("Gravel","Fire","X","smothers"),("Gravel","Stone","R","piles together"),
("Gravel","Sand","R","piles together"),("Gravel","Water","R","packs wet"),
("Gravel","Molten Metal","M","melts"),("Gravel","Lightning","R","fused crust"),
("Gravel","Frost","R","frosts it"),("Gravel","Tar","R","binds it"),
("Soil","Water","R","mud"),("Soil","Fire","R","baked crust"),
("Soil","Lava","R","baked crust"),("Soil","Acid","D","dissolved"),
("Soil","Lightning","R","fused crust"),("Soil","Bomb","X","scatters"),
("Soil","Clay","R","mixes"),("Soil","Sand","R","mixes"),
("Soil","Molten Metal","R","bakes"),("Soil","Plasma","R","vitrified"),
("Soil","Quicklime","R","sets like cement"),("Soil","Salt","R","salts it"),
("Soil","Tar","R","binds it"),("Soil","Rain","R","mud"),
("Gunpowder","Fire","X","explodes"),("Gunpowder","Spark","X","explodes"),
("Gunpowder","Lava","X","explodes"),("Gunpowder","Plasma","X","explodes"),
("Gunpowder","Lightning","X","explodes"),("Gunpowder","Molten Metal","X","explodes"),
("Gunpowder","Water","X","ruined"),("Gunpowder","Rain","X","ruined"),
("Gunpowder","Foam","X","ruined"),("Gunpowder","Bomb","X","chain blast"),
("Gunpowder","Hydrogen","X","chain blast"),("Gunpowder","Acid","R","fizzes, spoils"),
("Gunpowder","Thermite","B","ignites"),("Gunpowder","Steam","X","damps it"),
("Gunpowder","Oil","X","spoils it"),("Gunpowder","Sponge","R","soaks it up"),
("Gunpowder","Sand","X","smothers"),("Gunpowder","Soil","X","smothers"),
("Snow","Fire","M","melts"),("Snow","Lava","R","steam + stone"),
("Snow","Plasma","M","sublimates"),("Snow","Water","F","freezes"),
("Snow","Salt","M","melts"),("Snow","Acid","M","melts"),
("Snow","Alkali","M","melts"),("Snow","Steam","R","melts"),
("Snow","Bomb","X","scatters"),("Snow","Metal","R","chills it"),
("Snow","Ice","R","packs to ice"),("Snow","Soil","R","melts to wet soil"),
("Snow","Sand","R","melts to wet sand"),("Snow","Gravel","R","melts to wet gravel"),
("Snow","Frost","R","packs"),("Snow","Clay","R","melts to wet clay"),
("Coal","Fire","B","burns"),("Coal","Lava","B","ignites"),
("Coal","Plasma","B","ignites"),("Coal","Spark","B","ignites"),
("Coal","Lightning","B","ignites"),("Coal","Molten Metal","B","ignites"),
("Coal","Water","X","quenched"),("Coal","Bomb","X","scatters, ignites"),
("Coal","Iron Ore","R","reduces the ore"),("Coal","Rust","R","reduces it"),
("Coal","Wood","B","burns together"),("Coal","Sulphur","B","burns together"),
("Coal","Oil","B","ignites"),("Coal","Tar","B","ignites"),
("Coal","Thermite","B","ignites"),("Coal","Steam","X","damps it"),
("Glow Dust","Water","." ,"no reaction"),("Glow Dust","Bedrock","." ,"nothing affects bedrock"),
("Glow Dust","Lightning","R","flares bright"),("Glow Dust","Plasma","R","flares bright"),
("Glow Dust","Fire","R","glows hotter"),("Glow Dust","Lava","R","glows hotter"),
("Glow Dust","Bomb","X","scatters, glows"),("Glow Dust","Crystal","R","grows around it"),
("Glow Dust","Acid","." ,"no reaction"),("Glow Dust","Stone","." ,"no reaction"),
("Glow Dust","Glass","." ,"no reaction"),("Glow Dust","Metal","." ,"no reaction"),
("Glow Dust","Sand","R","mixes into the sand"),
("Cloud","Bedrock","." ,"no reaction"),("Cloud","Stone","." ,"no reaction"),
("Rain","Bedrock","." ,"no reaction"),("Rain","Glass","." ,"no reaction"),
("Rain","Gold","." ,"no reaction"),("Rain","Slag","." ,"no reaction"),
("Rain","Obsidian","." ,"no reaction"),("Rain","Rust","R","spreads the rust"),
("Steam","Bedrock","." ,"no reaction"),("Steam","Gold","." ,"no reaction"),
("Steam","Slag","." ,"no reaction"),("Steam","Obsidian","." ,"no reaction"),
("Steam","Glass","R","fogs it"),("Steam","Crystal","R","grows on it"),
("Steam","Clay","R","softens"),("Steam","Soil","R","dampens"),
("Steam","Sand","." ,"no reaction"),("Steam","Gravel","." ,"no reaction"),
("Toxic Gas","Sand","." ,"no reaction"),("Toxic Gas","Gravel","." ,"no reaction"),
("Toxic Gas","Stone","." ,"no reaction"),("Toxic Gas","Glass","." ,"no reaction"),
("Toxic Gas","Clay","." ,"no reaction"),("Toxic Gas","Soil","." ,"no reaction"),
("Toxic Gas","Gold","." ,"no reaction"),("Toxic Gas","Crystal","." ,"no reaction"),
("Toxic Gas","Sulphur","R","thickens"),("Toxic Gas","Tar","R","absorbed"),
("Toxic Gas","Ice","R","condenses on it"),("Toxic Gas","Snow","R","condenses on it"),
("Toxic Gas","Dry Ice","R","condenses on it"),("Toxic Gas","Molten Metal","X","burns it off"),
("Lightning","Plasma","R","arcing"),("Lightning","Spark","R","merges"),
("Lightning","Steam","R","charges the steam"),("Lightning","Cloud","R","storm"),
("Lightning","Rain","R","conducts"),("Lightning","Toxic Gas","R","sparks"),
("Lightning","Molten Metal","R","conducts"),("Lightning","Phosphor","B","ignites"),
("Lightning","Coal","B","ignites"),("Lightning","Sponge","B","ignites"),
("Lightning","Snow","X","shatters"),("Lightning","Frost","X","shatters"),
("Lightning","Dry Ice","X","shatters"),("Lightning","Quicklime","R","fused"),
("Plasma","Spark","R","merges"),("Plasma","Fire","R","merges"),
("Plasma","Lightning","R","merges"),("Plasma","Toxic Gas","X","burns it off"),
("Plasma","Cloud","X","burns it off"),("Plasma","Rain","X","steam"),
("Plasma","Quicklime","R","vitrified"),("Plasma","Dry Ice","R","explosive sublimation"),
("Plasma","Sponge","B","burns away"),("Plasma","Obsidian","M","melts"),
("Fire","Spark","R","merges"),("Wood","Toxic Gas",".","no reaction"),("Salt","Toxic Gas",".","no reaction"),("Phosphor","Gold",".","no reaction"),("Phosphor","Lead",".","no reaction"),("Phosphor","Stone","B","burns on the surface"),("Phosphor","Metal","B","burns on the surface"),
("Limestone","Acid","D","fizzes and dissolves"),("Limestone","Fire","R","bakes toward quicklime"),
("Limestone","Lava","R","burns to quicklime"),("Limestone","Plasma","R","burns to quicklime"),
("Limestone","Lightning","X","cracks and shatters"),("Limestone","Bomb","X","shatters"),
("Limestone","Rain","R","slowly weathers"),("Limestone","Water","R","slowly weathers"),
("Limestone","Steam","R","weathers it"),("Limestone","Cloud","R","rains on it"),
("Limestone","Crystal","R","crystals grow on it"),("Limestone","Clay","R","mortar mix"),
("Limestone","Sand","R","mortar mix"),("Limestone","Gravel","R","piles together"),
("Limestone","Stone","R","piles together"),("Limestone","Oil","R","stains it"),
("Limestone","Tar","R","binds it"),("Limestone","Gunpowder","X","blast"),
("Limestone","Quicklime","R","sets with it"),("Limestone","Dry Ice","R","frosts it"),
("Limestone","Frost","R","frosts it"),("Limestone","Wax","R","wax seals it"),
("Limestone","Thermite","M","melts"),("Limestone","Molten Metal","M","melts"),
("Limestone","Snow","R","frosts it"),("Limestone","Salt","R","salts the surface"),
("Limestone","Sulphur","R","stains it"),("Limestone","Iron Ore","." ,"no reaction"),
("Limestone","Gold","." ,"no reaction"),("Limestone","Rust","R","stains it"),
("Limestone","Obsidian","." ,"no reaction"),("Limestone","Bedrock","." ,"nothing affects bedrock"),
("Limestone","Ice","." ,"no reaction"),("Limestone","Glass","." ,"no reaction"),
("Limestone","Metal","." ,"no reaction"),("Limestone","Wood","." ,"no reaction"),
("Limestone","Sponge","." ,"no reaction"),("Limestone","Rubber","." ,"no reaction"),
("Limestone","Hydrogen","." ,"no reaction"),("Limestone","Foam","." ,"no reaction"),
("Limestone","Mercury","." ,"no reaction"),("Limestone","Alkali","." ,"no reaction"),
("Limestone","Coal","." ,"no reaction"),("Limestone","Spark","." ,"no reaction"),
("Limestone","Phosphor","." ,"no reaction"),("Limestone","Toxic Gas","." ,"no reaction"),
("Limestone","Molten Metal","M","melts"),

("Wax","Thermite","B","ignites"),("Wax","Water","^","floats"),("Wax","Rain","^","floats"),
("Wax","Oil","R","mixes"),("Wax","Tar","R","mixes"),("Wax","Alkali","R","turns to soap"),
("Wax","Frost","F","goes brittle"),("Wax","Dry Ice","F","goes brittle"),
("Wax","Ice","F","goes brittle"),("Wax","Snow","F","goes brittle"),
("Wax","Steam","R","softens"),("Wax","Acid","." ,"resists acid"),
("Wax","Mercury","^","floats"),("Wax","Limestone","R","seals it"),
("Wax","Rubber","." ,"no reaction"),("Wax","Gunpowder","." ,"no reaction"),
("Wax","Bomb","." ,"no reaction"),("Wax","Salt","." ,"no reaction"),
("Wax","Fire","B","burns"),("Wax","Lava","B","burns"),("Wax","Spark","B","ignites"),
("Wax","Plasma","B","burns"),("Wax","Lightning","B","ignites"),
("Wax","Molten Metal","B","burns"),("Wax","Phosphor","B","burns together"),
("Wax","Stone","." ,"no reaction"),("Wax","Bedrock","." ,"nothing affects bedrock"),
("Wax","Glass","." ,"no reaction"),("Wax","Metal","." ,"no reaction"),
("Wax","Wood","R","waterproofs it"),("Wax","Sponge","R","clogs the sponge"),
("Wax","Clay","." ,"no reaction"),("Wax","Sand","." ,"no reaction"),
("Wax","Gravel","." ,"no reaction"),("Wax","Soil","." ,"no reaction"),
("Wax","Snow","F","goes brittle"),("Wax","Coal","." ,"no reaction"),
("Wax","Cloud","." ,"no reaction"),("Wax","Toxic Gas","." ,"no reaction"),
("Wax","Foam","." ,"no reaction"),("Wax","Hydrogen","." ,"no reaction"),
("Wax","Crystal","." ,"no reaction"),("Wax","Obsidian","." ,"no reaction"),
("Wax","Quicklime","." ,"no reaction"),("Wax","Gold","." ,"no reaction"),
("Wax","Iron Ore","." ,"no reaction"),("Wax","Rust","." ,"no reaction"),
("Wax","Sulphur","." ,"no reaction"),("Wax","Alkali","R","turns to soap"),

("Rubber","Thermite","B","ignites"),("Rubber","Acid","R","slowly degrades"),
("Rubber","Alkali","R","degrades"),("Rubber","Oil","R","swells"),
("Rubber","Sulphur","R","vulcanises, hardens"),("Rubber","Steam","R","softens"),
("Rubber","Ice","F","stiffens"),("Rubber","Snow","F","stiffens"),
("Rubber","Frost","F","stiffens"),("Rubber","Dry Ice","F","goes brittle"),
("Rubber","Bomb","X","blasts apart"),("Rubber","Lightning",".","insulates \u2014 the arc dies"),
("Rubber","Mercury","^","floats"),("Rubber","Water","." ,"waterproof"),
("Rubber","Rain","." ,"waterproof"),("Rubber","Wax","." ,"no reaction"),
("Rubber","Limestone","." ,"no reaction"),("Rubber","Tar","R","sticks"),
("Rubber","Fire","B","burns with thick smoke"),("Rubber","Lava","B","burns"),
("Rubber","Spark","B","ignites"),("Rubber","Plasma","B","burns"),
("Rubber","Molten Metal","B","burns"),("Rubber","Phosphor","B","burns together"),
("Rubber","Stone","." ,"no reaction"),("Rubber","Bedrock","." ,"nothing affects bedrock"),
("Rubber","Glass","." ,"no reaction"),("Rubber","Metal","." ,"no reaction"),
("Rubber","Wood","." ,"no reaction"),("Rubber","Sponge","." ,"no reaction"),
("Rubber","Clay","." ,"no reaction"),("Rubber","Sand","." ,"no reaction"),
("Rubber","Gravel","." ,"no reaction"),("Rubber","Soil","." ,"no reaction"),
("Rubber","Coal","." ,"no reaction"),("Rubber","Cloud","." ,"no reaction"),
("Rubber","Toxic Gas","." ,"no reaction"),("Rubber","Foam","." ,"no reaction"),
("Rubber","Hydrogen","." ,"no reaction"),("Rubber","Crystal","." ,"no reaction"),
("Rubber","Obsidian","." ,"no reaction"),("Rubber","Quicklime","." ,"no reaction"),
("Rubber","Gold","." ,"no reaction"),("Rubber","Iron Ore","." ,"no reaction"),
("Rubber","Rust","." ,"no reaction"),("Rubber","Salt","." ,"no reaction"),
("Rubber","Gunpowder","." ,"no reaction"),

]
for a, b, s, w in E:
    if a in M and b in M:
        sp(a, b, s, w)
for nm in ORDER:
    if M[nm]["shatter"] and nm != "Bomb" and frozenset(("Bomb", nm)) not in SPECIAL:
        sp("Bomb", nm, "X", "shatters")

# ================= fallback =================
def pair(a, b):
    key = frozenset((a, b))
    if key in SPECIAL:
        return SPECIAL[key]
    A, B = M[a], M[b]
    if A["inert"] or B["inert"]:
        return (".", "no reaction")
    # explosives go off only when lit
    for X, Y in ((a, b), (b, a)):
        if M[X]["explode"] and M[Y]["ignite"]:
            return ("X", "explodes")
    # ignition
    for X, Y in ((a, b), (b, a)):
        if M[X]["ignite"] and M[Y]["fuel"]:
            return ("B", "ignites")
    # heat melts
    for X, Y in ((a, b), (b, a)):
        if M[X]["heat"] and M[Y]["melt"] <= M[X]["heat"]:
            return ("M", "melts")
    # chill freezes
    for X, Y in ((a, b), (b, a)):
        if M[X]["chill"] and M[Y]["freezable"]:
            return ("F", "freezes")
    # acid
    for X, Y in ((a, b), (b, a)):
        if M[X]["acidic"] and M[Y]["acidvuln"]:
            return ("D", "corrodes")
    # dissolve
    for X, Y in ((a, b), (b, a)):
        if M[X]["soluble"] and Y in ("Water", "Rain", "Steam"):
            return ("D", "dissolves")
    # absorb
    for X, Y in ((a, b), (b, a)):
        if M[X]["absorb"] and M[Y]["state"] in ("liquid",) and M[X] is not M[Y]:
            return ("R", "soaks in")
    # density
    if A["state"] in ("liquid","gas") and B["state"] in ("liquid","gas"):
        if abs(A["dens"] - B["dens"]) > 0.3:
            return ("^", "separates by density")
    if A["state"] == "solid" and B["state"] == "liquid" and A["dens"] < B["dens"] * 0.9:
        return ("^", "floats")
    if B["state"] == "solid" and A["state"] == "liquid" and B["dens"] < A["dens"] * 0.9:
        return ("^", "floats")
    # conduct
    for X, Y in ((a, b), (b, a)):
        if M[X]["conduct"] and M[Y]["state"] == "energy":
            return ("R", "conducts")
    return (".", "no reaction")

N = len(ORDER)
SYM, WHY = {}, {}
for i in range(N):
    for j in range(i + 1, N):
        s, w = pair(ORDER[i], ORDER[j])
        SYM[(i, j)] = SYM[(j, i)] = s
        WHY[(i, j)] = WHY[(j, i)] = w

FILL = {"B":(96,52,22),"D":(34,72,42),"M":(92,46,14),"F":(30,64,92),
        "R":(54,46,96),"X":(82,34,38),"^":(28,58,78),".":(26,30,39)}

LEG = [("B","ignites / burns"),("D","dissolves / corrodes"),("M","melts / softens"),
       ("F","freezes / chills"),("R","reacts into something new"),
       ("X","destroys / explodes / quenches / shatters"),
       ("^","floats / separates by density"),(".","no reaction")]

def wrap(d, text, fnt, maxw):
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=fnt) <= maxw: cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def rot_label(text, fnt, d_dummy):
    w = int(d_dummy.textlength(text, font=fnt)) + 8
    h = 26
    tmp = Image.new("RGBA", (w, h), (0,0,0,0))
    td = ImageDraw.Draw(tmp)
    td.text((2, 2), text, font=fnt, fill=MUTED)
    return tmp.rotate(90, expand=True)

def headers(img, cols, left, top, cell, f_h):
    d0 = ImageDraw.Draw(Image.new("RGB",(10,10)))
    for j, nm in enumerate(cols):
        lab = rot_label(nm, f_h, d0)
        x = int(left + j * cell + (cell - lab.width) / 2)
        img.paste(lab, (x, top - lab.height - 8), lab)

def draw_legend(d, x, y, f_leg, f_head, width):
    d.text((x, y), "KEY", font=f_head, fill=MUTED)
    y += 32
    lx, yy = x, y
    for sym, meaning in LEG:
        w = 30 + d.textlength(meaning, font=f_leg) + 44
        if lx + w > x + width:
            lx, yy = x, yy + 34
        d.text((lx, yy), sym, font=f_leg, fill=TEXT)
        d.text((lx + 28, yy), meaning, font=f_leg, fill=MUTED)
        lx += w
    return yy + 34

def band(d, W, h=200):
    for i in range(h):
        a = int(26 * (1 - i / h))
        d.line([(0, i), (W, i)], fill=(13 + a, 15 + a // 2, 21 + a))

# ---------------- full board ----------------
def overview():
    MARG, cell, label_w = 56, 40, 236
    left, top = MARG + label_w, 380
    W = left + N * cell + MARG
    H = top + N * cell + 210
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    f_t, f_s, f_h, f_c, f_l = font(62, True), font(24), font(15, True), font(16, True), font(20)
    band(d, W)
    d.text((MARG, MARG), "PARTICLE SANDBOX — FULL REACTION BOARD", font=f_t, fill=TEXT)
    d.text((MARG, MARG + 78), "All 48 materials against all 48. 1,128 pairs. Row meets column.",
           font=f_s, fill=MUTED)
    headers(img, ORDER, left, top, cell, f_h)
    for i, rn in enumerate(ORDER):
        y = top + i * cell
        tw = d.textlength(rn, font=f_h)
        d.text((MARG + label_w - 20 - tw, y + cell / 2 - 8), rn, font=f_h, fill=TEXT)
        d.rectangle([MARG + label_w - 13, y + 2, MARG + label_w - 4, y + cell - 2],
                    fill=CAT_COL[M[rn]["cat"]])
        for j in range(N):
            x = left + j * cell
            v = "." if i == j else SYM[(i, j)]
            d.rectangle([x + 0.5, y + 0.5, x + cell - 1, y + cell - 1], fill=FILL[v])
            if i != j and v != ".":
                tw2 = d.textlength(v, font=f_c)
                d.text((x + cell / 2 - tw2 / 2, y + cell / 2 - 9), v, font=f_c, fill=TEXT)
    draw_legend(d, MARG, top + N * cell + 26, f_l, f_h, W - 2 * MARG)
    img.save("/storage/emulated/0/Documents/particle-sandbox-board-full.png")
    print("overview", img.size)

# ---------------- detail sheets ----------------
def detail(cols, idx, total):
    MARG, cell, label_w = 56, 66, 250
    left, top = MARG + label_w, 360
    W = left + len(cols) * cell + MARG
    H = top + N * cell + 150
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    f_t, f_s, f_h, f_c, f_l = font(50, True), font(22), font(16, True), font(26, True), font(19)
    band(d, W, 150)
    d.text((MARG, MARG), f"REACTION BOARD  {idx}/{total}", font=f_t, fill=TEXT)
    d.text((MARG, MARG + 62), f"All 48 materials (rows) against {cols[0]} → {cols[-1]} (columns).",
           font=f_s, fill=MUTED)
    headers(img, cols, left, top, cell, f_h)
    for i, rn in enumerate(ORDER):
        y = top + i * cell
        tw = d.textlength(rn, font=f_h)
        d.text((MARG + label_w - 22 - tw, y + cell / 2 - 8), rn, font=f_h, fill=TEXT)
        d.rectangle([MARG + label_w - 14, y + 2, MARG + label_w - 4, y + cell - 2],
                    fill=CAT_COL[M[rn]["cat"]])
        for j, cn in enumerate(cols):
            x = left + j * cell
            ci, cj = ORDER.index(rn), ORDER.index(cn)
            v = "." if rn == cn else SYM[(ci, cj)]
            d.rectangle([x + 1, y + 1, x + cell - 2, y + cell - 2], fill=FILL[v])
            ch = "·" if rn == cn else v
            tw2 = d.textlength(ch, font=f_c)
            col = TEXT if v != "." else (74, 82, 96)
            d.text((x + cell / 2 - tw2 / 2, y + cell / 2 - 16), ch, font=f_c, fill=col)
    draw_legend(d, MARG, top + N * cell + 22, f_l, f_h, W - 2 * MARG)
    img.save(f"/storage/emulated/0/Documents/particle-sandbox-board-{idx}.png")
    print("detail", idx, img.size)


NEW = ["Limestone", "Wax", "Rubber"]
PARTNERS = [n for n in ORDER if n not in NEW]
IDX = {n: i for i, n in enumerate(ORDER)}

def focused():
    MARG, cell, label_w = 56, 32, 180
    left, top = MARG + label_w, 300
    W = left + len(PARTNERS) * cell + MARG
    strip_h = len(NEW) * cell
    panel_top = top + strip_h + 96
    gap = 24
    panel_w = (W - 2 * MARG - 2 * gap) // 3
    entry_h = 24
    panel_h = 66 + len(PARTNERS) * entry_h + 24
    H = panel_top + panel_h + MARG

    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    band(d, W, 170)
    f_t, f_s, f_h, f_c = font(54, True), font(22), font(15, True), font(18, True)
    f_p, f_e, f_l = font(26, True), font(18), font(17)

    d.text((MARG, MARG), "ROSTER CHANGE \u2014 3 OUT, 3 IN", font=f_t, fill=TEXT)
    d.text((MARG, MARG + 70),
           "Out: Slag, Lead, Glow Dust.   In: Limestone, Wax, Rubber.   "
           "Each new material against all 47 others.",
           font=f_s, fill=MUTED)

    headers(img, PARTNERS, left, top, cell, f_h)

    for i, nm in enumerate(NEW):
        y = top + i * cell
        tw = d.textlength(nm, font=f_h)
        d.text((MARG + label_w - 18 - tw, y + cell / 2 - 8), nm, font=f_h, fill=TEXT)
        d.rectangle([MARG + label_w - 12, y + 2, MARG + label_w - 4, y + cell - 2],
                    fill=CAT_COL[M[nm]["cat"]])
        for j, o in enumerate(PARTNERS):
            x = left + j * cell
            v = SYM[(IDX[nm], IDX[o])]
            d.rectangle([x + 0.5, y + 0.5, x + cell - 1, y + cell - 1], fill=FILL[v])
            if v != ".":
                tw2 = d.textlength(v, font=f_c)
                d.text((x + cell / 2 - tw2 / 2, y + cell / 2 - 10), v, font=f_c, fill=TEXT)

    for pi, nm in enumerate(NEW):
        x = MARG + pi * (panel_w + gap)
        d.rounded_rectangle([x, panel_top, x + panel_w, panel_top + panel_h],
                            16, fill=(23, 26, 35), outline=(40, 45, 58))
        d.text((x + 22, panel_top + 18), nm, font=f_p, fill=M[nm]["col"])
        tw = d.textlength(nm, font=f_p)
        cnt = sum(1 for o in PARTNERS if SYM[(IDX[nm], IDX[o])] != ".")
        d.text((x + 38 + tw, panel_top + 26), f"{cnt} of 47 react", font=f_l, fill=MUTED)
        yy = panel_top + 66
        for o in PARTNERS:
            v = SYM[(IDX[nm], IDX[o])]
            w = WHY[(IDX[nm], IDX[o])]
            d.text((x + 22, yy), o, font=f_e, fill=TEXT)
            d.text((x + 148, yy), v, font=f_e,
                   fill=TEXT if v != "." else (74, 82, 96))
            d.text((x + 176, yy), w, font=f_e, fill=MUTED)
            yy += entry_h

    img.save("/storage/emulated/0/Documents/particle-sandbox-new-items.png")
    print("new items", img.size)

focused()

for nm in NEW:
    c = sum(1 for o in PARTNERS if SYM[(IDX[nm], IDX[o])] != ".")
    print(f"{nm}: {c}/47 react")

print("total non-empty pairs:",
      sum(1 for i in range(N) for j in range(i + 1, N) if SYM[(i, j)] != "."),
      "of", N * (N - 1) // 2)
