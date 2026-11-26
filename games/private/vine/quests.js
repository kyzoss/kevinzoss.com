// Passionfruit Wall quest data. Plain data in a UMD module so logic.js stays
// pure and tests can validate the bank. Dates are ISO (local El Segundo days).
// proof: "none" | "photo" | "number" | "checklist" | "time" (photo in a time window)
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VineQuests = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CHAPTERS = [
    { id: 0, key: "scout", title: "Scout", when: "Now", from: "2026-11-01", to: "2027-02-28", blurb: "Read the site before buying anything. Sun, soil, drainage, direction." },
    { id: 1, key: "build", title: "Build", when: "Dec 2026 to Feb 2027", from: "2026-12-01", to: "2027-03-31", blurb: "A trellis that stands on its own, a bed that drains, drip in place." },
    { id: 2, key: "plant", title: "Plant", when: "Feb 15 to Mar 31, 2027", from: "2027-02-15", to: "2027-04-30", blurb: "One established Frederick in the ground, slightly above grade." },
    { id: 3, key: "train", title: "Train", when: "Apr to Jun 2027", from: "2027-04-01", to: "2027-07-31", blurb: "One stem up, two laterals out. Water, feed, photograph every week." },
    { id: 4, key: "flourish", title: "Flourish", when: "Jul to Oct 2027", from: "2027-07-01", to: "2027-11-30", blurb: "Heavy foliage, first flowers, pollinators, pests, coverage." },
    { id: 5, key: "rest", title: "Winter rest", when: "Nov 2027 to Feb 2028", from: "2027-11-01", to: "2028-03-31", blurb: "Less water, a careful prune, a plan for the big year." },
    { id: 6, key: "harvest", title: "Harvest", when: "2028", from: "2028-03-01", to: "2029-12-31", blurb: "A full privacy wall and the first real harvest." }
  ];

  var LEVELS = [
    { name: "Seed", xp: 0 },
    { name: "Sprout", xp: 120 },
    { name: "Tendril", xp: 300 },
    { name: "Climber", xp: 600 },
    { name: "Canopy", xp: 1000 },
    { name: "Bloom", xp: 1500 },
    { name: "Fruit", xp: 2100 },
    { name: "Wall Master", xp: 3000 }
  ];

  var BADGES = [
    { id: "sun_detective", name: "Sun Detective", how: "Finish all four sun audit slots." },
    { id: "three_posts", name: "Three Posts", how: "Set the three trellis posts." },
    { id: "wired", name: "Wired", how: "String the trellis wires." },
    { id: "bed_ready", name: "Bed Ready", how: "Clear and fill the bed." },
    { id: "day_one", name: "Day 1", how: "Plant the vine and take the Day 1 photo." },
    { id: "named", name: "Named", how: "Give the vine a name." },
    { id: "ten_weeks", name: "Ten Weeks Straight", how: "Ten weekly growth photos in a row." },
    { id: "water_week", name: "Watering Streak", how: "Seven watering check-ins in a row." },
    { id: "first_flower", name: "First Flower", how: "Log the first flower." },
    { id: "pollinator", name: "Pollinator", how: "Spot a bee or hand pollinate a flower." },
    { id: "first_fruit", name: "First Fruit", how: "Log the first fruit set." },
    { id: "half_wall", name: "Half Wall", how: "Claude reads coverage at 50 percent or more." },
    { id: "full_wall", name: "Full Wall", how: "Claude reads coverage at 90 percent or more." },
    { id: "wall_master", name: "Wall Master", how: "Reach the Wall Master level." }
  ];

  // q(id, chapter, title, why, how[], proof, xp, unlock{after, requires[]}, tip, extra)
  function q(id, chapter, title, why, how, proof, xp, unlock, tip, extra) {
    var o = { id: id, chapter: chapter, title: title, why: why, how: how, proof: proof, xp: xp, unlock: unlock || {}, tip: tip || "" };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  var QUESTS = [
    // ---------------------------------------------------------------- 0 Scout
    q("scout_intro", 0, "Walk the site", "The wall is white vinyl on stucco, 7 to 8 ft tall, with string lights and utility lines above and the hot tub to the right. Know what you are working with.",
      ["Stand at the bed and look up: note the lines, the lights and the hot tub edge.", "Take one wide photo of the whole wall from the lawn."], "photo", 20, {}, "The seed Day 0 photos already show the spot. Yours is the first entry in your own journal."),
    q("sun_9", 0, "Sun audit, 9 am", "Passionfruit wants 6+ hours of direct sun on the upper foliage. In late November the sun sits only 35 degrees high at noon, so the fence top is the honest test, not the bed.",
      ["At 9 am stand on the lawn facing the wall.", "Photograph the TOP half of the fence so the shade line is clear.", "Claude reads whether the upper fence is lit."], "time", 25, {}, "Shoot slightly from the side so the shadow edge on the vinyl is visible.", { slot: "09:00" }),
    q("sun_11", 0, "Sun audit, 11 am", "Mid morning light is the first real sun on a south-ish wall. Compare it to the 9 am shot.",
      ["Same spot, 11 am.", "Photograph the top half of the fence."], "time", 25, {}, "", { slot: "11:00" }),
    q("sun_1", 0, "Sun audit, 1 pm", "Midday is the peak. If the upper fence is shaded now, summer will still be fine only if the shade comes from something low.",
      ["Same spot, 1 pm.", "Photograph the top half of the fence."], "time", 25, {}, "In June the sun will be 80 degrees high and daylight 14.4 h, so winter shade from the roof line mostly disappears.", { slot: "13:00" }),
    q("sun_3", 0, "Sun audit, 3 pm", "Afternoon sun matters most for ripening fruit, and it is the slot most often lost to the house or trees.",
      ["Same spot, 3 pm.", "Photograph the top half of the fence."], "time", 25, {}, "", { slot: "15:00" }),
    q("sun_verdict", 0, "Read the verdict", "Four slots give a rough summer estimate. Six hours or more and the wall is a go. Under four and consider a sunnier stretch of fence.",
      ["Open the Sun audit screen.", "Check the estimated summer hours against the 6 h target."], "none", 30, { requires: ["sun_9", "sun_11", "sun_1", "sun_3"] }, "The estimate leans on sun angle: 35 degrees now, 56 in March, 80 in June."),
    q("measure_bed", 0, "Measure the bed", "A 4 x 2 x 1 ft bed is fine for one vine as long as it is open to native soil underneath. Confirm the size and where it sits on the wall.",
      ["Measure length, width and height in inches.", "Measure from the bed centre to each end of the wall section you want covered."], "number", 15, {}, "Target wall: 10 to 12 ft wide, centred on the bed.", { unit: "in", label: "Bed length (in)" }),
    q("bearing", 0, "Confirm the wall faces south", "A south facing wall catches the most sun in winter and spring, when the vine needs to wake up fast.",
      ["Open the phone compass app.", "Stand with your back flat against the wall and face the lawn.", "Read the bearing in degrees and enter it. South is 180, anything from 135 to 225 is good."], "number", 20, {}, "Check the compass is set to true north, not magnetic, in the app settings.", { unit: "deg", label: "Bearing (degrees)" }),
    q("drainage", 0, "Drainage test", "Passionfruit roots rot in standing water. The native soil under the bed must drain.",
      ["Dig a hole about 12 in deep inside the bed footprint.", "Fill it with water and note the time.", "Come back: it should be empty within a few hours. Enter the hours it took."], "number", 25, {}, "If it takes more than 8 hours, add extra pumice and plant higher.", { unit: "h", label: "Hours to drain" }),
    q("open_bottom", 0, "Check the bed is open underneath", "No plastic, no landscape fabric, no liner. The vine needs to send roots into the native soil.",
      ["Lift the bed or dig at the edge to confirm there is nothing below it.", "Photograph the bottom edge."], "photo", 15, {}, ""),
    q("hazards", 0, "Map the hazards", "Mature vines grow 15 to 20 ft a year and get heavy. The utility lines above and the hot tub to the right are no-go zones.",
      ["Note the lowest utility line height above the fence.", "Note the gap between the bed end and the hot tub.", "Decide where the vine must stop on each side."], "checklist", 15, {}, "", { items: ["Utility line height noted", "Hot tub clearance noted", "Stop points chosen"] }),
    q("scout_done", 0, "Scout complete", "Everything above feeds the trellis plan.",
      ["Review the Plan screen.", "Mark this done when you are happy with the site."], "none", 20, { requires: ["sun_verdict", "measure_bed", "bearing", "drainage", "open_bottom"] }, ""),

    // ---------------------------------------------------------------- 1 Build
    q("trellis_plan", 1, "Trellis plan", "The trellis stands on its own, not on the vinyl fence. Three anchored posts, 6 to 12 in off the wall, wires every 12 to 16 in, about fence height.",
      ["Sketch three posts: one at the bed centre and one at each end of the 10 to 12 ft span.", "Choose metal or wood posts about 8 ft above grade.", "Pick galvanized or stainless wire and turnbuckles."], "checklist", 25, { after: "2026-12-01" }, "Posts set in concrete or driven sleeves. Vinyl fence panels cannot carry a mature vine.", { items: ["Post positions marked", "Post material chosen", "Wire and tensioners chosen"] }),
    q("parts_list", 1, "Parts list", "Buying everything in one trip keeps the build to a weekend.",
      ["Tick each item as it arrives."], "checklist", 20, { requires: ["trellis_plan"] }, "", { items: ["3 posts (8 ft, metal or wood)", "3 post anchors or 2 bags concrete", "Galvanized or stainless wire, 60 ft", "6 turnbuckles and eye bolts", "Wire clamps", "Vine ties or soft tape", "4 cu ft organic raised bed soil", "2 cu ft compost", "1 cu ft pumice", "1 cu ft mulch", "Organic fruit tree fertilizer", "2 drip emitters and tubing"] }),
    q("posts_set", 1, "Set the three posts", "Posts carry the whole wall. Plumb, anchored, 6 to 12 in clear of the stucco.",
      ["Mark centre and both ends.", "Set each post plumb and let concrete cure 24 h.", "Photograph the three posts from the lawn."], "photo", 60, { requires: ["parts_list"] }, "Keep the end posts short of the hot tub edge."),
    q("wires_strung", 1, "String the wires", "Horizontal wires every 12 to 16 in give the laterals something to grab.",
      ["Start the lowest wire about 18 in above the bed.", "Tension each wire with a turnbuckle.", "Photograph the finished grid."], "photo", 45, { requires: ["posts_set"] }, "Five or six wires covers a 7 ft fence."),
    q("lights_moved", 1, "Move the string lights", "Lights running through foliage get tangled, heat leaves and make pruning a chore.",
      ["Re-route the lights above or beside the growing area.", "Photograph the cleared wall."], "photo", 20, { after: "2026-12-01" }, ""),
    q("bed_cleared", 1, "Clear the bed", "Grass inside the bed competes for water and nitrogen.",
      ["Remove the turf inside the oval.", "Loosen the native soil 8 to 12 in deep with a fork.", "Photograph the bare soil."], "photo", 30, { after: "2026-12-01", requires: ["open_bottom"] }, "No plastic or fabric below."),
    q("bed_filled", 1, "Fill the bed", "The mix: 4 cu ft raised bed soil, 2 cu ft compost, 1 cu ft pumice, fertilizer per the package, then 1 cu ft mulch on top later.",
      ["Mix soil, compost and pumice in the bed.", "Work in fruit tree fertilizer at the package rate.", "Photograph the filled bed."], "photo", 40, { requires: ["bed_cleared"] }, "Leave the mulch off until the vine is planted."),
    q("drip_placed", 1, "Place the drip line", "Two emitters on a timer give deep, even water without wetting the crown.",
      ["Run tubing to the bed and fit two emitters 8 in either side of the planting spot.", "Test run for 10 minutes.", "Photograph the emitters."], "photo", 30, { requires: ["bed_filled"] }, ""),
    q("build_check", 1, "Build checklist", "Walk the whole structure once before the plant arrives.",
      ["Tick each item."], "checklist", 25, { requires: ["wires_strung", "drip_placed"] }, "", { items: ["Posts do not move when pushed", "Wires tight and level", "Nothing touches the vinyl fence", "Lights clear of the growing area", "Drip runs and drains", "Clear of hot tub and utility lines"] }),
    q("build_done", 1, "Build complete", "A structure that will carry a heavy vine for years.",
      ["Take one wide photo of the finished trellis and bed."], "photo", 50, { requires: ["build_check", "lights_moved"] }, ""),

    // ---------------------------------------------------------------- 2 Plant
    q("buy_vine", 2, "Buy the vine", "One established Frederick passionfruit in a 5 gallon pot. Self-fertile, so one plant is enough. Purple passionfruit is the alternate.",
      ["Look for a plant with several healthy stems and no yellowing.", "Check the tag says Passiflora edulis Frederick (or purple passionfruit).", "Photograph the plant and tag."], "photo", 40, { after: "2027-02-15", requires: ["build_done"] }, "Ideal temperatures are 68 to 82 F, so late February to March is the time to plant."),
    q("plant_check", 2, "Planting day checklist", "Plant slightly above grade so the crown never sits in water.",
      ["Tick as you go."], "checklist", 40, { requires: ["buy_vine"] }, "", { items: ["Water the pot an hour before", "Hole twice the pot width, same depth", "Root ball top 1 to 2 in above grade", "Backfill and water in slowly", "Mulch 2 to 3 in deep, kept a few inches off the stem", "Tie the main stem to the lowest wire"] }),
    q("day1_photo", 2, "Day 1 photo", "This is the before picture for the whole project.",
      ["Stand where the seed Day 0 photo was taken.", "Photograph the vine on the trellis."], "photo", 50, { requires: ["plant_check"] }, "Use the same spot for every weekly photo so coverage is comparable."),
    q("name_vine", 2, "Name the vine", "You will be talking to it for two years.",
      ["Open Settings and enter a name."], "none", 15, { requires: ["day1_photo"] }, ""),
    q("first_water", 2, "First deep watering", "New roots need a wet, not soggy, root zone for the first few weeks.",
      ["Water deeply until the bed drains from the bottom.", "Set the drip timer to 2 or 3 times a week."], "none", 15, { requires: ["plant_check"] }, ""),
    q("plant_done", 2, "Planted", "Chapter 2 done.",
      ["Mark done after the first week with no wilting."], "none", 25, { requires: ["day1_photo", "first_water", "name_vine"] }, ""),

    // ---------------------------------------------------------------- 3 Train
    q("weekly_photo", 3, "Weekly growth photo", "One photo a week, same spot, is the data behind coverage, health and the streak badges.",
      ["Every Sunday photograph the whole trellis from the lawn.", "Claude estimates health and coverage."], "photo", 20, { after: "2027-04-01", requires: ["plant_done"] }, "Repeatable, not a one-off. Ten in a row earns Ten Weeks Straight.", { repeat: "weekly" }),
    q("single_stem", 3, "Train a single stem", "One strong main stem up the centre makes a clean frame. Side shoots low down steal energy.",
      ["Pick the strongest stem and tie it to the centre post every 12 in.", "Pinch off side shoots below the top wire.", "Photograph the tied stem."], "photo", 35, { after: "2027-04-01", requires: ["plant_done"] }, ""),
    q("laterals", 3, "Pick the two laterals", "When the stem reaches the top wire, two laterals run horizontally in opposite directions. These become the wall.",
      ["Pinch the tip when it passes the top wire.", "Choose the two best shoots just below it and tie them left and right along the wire.", "Photograph the T shape."], "photo", 50, { requires: ["single_stem"] }, "Everything else that grows from the laterals hangs down and fills the wall."),
    q("water_streak", 3, "Watering streak", "Deep water 2 to 3 times a week in warm weather. Log each watering to build the streak.",
      ["Tap Water today on the Home screen after each deep watering."], "none", 10, { after: "2027-04-01", requires: ["plant_done"] }, "Seven in a row earns the Watering Streak badge.", { repeat: "daily" }),
    q("first_feed", 3, "First feed", "Organic fruit tree fertilizer in spring and summer. Too much nitrogen gives leaves and no fruit.",
      ["Apply at the package rate around the drip line, not against the stem.", "Water in."], "none", 20, { after: "2027-04-15", requires: ["plant_done"] }, "Then monthly April to September."),
    q("tie_in_spring", 3, "Tie-in round", "Loose growth whips in wind and snaps.",
      ["Tie new growth to the wires with soft ties.", "Photograph the tidied trellis."], "photo", 20, { requires: ["laterals"] }, ""),
    q("train_done", 3, "Trained", "Frame in place, laterals running.",
      ["Mark done when both laterals are over 3 ft long."], "number", 40, { requires: ["laterals", "first_feed"] }, "", { unit: "ft", label: "Longest lateral (ft)" }),

    // ---------------------------------------------------------------- 4 Flourish
    q("first_flower", 4, "First flower", "Frederick can flower in its first summer. Flowers open for a day.",
      ["Photograph the first open flower."], "photo", 40, { after: "2027-07-01", requires: ["train_done"] }, ""),
    q("pollinator_watch", 4, "Pollinator watch", "Bees, especially carpenter bees, do the pollinating. Flowers that do not set may need a hand.",
      ["Watch the flowers for 10 minutes mid morning.", "Count the bees you see."], "number", 20, { requires: ["first_flower"] }, "", { unit: "bees", label: "Bees in 10 minutes" }),
    q("hand_pollinate", 4, "Hand pollination how-to", "If flowers drop without a fruit forming, pollinate by hand.",
      ["Mid morning, take a soft brush.", "Touch the anthers (the pollen pads) and then each of the three stigmas on the same or another flower.", "Photograph a pollinated flower."], "photo", 30, { requires: ["first_flower"] }, ""),
    q("pest_aphids", 4, "Pest check: aphids", "Soft green clusters on new tips. A hose blast or insecticidal soap clears them.",
      ["Inspect the newest tips and the undersides of leaves.", "Tick when checked."], "checklist", 15, { after: "2027-07-01", requires: ["train_done"] }, "", { items: ["Tips checked", "Leaf undersides checked", "Treated if found"] }),
    q("pest_caterpillars", 4, "Pest check: caterpillars", "Gulf fritillary caterpillars love Passiflora. A few are fine, many strip leaves.",
      ["Look for chewed leaves and orange and black caterpillars.", "Pick off by hand if more than a handful."], "checklist", 15, { after: "2027-07-01", requires: ["train_done"] }, "", { items: ["Leaves checked", "Caterpillars counted", "Hand picked if needed"] }),
    q("pest_snails", 4, "Pest check: snails", "Snails and slugs eat the soft new growth at night.",
      ["Check the bed edge at dusk.", "Use iron phosphate bait or copper tape."], "checklist", 15, { after: "2027-07-01", requires: ["train_done"] }, "", { items: ["Bed edge checked at dusk", "Bait or copper placed"] }),
    q("tie_in_summer", 4, "Summer tie-in", "Heavy growth needs tying every couple of weeks.",
      ["Tie in new laterals and hanging shoots.", "Photograph the wall."], "photo", 20, { after: "2027-07-01", requires: ["train_done"] }, ""),
    q("coverage_25", 4, "Quarter wall", "Coverage is the share of the 12 ft by fence-height target filled with foliage.",
      ["Take a weekly photo. Claude estimates the coverage."], "photo", 30, { after: "2027-07-01", requires: ["train_done"] }, "", { coverage: 25 }),
    q("first_fruit", 4, "First fruit set", "A small green egg forming behind a spent flower.",
      ["Photograph the first fruit."], "photo", 50, { requires: ["first_flower"] }, "Fruit takes 60 to 80 days to ripen."),
    q("summer_feed", 4, "Summer feeding", "Monthly feeds April to September keep the vine building wall.",
      ["Tick each month fed."], "checklist", 20, { after: "2027-07-01", requires: ["first_feed"] }, "", { items: ["July", "August", "September"] }),
    q("flourish_done", 4, "Flourished", "A summer of growth.",
      ["Mark done at the end of October."], "none", 30, { after: "2027-10-15", requires: ["coverage_25"] }, ""),

    // ---------------------------------------------------------------- 5 Winter rest
    q("reduce_water", 5, "Reduce water", "Winter growth is slow. Wet cold soil rots roots.",
      ["Cut the drip to once a week or less, skipping rainy weeks."], "none", 15, { after: "2027-11-01", requires: ["plant_done"] }, ""),
    q("winter_check", 5, "Winter check-in", "Keep an eye on the vine even when it is quiet.",
      ["Monthly photo of the wall."], "photo", 15, { after: "2027-11-01", requires: ["plant_done"] }, "", { repeat: "monthly" }),
    q("prune_plan", 5, "Plan the prune", "Late winter pruning removes dead and tangled growth but keeps the main laterals.",
      ["Walk the wall and mark dead or crossing stems with tape."], "checklist", 20, { after: "2028-01-15", requires: ["plant_done"] }, "", { items: ["Dead stems marked", "Crossing stems marked", "Laterals identified and kept"] }),
    q("prune", 5, "Prune", "Cut in late February before new growth. Never cut the two main laterals.",
      ["Remove dead, weak and tangled stems.", "Shorten hanging shoots to 2 or 3 buds.", "Photograph the pruned wall."], "photo", 40, { after: "2028-02-01", requires: ["prune_plan"] }, ""),
    q("spring_feed_2", 5, "First feed of year two", "Wake the vine up.",
      ["Fruit tree fertilizer at the package rate in March."], "none", 20, { after: "2028-03-01", requires: ["prune"] }, ""),
    q("rest_done", 5, "Rested", "Ready for the big year.",
      ["Mark done after the spring feed."], "none", 20, { requires: ["prune", "spring_feed_2"] }, ""),

    // ---------------------------------------------------------------- 6 Harvest
    q("coverage_50", 6, "Half wall", "Halfway to privacy.",
      ["Weekly photo. Claude reads 50 percent or more."], "photo", 60, { after: "2028-04-01", requires: ["rest_done"] }, "", { coverage: 50 }),
    q("coverage_90", 6, "Full wall", "The privacy wall is real.",
      ["Weekly photo. Claude reads 90 percent or more."], "photo", 120, { requires: ["coverage_50"] }, "", { coverage: 90 }),
    q("fruit_count", 6, "Fruit count", "Harvest when fully coloured, often when the fruit drops. Count what you pick.",
      ["Enter the number of fruit picked this season."], "number", 60, { after: "2028-06-01", requires: ["rest_done"] }, "Wrinkled skin means sweeter.", { unit: "fruit", label: "Fruit harvested" }),
    q("harvest_photo", 6, "Harvest photo", "The bowl shot.",
      ["Photograph the harvest."], "photo", 40, { requires: ["fruit_count"] }, ""),
    q("hot_tub_tropical", 6, "Tropical corner", "The second goal: the hot tub corner feels tropical.",
      ["Photograph the wall from the hot tub."], "photo", 30, { requires: ["coverage_50"] }, ""),
    q("wall_master", 6, "Wall Master", "A living wall that fruits.",
      ["Mark done when the wall is full and the first harvest is in."], "none", 150, { requires: ["coverage_90", "harvest_photo"] }, "")
  ];

  return { CHAPTERS: CHAPTERS, LEVELS: LEVELS, BADGES: BADGES, QUESTS: QUESTS };
});
