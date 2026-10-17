// Road Trip content banks. Plain data in a UMD module like logic.js so logic.js
// stays small and tests can validate the banks directly. All content is
// original, G rated, and written for kids aged 5 to 10. Tiers: "little" (5-7)
// and "big" (8-10). Items with no tier are fine for everyone.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RoadTripContent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ------------------------------------------------------------ bingo
  // b(id, label, emoji, tier)
  function b(id, label, emoji, tier) { return { id: id, label: label, emoji: emoji, tier: tier }; }
  var BINGO = [
    b("redcar", "Red car", "🚗", "little"), b("cow", "Cow", "🐄", "little"), b("bridge", "Bridge", "🌉", "little"),
    b("truck", "Big truck", "🚚", "little"), b("dog", "Dog", "🐕", "little"), b("airplane", "Airplane", "✈️", "little"),
    b("tractor", "Tractor", "🚜", "little"), b("police", "Police car", "🚓", "little"), b("schoolbus", "School bus", "🚌", "little"),
    b("horse", "Horse", "🐴", "little"), b("stopsign", "Stop sign", "🛑", "little"), b("bicycle", "Bicycle", "🚲", "little"),
    b("flag", "Flag", "🚩", "little"), b("bird", "Bird", "🐦", "little"), b("tree", "Big tree", "🌳", "little"),
    b("cloud", "Fluffy cloud", "☁️", "little"), b("gas", "Gas station", "⛽", "little"), b("traffic", "Traffic light", "🚦", "little"),
    b("whitecar", "White car", "🚙", "little"), b("motorcycle", "Motorcycle", "🏍️", "little"), b("mailbox", "Mailbox", "📫", "little"),
    b("barn", "Barn", "🏚️", "little"), b("church", "Church", "⛪", "little"), b("river", "River", "🏞️", "little"),
    b("firetruck", "Fire truck", "🚒", "little"), b("ambulance", "Ambulance", "🚑", "little"), b("pickup", "Pickup truck", "🛻", "little"),
    b("bluecar", "Blue car", "🚘", "little"), b("sheep", "Sheep", "🐑", "little"), b("playground", "Playground", "🛝", "little"),
    b("cone", "Orange cone", "🔶", "little"), b("house", "Yellow house", "🏠", "little"), b("sun", "Sunshine", "☀️", "little"),
    b("flower", "Flowers", "🌼", "little"), b("hill", "Hill", "⛰️", "little"), b("bus", "City bus", "🚍", "little"),
    b("watertower", "Water tower", "🗼", "big"), b("yellowtruck", "Yellow truck", "🚛", "big"), b("train", "Train", "🚂", "big"),
    b("billboard", "Billboard", "🪧", "big"), b("restarea", "Rest area sign", "🛣️", "big"), b("windmill", "Wind turbine", "🌬️", "big"),
    b("rv", "RV camper", "🚐", "big"), b("taxi", "Taxi", "🚕", "big"), b("boat", "Boat", "⛵", "big"),
    b("helicopter", "Helicopter", "🚁", "big"), b("deer", "Deer", "🦌", "big"), b("hawk", "Hawk circling", "🦅", "big"),
    b("tunnel", "Tunnel", "🕳️", "big"), b("railroad", "Railroad crossing", "🚧", "big"), b("convertible", "Convertible", "🏎️", "big"),
    b("limo", "Limousine", "🚖", "big"), b("towtruck", "Tow truck", "🪝", "big"), b("cementmixer", "Cement mixer", "🏗️", "big"),
    b("outofstate", "Out of state plate", "🔤", "big"), b("goat", "Goat", "🐐", "big"), b("rainbow", "Rainbow", "🌈", "big"),
    b("lake", "Lake", "🌊", "big"), b("silo", "Grain silo", "🏭", "big"), b("hayroll", "Hay bale", "🌾", "big"),
    b("solar", "Solar panels", "🔆", "big"), b("trailer", "Horse trailer", "🐎", "big"), b("crane", "Construction crane", "🏗️", "big"),
    b("hotel", "Hotel", "🏨", "big"), b("stadium", "Stadium", "🏟️", "big"), b("flagpole", "Flagpole", "🎌", "big"),
    b("fountain", "Fountain", "⛲", "big"), b("mountain", "Mountain", "🏔️", "big"), b("pond", "Pond with ducks", "🦆", "big"),
    b("cactus", "Cactus", "🌵", "big"), b("palm", "Palm tree", "🌴", "big"), b("radio", "Radio tower", "📡", "big"),
    b("statue", "Statue", "🗿", "big"), b("lighthouse", "Lighthouse", "🗽", "big"), b("greencar", "Green car", "🟢", "big"),
    b("kite", "Kite", "🪁", "big"), b("sportscar", "Sports car", "🚔", "big"), b("ladder", "Ladder on a truck", "🪜", "big"),
    b("cat", "Cat in a window", "🐈", "big"), b("butterfly", "Butterfly", "🦋", "big"), b("toll", "Toll booth", "🎫", "big")
  ];

  // ------------------------------------------------------------ I spy
  var ISPY_COLOURS = [
    { id: "red", name: "red", hex: "#D9463A" }, { id: "blue", name: "blue", hex: "#3A72C4" }, { id: "yellow", name: "yellow", hex: "#F2C230" },
    { id: "green", name: "green", hex: "#4A9A5A" }, { id: "orange", name: "orange", hex: "#F08A2E" }, { id: "purple", name: "purple", hex: "#8A5CC4" },
    { id: "pink", name: "pink", hex: "#F08AB2" }, { id: "brown", name: "brown", hex: "#8A5A36" }, { id: "black", name: "black", hex: "#2B2622" },
    { id: "white", name: "white", hex: "#FFFFFF" }, { id: "gray", name: "gray", hex: "#8E8E8E" }, { id: "gold", name: "gold", hex: "#C99A2E" }
  ];
  var ISPY_LETTERS = "ABCDEFGHIJKLMNOPRSTW".split("");
  var ISPY_LETTERS_BIG = "ABCDEFGHIJKLMNOPQRSTUVWYZ".split("");
  var ISPY_SHAPES = [
    "round", "square", "striped", "shiny", "soft", "fuzzy", "tall", "tiny", "bumpy", "smooth", "pointy", "flat",
    "long and thin", "spotted", "see through", "wiggly", "curvy", "huge", "sparkly", "rusty", "wooden", "made of metal",
    "moving fast", "standing still", "shaped like a triangle", "shaped like a rectangle", "shaped like a star", "shaped like a heart"
  ];

  // ------------------------------------------------------------ 20 questions
  var TWENTY = [];
  function t(cat, list) { list.forEach(function (n) { TWENTY.push({ name: n, cat: cat }); }); }
  t("Animal", ["Elephant", "Giraffe", "Penguin", "Kangaroo", "Dolphin", "Octopus", "Butterfly", "Hamster", "Goldfish", "Parrot",
    "Turtle", "Rabbit", "Squirrel", "Owl", "Frog", "Shark", "Zebra", "Monkey", "Bumblebee", "Snail", "Flamingo", "Panda",
    "Hedgehog", "Crab", "Peacock", "Koala", "Moose", "Seal", "Ladybug", "Crocodile"]);
  t("Food", ["Pizza", "Banana", "Pancakes", "Spaghetti", "Watermelon", "Popcorn", "Ice cream cone", "Taco", "Carrot", "Grilled cheese",
    "Strawberry", "Cupcake", "Pretzel", "Corn on the cob", "Blueberry muffin", "Peanut butter sandwich", "Pickle", "Apple pie",
    "Chicken nugget", "Waffle", "Pineapple", "Broccoli", "Hot dog", "Jelly bean", "Cheese stick", "Orange", "Bagel", "Marshmallow"]);
  t("Place", ["Beach", "Library", "Zoo", "Playground", "Grocery store", "Swimming pool", "Farm", "Castle", "Airport", "Campground",
    "Dentist office", "Movie theater", "Bakery", "Fire station", "Aquarium", "Treehouse", "Mountain top", "Ice rink", "Classroom",
    "Pizza shop", "Bus stop", "Garden", "Jungle", "Desert", "Igloo"]);
  t("Object", ["Umbrella", "Toothbrush", "Backpack", "Pillow", "Flashlight", "Teddy bear", "Crayon", "Skateboard", "Bicycle helmet",
    "Trampoline", "Kite", "Piano", "Mailbox", "Mirror", "Snow globe", "Ladder", "Blanket", "Bubble wand", "Lunchbox", "Alarm clock",
    "Rubber duck", "Paintbrush", "Sunglasses", "Jigsaw puzzle", "Yo-yo", "Rain boots", "Candle", "Balloon", "Magnet", "Shovel"]);
  t("Job", ["Firefighter", "Chef", "Astronaut", "Teacher", "Veterinarian", "Mail carrier", "Pilot", "Farmer", "Dentist", "Librarian",
    "Bus driver", "Lifeguard", "Baker", "Doctor", "Zookeeper", "Painter", "Garbage collector", "Police officer", "Scientist", "Builder",
    "Nurse", "Musician", "Gardener", "Train conductor", "Magician"]);
  t("Vehicle", ["School bus", "Fire truck", "Hot air balloon", "Submarine", "Rocket ship", "Tractor", "Sailboat", "Helicopter",
    "Garbage truck", "Ice cream truck", "Bulldozer", "Train", "Scooter", "Ambulance", "Canoe", "Monster truck", "Motorcycle",
    "Cement mixer", "Jet ski", "Snowplow", "Taxi", "Wheelchair", "Golf cart", "Ferry boat", "Race car"]);

  // ------------------------------------------------------------ would you rather
  // r(a, b, tier)
  function r(a, b2, tier) { return { a: a, b: b2, tier: tier }; }
  var RATHER = [
    r("Have a pet dinosaur", "Have a pet dragon", "little"), r("Eat pizza for breakfast", "Eat pancakes for dinner", "little"),
    r("Be able to fly", "Be able to turn invisible", "little"), r("Have a tail like a monkey", "Have ears like a bunny", "little"),
    r("Live in a treehouse", "Live in a castle", "little"), r("Swim like a fish", "Jump like a kangaroo", "little"),
    r("Have a slide instead of stairs", "Have a trampoline floor", "little"), r("Eat a bug flavored ice cream", "Eat a pickle flavored cupcake", "little"),
    r("Be as small as a mouse", "Be as big as a house", "little"), r("Have hands for feet", "Have feet for hands", "little"),
    r("Talk to animals", "Talk to toys", "little"), r("Ride a giant turtle to school", "Ride a giant bird to school", "little"),
    r("Have rainbow hair", "Have glow in the dark hair", "little"), r("Never have to brush your teeth", "Never have to take a bath", "little"),
    r("Have a robot that cleans your room", "Have a robot that does your homework", "little"), r("Sneeze bubbles", "Burp glitter", "little"),
    r("Have a nose like an elephant", "Have a neck like a giraffe", "little"), r("Only eat crunchy foods", "Only eat squishy foods", "little"),
    r("Be a superhero", "Be a wizard", "little"), r("Sleep in a hammock", "Sleep in a bunk bed", "little"),
    r("Have a snowball fight", "Have a water balloon fight", "little"), r("Be a cat for a day", "Be a dog for a day", "little"),
    r("Have a pool full of jelly", "Have a pool full of popcorn", "little"), r("Wear pajamas all day", "Wear a costume all day", "little"),
    r("Have a birthday every week", "Have a holiday every week", "little"), r("Ride a roller coaster", "Ride a Ferris wheel", "little"),
    r("Eat spaghetti with your fingers", "Eat soup with a fork", "little"), r("Have a pet unicorn", "Have a pet mermaid", "little"),
    r("Be able to run super fast", "Be able to jump super high", "little"), r("Have a house made of candy", "Have a house made of pillows", "little"),
    r("Honk like a goose", "Moo like a cow", "little"), r("Have purple skin", "Have green skin", "little"),
    r("Live on the moon", "Live under the sea", "little"), r("Have a lollipop as big as you", "Have a hundred tiny lollipops", "little"),
    r("Wear shoes on your hands", "Wear gloves on your feet", "little"), r("Have a car that flies", "Have a car that swims", "little"),
    r("Play in the snow", "Play at the beach", "little"), r("Be a pirate", "Be an astronaut", "little"),
    r("Have a magic carpet", "Have a magic bike", "little"), r("Eat only red foods", "Eat only yellow foods", "little"),
    r("Be a tiny bug for a day", "Be a giant whale for a day", "little"), r("Have a tongue like a frog", "Have eyes like an owl", "little"),
    r("Never stop giggling", "Never stop hiccupping", "little"), r("Have your own ice cream truck", "Have your own toy store", "little"),
    r("Jump in a pile of leaves", "Jump in a puddle", "little"), r("Ride a camel", "Ride an elephant", "little"),
    r("Have a bedroom in a cloud", "Have a bedroom in a cave", "little"), r("Be a chef", "Be a zookeeper", "little"),
    r("Find a treasure chest", "Find a dinosaur bone", "little"), r("Have wings", "Have a mermaid tail", "little"),
    r("Hop everywhere you go", "Skip everywhere you go", "little"), r("Have an elephant for a friend", "Have a dolphin for a friend", "little"),
    r("Sing everything you say", "Whisper everything you say", "little"), r("Have a giant sandbox", "Have a giant bouncy castle", "little"),
    r("Eat a worm made of gummy", "Eat a spider made of chocolate", "little"), r("Have 10 brothers", "Have 10 sisters", "little"),
    r("Have a pet that can talk", "Have a toy that can walk", "little"), r("Be a farmer", "Be a firefighter", "little"),
    r("Have hair made of spaghetti", "Have fingernails made of candy", "little"), r("Paint with your feet", "Draw with your nose", "little"),
    r("Be able to breathe underwater", "Be able to walk through walls", "big"), r("Have super strength", "Have super speed", "big"),
    r("Know every language", "Play every instrument", "big"), r("Explore outer space", "Explore the deepest ocean", "big"),
    r("Be the fastest runner in the world", "Be the best artist in the world", "big"), r("Have a pet that lives forever", "Have a toy that never breaks", "big"),
    r("Control the weather", "Control time", "big"), r("Be invisible for a day", "Read minds for a day", "big"),
    r("Live in a world with no homework", "Live in a world with no bedtime", "big"), r("Have a giant robot", "Have a tiny dragon", "big"),
    r("Be a famous scientist", "Be a famous athlete", "big"), r("Eat only pizza forever", "Eat only tacos forever", "big"),
    r("Travel back to the dinosaurs", "Travel to the year 3000", "big"), r("Have a photographic memory", "Be able to speak to animals", "big"),
    r("Always be a little too hot", "Always be a little too cold", "big"), r("Climb the tallest mountain", "Sail across the biggest ocean", "big"),
    r("Have a jetpack", "Have a hoverboard", "big"), r("Be the main character in a video game", "Be the main character in a cartoon", "big"),
    r("Have an extra arm", "Have an extra eye on the back of your head", "big"), r("Only be able to whisper", "Only be able to shout", "big"),
    r("Shrink to ant size for an hour", "Grow to skyscraper size for an hour", "big"), r("Be a detective", "Be an inventor", "big"),
    r("Find a secret door in your house", "Find a secret map in your backyard", "big"), r("Have a lifetime supply of ice cream", "Have a lifetime supply of fries", "big"),
    r("Live on a boat", "Live in a camper van", "big"), r("Never lose a board game", "Never lose a race", "big"),
    r("Have a pet shark in a tank", "Have a pet eagle on your shoulder", "big"), r("Teleport anywhere", "Fly anywhere", "big"),
    r("Be able to pause time", "Be able to rewind time", "big"), r("Have a treehouse with a zip line", "Have a basement with a bowling lane", "big"),
    r("Be a wizard in training", "Be a knight in training", "big"), r("Have feet that smell like pizza", "Have hands that are always sticky", "big"),
    r("Speak only in rhymes", "Speak only in questions", "big"), r("Discover a new planet", "Discover a new animal", "big"),
    r("Be an octopus with 8 arms", "Be a centipede with 100 legs", "big"), r("Have unlimited books", "Have unlimited movies", "big"),
    r("Build the tallest sandcastle", "Build the biggest snowman", "big"), r("Have a secret lab", "Have a secret garden", "big"),
    r("Never feel tired", "Never feel hungry", "big"), r("Have a dog that does your chores", "Have a cat that tells jokes", "big"),
    r("Live in a giant pumpkin", "Live in a giant shoe", "big"), r("Breathe fire like a dragon", "Freeze things like a snow queen", "big"),
    r("Race a cheetah", "Arm wrestle a gorilla", "big"), r("Have a hundred tiny puppies", "Have one puppy as big as a horse", "big"),
    r("Be super sticky", "Be super slippery", "big"), r("Live in the past with no screens", "Live in the future with robots", "big"),
    r("Have a magic backpack that holds anything", "Have magic shoes that walk on water", "big"), r("Be the captain of a ship", "Be the pilot of a plane", "big"),
    r("Have your drawings come alive", "Have your dreams come true at night", "big"), r("Win a spelling bee", "Win a science fair", "big"),
    r("Have a lizard tongue", "Have cheetah legs", "big"), r("Eat a sandwich with chocolate and pickles", "Eat a sandwich with peanut butter and onions", "big"),
    r("Be famous for singing", "Be famous for dancing", "big"), r("Have a house full of slides", "Have a house full of trampolines", "big"),
    r("Be able to talk to plants", "Be able to talk to clouds", "big"), r("Own a candy factory", "Own a toy factory", "big"),
    r("Find a dragon egg", "Find a genie lamp", "big"), r("Wear a cape every day", "Wear a crown every day", "big"),
    r("Be best friends with a robot", "Be best friends with an alien", "big"), r("Be stuck in an elevator with a clown", "Be stuck in a tent with a skunk", "big"),
    r("Have ketchup for blood", "Have maple syrup for sweat", "big"), r("Camp in the woods", "Camp on a rooftop", "big"),
    r("Have a never ending pencil", "Have a never ending eraser", "big"), r("Ride a tornado", "Surf a tsunami in a bubble", "big")
  ];

  // ------------------------------------------------------------ license plates
  // s(abbr, name, fact)
  function s(ab, name, fact) { return { ab: ab, name: name, fact: fact }; }
  var STATES = [
    s("AL", "Alabama", "Home to a rocket center where kids go to space camp."),
    s("AK", "Alaska", "The biggest state, with more coastline than all the others combined."),
    s("AZ", "Arizona", "Has a canyon so big you can see it from space."),
    s("AR", "Arkansas", "Has a park where visitors can dig for real diamonds and keep them."),
    s("CA", "California", "Home to the tallest trees on Earth, the giant redwoods."),
    s("CO", "Colorado", "Has more than 50 mountain peaks taller than 14,000 feet."),
    s("CT", "Connecticut", "The first lollipop making machine was built here."),
    s("DE", "Delaware", "The very first state to join the United States."),
    s("DC", "Washington, D.C.", "Not a state, but the capital city where the president lives."),
    s("FL", "Florida", "The only place where alligators and crocodiles live side by side."),
    s("GA", "Georgia", "Famous for peaches and peanuts, and has lots of both."),
    s("HI", "Hawaii", "The only state made entirely of islands, built by volcanoes."),
    s("ID", "Idaho", "Grows more potatoes than any other state."),
    s("IL", "Illinois", "Home to a skyscraper with a glass floor you can stand on way up high."),
    s("IN", "Indiana", "Hosts a famous car race with 500 miles of laps."),
    s("IA", "Iowa", "Grows more corn than any other state."),
    s("KS", "Kansas", "So flat and wide that you can watch storms roll in for miles."),
    s("KY", "Kentucky", "Has the longest cave system in the world under its hills."),
    s("LA", "Louisiana", "Has a bridge over a lake that is almost 24 miles long."),
    s("ME", "Maine", "Famous for lobsters and lighthouses along a rocky coast."),
    s("MD", "Maryland", "Its state sport is jousting, like the knights did."),
    s("MA", "Massachusetts", "The game of basketball was invented here."),
    s("MI", "Michigan", "Shaped like a mitten and touches four of the five Great Lakes."),
    s("MN", "Minnesota", "Known as the land of 10,000 lakes, and it has even more than that."),
    s("MS", "Mississippi", "Named after a huge river that runs down the middle of the country."),
    s("MO", "Missouri", "Has a giant steel arch you can ride to the top of."),
    s("MT", "Montana", "Called Big Sky Country because the sky looks enormous there."),
    s("NE", "Nebraska", "Has a giant forest that people planted by hand, tree by tree."),
    s("NV", "Nevada", "Mostly desert, with a huge dam that holds back a whole river."),
    s("NH", "New Hampshire", "Has a mountain with some of the strongest winds ever measured."),
    s("NJ", "New Jersey", "The first boardwalk by the sea was built here."),
    s("NM", "New Mexico", "Hundreds of hot air balloons fill its sky every fall."),
    s("NY", "New York", "Has a giant green statue holding a torch in the harbor."),
    s("NC", "North Carolina", "The first airplane flight happened on its sandy beaches."),
    s("ND", "North Dakota", "Home to a giant metal sculpture of geese flying along the highway."),
    s("OH", "Ohio", "More astronauts were born here than in most other states."),
    s("OK", "Oklahoma", "The shopping cart was invented here."),
    s("OR", "Oregon", "Has the deepest lake in the country, inside an old volcano."),
    s("PA", "Pennsylvania", "Home to a cracked bell that is a famous symbol of freedom."),
    s("RI", "Rhode Island", "The smallest state, but it has over 400 miles of coastline."),
    s("SC", "South Carolina", "Grows sweet tea, peaches, and lots of palmetto trees."),
    s("SD", "South Dakota", "Has four giant president faces carved into a mountain."),
    s("TN", "Tennessee", "Known for country music and a famous street full of guitar players."),
    s("TX", "Texas", "So big that it takes more than 12 hours to drive across it."),
    s("UT", "Utah", "Has a lake so salty you float on top of the water."),
    s("VT", "Vermont", "Makes more maple syrup than any other state."),
    s("VA", "Virginia", "More presidents were born here than anywhere else."),
    s("WA", "Washington", "Grows more apples than any other state."),
    s("WV", "West Virginia", "Almost entirely covered in mountains, so it is called the Mountain State."),
    s("WI", "Wisconsin", "Makes so much cheese that it is nicknamed America's Dairyland."),
    s("WY", "Wyoming", "Home to the first national park, with geysers that shoot hot water into the air.")
  ];

  // ------------------------------------------------------------ story chain
  var STORY_WORDS = {
    noun: ["banana", "pillow", "toothbrush", "umbrella", "trampoline", "sandwich", "balloon", "sock", "pancake", "backpack",
      "lamp", "teapot", "skateboard", "cactus", "cupcake", "rubber duck", "shoebox", "snow globe", "pogo stick", "taco",
      "marshmallow", "lunchbox", "bathtub", "kite", "pickle", "crayon", "mailbox", "waffle", "mitten", "jellybean",
      "doorknob", "hula hoop", "spoon", "pizza slice", "traffic cone", "bubble wand", "garden gnome", "teddy bear", "bowling ball", "rain boot",
      "hamburger", "paper airplane", "blanket", "trumpet"],
    animal: ["giraffe", "hamster", "penguin", "octopus", "goat", "flamingo", "walrus", "puppy", "kitten", "hedgehog",
      "moose", "llama", "sloth", "chicken", "elephant", "turtle", "bunny", "parrot", "koala", "platypus",
      "squirrel", "pig", "monkey", "duck", "frog", "owl", "zebra", "camel", "panda", "lobster",
      "raccoon", "donkey", "ostrich", "seal", "porcupine", "goose", "dolphin", "snail", "kangaroo", "hippo",
      "cow", "otter", "peacock", "beaver"],
    place: ["the moon", "a pizza shop", "grandma's kitchen", "a bouncy castle", "the dentist's office", "a submarine", "the top of a volcano",
      "a giant shoe", "the school cafeteria", "a candy factory", "the back seat of the car", "a treehouse", "a hot air balloon",
      "the zoo gift shop", "a haunted waffle house", "the library", "a secret cave", "the laundromat", "a pirate ship", "a bubble bath",
      "the bottom of the ocean", "a snow fort", "the mall food court", "a chicken coop", "a rooftop garden", "the principal's office",
      "a roller rink", "an ice cream truck", "a tiny island", "the dog park", "a cloud", "a spaghetti restaurant", "the garage",
      "a jungle gym", "a magic carpet", "a pumpkin patch", "the circus", "a gas station bathroom", "the attic", "a lemonade stand",
      "a parking garage", "the swimming pool", "a corn maze", "a tent in the backyard"],
    verb: ["sneezed", "wiggled", "burped", "tap danced", "hiccupped", "giggled", "bounced", "tiptoed", "yodeled", "juggled",
      "snored", "cartwheeled", "skipped", "squawked", "wobbled", "hopped", "zoomed", "galloped", "tumbled", "waddled",
      "twirled", "flopped", "honked", "sprinted", "crawled", "floated", "moonwalked", "somersaulted", "barked", "sang opera",
      "did jumping jacks", "played the tuba", "painted", "jiggled", "slurped", "stomped", "splashed", "marched", "spun around", "clucked",
      "meowed", "roared", "danced the hula", "did the robot"],
    number: ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
      "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "twenty one", "twenty five", "thirty", "thirty three",
      "forty", "forty two", "fifty", "sixty", "seventy seven", "eighty", "ninety nine", "one hundred", "one hundred and one",
      "two hundred", "five hundred", "one thousand", "a million", "a bazillion", "a gazillion", "a zillion", "a googol", "infinity",
      "seventeen and a half", "eleventy", "too many"]
  };
  // Templates use {noun} {animal} {place} {verb} {number}. A slot letter may repeat; each use is filled separately.
  var STORIES = [
    "Once upon a time, a {animal} found a {noun} in {place}. It {verb} with joy, then {verb} {number} times before lunch.",
    "My teacher said to bring a {noun} to school, but I brought a {animal} instead. It {verb} all over {place}. We did not get a gold star.",
    "On the way to {place}, our car was stopped by {number} {animal}s. Dad {verb}, Mom {verb}, and I waved a {noun} out the window.",
    "The world record for the most {noun}s balanced on a {animal} is {number}. It happened in {place}, and the crowd {verb}.",
    "Dear diary, today I {verb} in {place}. A {animal} saw me and {verb} too. Then we shared a {noun}. Best day ever.",
    "Breaking news! A giant {noun} has landed in {place}. Scientists say it {verb} {number} times, then asked for a {animal}.",
    "Grandpa says when he was little, he walked {number} miles to {place} carrying a {noun}. A {animal} {verb} behind him the whole way.",
    "If I were a {animal}, I would live in {place}, eat {number} {noun}s a day, and I would have {verb} all day long.",
    "The {animal} opened a shop in {place} that only sold {noun}s. On the first day, {number} customers {verb} in the line.",
    "At the big race, a {animal} {verb} past the finish line holding a {noun}. The prize was a trip to {place} for {number} days.",
    "Warning: do not feed the {animal} any {noun}s. Last time, it {verb} for {number} hours and had to be carried to {place}.",
    "The recipe calls for {number} {noun}s, one {animal} hug, and a pinch of {place}. Stir until it {verb}.",
    "My little brother {verb} so loudly in {place} that a {animal} dropped its {noun}. He said sorry {number} times.",
    "Captain {animal} steered the ship toward {place}. Suddenly, the crew {verb}. Someone had packed {number} {noun}s instead of food.",
    "Knock knock. Who is there? A {animal} with a {noun}. It {verb} all the way from {place}, and it brought {number} friends.",
    "The {animal} wanted to be an astronaut. It built a rocket from a {noun}, {verb} to {place}, and counted {number} stars.",
    "Today in {place}, the weather is cloudy with a chance of {noun}s. Expect {number} {animal}s to come inside after they {verb}.",
    "Once a {animal} tried to hide a {noun} in {place}. It {verb} every time someone walked by. It took {number} tries to stay quiet.",
    "The mayor of {place} is a {animal}. Its first law: everyone must carry a {noun} and everyone must have {verb} at least once before Tuesday.",
    "I had a dream that my bed turned into a {noun}. It {verb} to {place}, where {number} {animal}s were having a tea party.",
    "At the talent show, a {animal} {verb} while balancing a {noun} on its nose. The judges flew in from {place} and gave it {number} points.",
    "Lost: one {noun}. Last seen in {place} with a {animal}. If found, check whether it has {verb}. Reward: {number} hugs.",
    "The slowest {animal} in the world finally reached {place} after {number} years. It {verb}, picked up a {noun}, and headed home.",
    "There is a secret club in {place}. To join, you must {verb} like a {animal}, bring a {noun}, and know the password, which is {number}."
  ];

  // ------------------------------------------------------------ riddles and jokes
  // rd(q, a, tier)
  function rd(q, a, tier) { return { q: q, a: a, tier: tier }; }
  var RIDDLES = [
    rd("What has hands but cannot clap?", "A clock.", "little"), rd("What has a face but no eyes?", "A clock.", "little"),
    rd("What gets wetter the more it dries?", "A towel.", "little"), rd("What has teeth but cannot bite?", "A comb.", "little"),
    rd("What has legs but cannot walk?", "A table.", "little"), rd("What goes up but never comes down?", "Your age.", "little"),
    rd("What is full of holes but still holds water?", "A sponge.", "little"), rd("What has a neck but no head?", "A bottle.", "little"),
    rd("What has one eye but cannot see?", "A needle.", "little"), rd("What kind of band never plays music?", "A rubber band.", "little"),
    rd("What has keys but cannot open doors?", "A piano.", "little"), rd("What is black and white and read all over?", "A newspaper.", "little"),
    rd("What has a tail and a head but no body?", "A coin.", "little"), rd("What can you catch but never throw?", "A cold.", "little"),
    rd("What building has the most stories?", "The library.", "little"), rd("What has an eye but cannot wink?", "A hurricane.", "little"),
    rd("What animal is always at a baseball game?", "A bat.", "little"), rd("What do you call a bear with no teeth?", "A gummy bear.", "little"),
    rd("What has ears but cannot hear?", "Corn.", "little"), rd("What kind of room has no doors or windows?", "A mushroom.", "little"),
    rd("What falls but never gets hurt?", "Rain.", "little"), rd("What has a bottom at the top?", "Your legs.", "little"),
    rd("What is orange and sounds like a parrot?", "A carrot.", "little"), rd("What can you hold without touching it?", "Your breath.", "little"),
    rd("What has a thumb and four fingers but is not alive?", "A glove.", "little"), rd("What goes through towns and over hills but never moves?", "A road.", "little"),
    rd("What do you have to break before you can use it?", "An egg.", "little"), rd("What kind of coat is best put on wet?", "A coat of paint.", "little"),
    rd("What is the biggest ant in the world?", "An elephant.", "little"), rd("Where do cows go for fun?", "The moo-vies.", "little"),
    rd("What has four wheels and flies?", "A garbage truck.", "little"), rd("What runs around the yard but never moves?", "A fence.", "little"),
    rd("What do you call a sleeping dinosaur?", "A dino-snore.", "little"), rd("What has a ring but no finger?", "A telephone.", "little"),
    rd("I am tall when I am young and short when I am old. What am I?", "A candle.", "little"), rd("What kind of tree fits in your hand?", "A palm tree.", "little"),
    rd("What has lots of needles but does not sew?", "A pine tree.", "little"), rd("What is always in front of you but cannot be seen?", "The future.", "little"),
    rd("What begins with T, ends with T, and has T in it?", "A teapot.", "little"), rd("What do you call a fly without wings?", "A walk.", "little"),
    rd("What has many keys but cannot unlock anything, and also has a mouse?", "A computer.", "big"), rd("What can travel around the world while staying in a corner?", "A stamp.", "big"),
    rd("The more you take, the more you leave behind. What are they?", "Footsteps.", "big"), rd("What has cities but no houses, forests but no trees, and water but no fish?", "A map.", "big"),
    rd("What belongs to you but other people use it more than you do?", "Your name.", "big"), rd("I have branches but no fruit, trunk, or leaves. What am I?", "A bank.", "big"),
    rd("What can fill a room but takes up no space?", "Light.", "big"), rd("What gets bigger the more you take away from it?", "A hole.", "big"),
    rd("What month of the year has 28 days?", "All of them.", "big"), rd("If you drop me I am sure to crack, but give me a smile and I will smile back. What am I?", "A mirror.", "big"),
    rd("What word is spelled wrong in every dictionary?", "Wrong.", "big"), rd("What has 13 hearts but no other organs?", "A deck of cards.", "big"),
    rd("What invention lets you look right through a wall?", "A window.", "big"), rd("Where does today come before yesterday?", "In the dictionary.", "big"),
    rd("What is so fragile that saying its name breaks it?", "Silence.", "big"), rd("What has a head and a tail but no legs, and is not a snake?", "A coin.", "big"),
    rd("What can you keep after giving it to someone?", "Your word.", "big"), rd("What kind of cup cannot hold water?", "A cupcake.", "big"),
    rd("I am not alive, but I grow. I have no lungs, but I need air. What am I?", "Fire.", "big"), rd("What question can you never answer yes to?", "Are you asleep yet?", "big"),
    rd("Forward I am heavy, backward I am not. What am I?", "The word ton.", "big"), rd("What has words but never speaks?", "A book.", "big"),
    rd("What runs but never walks, has a mouth but never talks?", "A river.", "big"), rd("A cowboy rides into town on Friday, stays three days, and leaves on Friday. How?", "His horse is named Friday.", "big"),
    rd("What goes up and down but never moves?", "A staircase.", "big"), rd("What has a spine but no bones?", "A book.", "big"),
    rd("What can you break without touching it?", "A promise.", "big"), rd("What is at the end of a rainbow?", "The letter W.", "big"),
    rd("Which weighs more, a pound of feathers or a pound of bricks?", "Neither, they both weigh a pound.", "big"), rd("What five letter word becomes shorter when you add two letters?", "Short.", "big"),
    rd("What has a bed but never sleeps?", "A river.", "big"), rd("How many months have 31 days?", "Seven.", "big"),
    rd("What starts with E, ends with E, but only has one letter in it?", "An envelope.", "big"), rd("What is always coming but never arrives?", "Tomorrow.", "big"),
    rd("What kind of ship has two mates but no captain?", "A friendship.", "big"), rd("You see me once in June, twice in November, and not at all in May. What am I?", "The letter E.", "big"),
    rd("What flies without wings and cries without eyes?", "A cloud.", "big"), rd("What has four fingers and a thumb but is not a hand?", "A glove.", "big"),
    rd("What occurs once in a minute, twice in a moment, and never in a thousand years?", "The letter M.", "big"), rd("A plane crashes exactly on the border of two countries. Where do they bury the survivors?", "Nowhere, survivors are alive.", "big"),
    rd("What can run but never walks, has a bed but never sleeps, and has a head but never weeps?", "A river.", "big"), rd("What has one head, one foot, and four legs?", "A bed.", "big"),
    rd("What is easy to get into but hard to get out of?", "Trouble.", "big"), rd("If two is company and three is a crowd, what are four and five?", "Nine.", "big")
  ];
  // j(setup, punchline, tier)
  function j(q, a, tier) { return { q: q, a: a, tier: tier }; }
  var JOKES = [
    j("Why did the cow cross the road?", "To get to the udder side.", "little"), j("What do you call a dinosaur that is sleeping?", "A dino-snore.", "little"),
    j("Why did the banana go to the doctor?", "It was not peeling well.", "little"), j("What does a cloud wear under its raincoat?", "Thunderwear.", "little"),
    j("What do you call a pig that does karate?", "A pork chop.", "little"), j("Why was six afraid of seven?", "Because seven eight nine.", "little"),
    j("What do you call a boomerang that will not come back?", "A stick.", "little"), j("What is a cat's favorite color?", "Purr-ple.", "little"),
    j("Why did the teddy bear say no to dessert?", "Because it was stuffed.", "little"), j("What do you call a dog magician?", "A labracadabrador.", "little"),
    j("How do you make a tissue dance?", "Put a little boogie in it.", "little"), j("What is a snake's favorite subject?", "Hiss-tory.", "little"),
    j("Where do pencils go on vacation?", "Pencil-vania.", "little"), j("Why did the cookie go to the doctor?", "It felt crummy.", "little"),
    j("What do you call cheese that is not yours?", "Nacho cheese.", "little"), j("What kind of key opens a banana?", "A mon-key.", "little"),
    j("Why do bees have sticky hair?", "Because they use honeycombs.", "little"), j("What do you call a sleeping bull?", "A bulldozer.", "little"),
    j("What did one wall say to the other wall?", "Meet you at the corner.", "little"), j("Why did the chicken join a band?", "Because it had drumsticks.", "little"),
    j("What do you call a bear in the rain?", "A drizzly bear.", "little"), j("What is a frog's favorite drink?", "Croak-a-cola.", "little"),
    j("What do you get when you cross a snowman and a dog?", "Frostbite.", "little"), j("Why can't you give Elsa a balloon?", "Because she will let it go.", "little"),
    j("What did the ocean say to the beach?", "Nothing, it just waved.", "little"), j("Why did the kid bring a ladder to school?", "To get to high school.", "little"),
    j("What do you call a fish with no eyes?", "A fsh.", "little"), j("What has four wheels and goes moo?", "A cow on a skateboard.", "little"),
    j("Why did the tomato turn red?", "Because it saw the salad dressing.", "little"), j("What do you call a funny mountain?", "Hill-arious.", "little"),
    j("What is a tree's favorite drink?", "Root beer.", "little"), j("Why did the duck get a red card?", "For fowl play.", "little"),
    j("What do you call a cow with no legs?", "Ground beef.", "little"), j("What kind of shoes do frogs wear?", "Open toad.", "little"),
    j("How does a penguin build a house?", "Igloos it together.", "little"), j("What is a pirate's favorite letter?", "You would think R, but it is the C.", "little"),
    j("What did the big flower say to the little flower?", "Hi, bud.", "little"), j("What do you call a lazy kangaroo?", "A pouch potato.", "little"),
    j("Why did the bicycle fall over?", "It was two tired.", "little"), j("What do you call a dinosaur with a big vocabulary?", "A thesaurus.", "little"),
    j("What did the zero say to the eight?", "Nice belt.", "big"), j("Why do not scientists trust atoms?", "Because they make up everything.", "big"),
    j("What do you call fake spaghetti?", "An impasta.", "big"), j("Why did the math book look sad?", "It had too many problems.", "big"),
    j("What do you call a can opener that does not work?", "A can't opener.", "big"), j("Why did the scarecrow win an award?", "He was outstanding in his field.", "big"),
    j("What is brown and sticky?", "A stick.", "big"), j("What do you call an alligator in a vest?", "An investigator.", "big"),
    j("Why did the golfer bring two pairs of pants?", "In case he got a hole in one.", "big"), j("What did the janitor say when he jumped out of the closet?", "Supplies!", "big"),
    j("What kind of music do planets like?", "Neptunes.", "big"), j("Why was the computer cold?", "It left its Windows open.", "big"),
    j("What do you call a factory that makes okay products?", "A satisfactory.", "big"), j("What did the left eye say to the right eye?", "Between you and me, something smells.", "big"),
    j("Why did the student eat his homework?", "The teacher said it was a piece of cake.", "big"), j("What do you call a belt made of watches?", "A waist of time.", "big"),
    j("How does the moon cut its hair?", "Eclipse it.", "big"), j("What did one plate say to the other?", "Dinner is on me.", "big"),
    j("Why did the drum take a nap?", "It was beat.", "big"), j("What do you call a deer with no eyes?", "No idea.", "big"),
    j("Why are elevator jokes so good?", "They work on many levels.", "big"), j("What did the grape do when it got stepped on?", "It let out a little wine.", "big"),
    j("What do you call a pile of cats?", "A meow-tain.", "big"), j("Why did the picture go to jail?", "It was framed.", "big"),
    j("What do you call a snowman with a six pack?", "An abdominal snowman.", "big"), j("What is the best thing about Switzerland?", "I do not know, but the flag is a big plus.", "big"),
    j("Why could the pony not sing?", "It was a little hoarse.", "big"), j("What is a robot's favorite snack?", "Computer chips.", "big"),
    j("Why did the stadium get hot after the game?", "All the fans left.", "big"), j("What did the limestone say to the geologist?", "Do not take me for granite.", "big"),
    j("How do you organize a space party?", "You planet.", "big"), j("Why did the skeleton not go to the dance?", "He had no body to go with.", "big"),
    j("What do you call a sheep with no legs?", "A cloud.", "big"), j("What washes up on tiny beaches?", "Microwaves.", "big"),
    j("Why did the coffee file a police report?", "It got mugged.", "big"), j("What do you call a fish wearing a bow tie?", "Sofishticated.", "big"),
    j("Why do seagulls fly over the sea?", "Because if they flew over the bay they would be bagels.", "big"), j("What did the traffic light say to the car?", "Do not look, I am changing.", "big"),
    j("Why is Peter Pan always flying?", "He neverlands.", "big"), j("What do you call a dog that can do magic and tell time?", "A watch dog with a wand.", "big"),
    j("Why did the clock get kicked out of the library?", "It tocked too much.", "big"), j("What did the paper say to the pencil?", "Write on!", "big")
  ];

  // ------------------------------------------------------------ count it
  var COUNTABLES = [
    { id: "redcars", label: "Red cars", emoji: "🚗", color: "#D9663A" }, { id: "trucks", label: "Big trucks", emoji: "🚚", color: "#3A72C4" },
    { id: "motorcycles", label: "Motorcycles", emoji: "🏍️", color: "#8A5CC4" }, { id: "cows", label: "Cows", emoji: "🐄", color: "#4A9A5A" },
    { id: "dogs", label: "Dogs", emoji: "🐕", color: "#C99A2E" }, { id: "buses", label: "Buses", emoji: "🚌", color: "#F08A2E" },
    { id: "bridges", label: "Bridges", emoji: "🌉", color: "#5A7A8A" }, { id: "horses", label: "Horses", emoji: "🐴", color: "#8A5A36" },
    { id: "whitecars", label: "White cars", emoji: "🚙", color: "#7B7064" }, { id: "birds", label: "Birds", emoji: "🐦", color: "#3A9AA8" },
    { id: "flags", label: "Flags", emoji: "🚩", color: "#B8452A" }, { id: "tractors", label: "Tractors", emoji: "🚜", color: "#6A8A2E" }
  ];

  // Avatars for the player roster.
  var AVATARS = ["🦊", "🐼", "🐸", "🦄", "🐯", "🐙", "🦖", "🐧", "🐨", "🦋", "🐶", "🐱"];

  return {
    BINGO: BINGO, ISPY_COLOURS: ISPY_COLOURS, ISPY_LETTERS: ISPY_LETTERS, ISPY_LETTERS_BIG: ISPY_LETTERS_BIG, ISPY_SHAPES: ISPY_SHAPES,
    TWENTY: TWENTY, RATHER: RATHER, STATES: STATES, STORY_WORDS: STORY_WORDS, STORIES: STORIES,
    RIDDLES: RIDDLES, JOKES: JOKES, COUNTABLES: COUNTABLES, AVATARS: AVATARS
  };
});
