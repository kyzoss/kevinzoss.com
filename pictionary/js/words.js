// The word bank. Every word carries a level so a mixed-age table can share one
// game: the four-year-old draws "sun", the ten-year-old draws "lighthouse".
//   1 = Little (4-5)   short, concrete, drawable in a few shapes
//   2 = Kids (6-7)     a little more detail or a two-part idea
//   3 = Big Kids (8-10) compound things, places, actions, trickier ideas
// Format: "emoji|word|level". The emoji is the drawer's picture clue, so a
// pre-reader can play without reading. Words with no good emoji leave it blank
// and the card shows the category's emoji instead.

window.CATEGORIES = [
  {
    // Special: the drawer's Character Studio character starts on the page and
    // the drawer draws what it's up to. Guessers guess the adventure.
    id: 'adventures', name: 'Character Adventures', emoji: '🎭', color: '#FF4FA3', character: true,
    words: [
      '🍦|eating ice cream|1', '😴|sleeping|1', '🎈|holding balloons|1', '🌧️|in the rain|1',
      '☀️|at the beach|1', '🎂|having a birthday|1', '⛄|making a snowman|1', '🍕|eating pizza|1',
      '🚀|flying to space|2', '🚲|riding a bike|2', '⚽|playing soccer|2', '🏰|at a castle|2',
      '🐶|walking a dog|2', '🛁|taking a bath|2', '🌳|climbing a tree|2', '🎣|fishing|2',
      '🌊|surfing a wave|2', '🪁|flying a kite|2', '🏊|swimming|2', '🎸|playing guitar|2',
      '🦖|running from a dinosaur|3', '🏕️|camping|3', '🎢|on a roller coaster|3',
      '🧑‍🍳|baking cookies|3', '🛸|meeting an alien|3', '🏴‍☠️|finding treasure|3',
      '🎤|singing on stage|3', '⛷️|skiing down a mountain|3', '🚒|putting out a fire|3',
      '🪐|landing on a planet|3', '🌋|escaping a volcano|3', '🧜|swimming with a mermaid|3',
    ],
  },
  {
    id: 'animals', name: 'Animals', emoji: '🐶', color: '#FF8A3D',
    words: [
      '🐶|dog|1', '🐱|cat|1', '🐟|fish|1', '🐦|bird|1', '🐍|snake|1', '🐢|turtle|1',
      '🐷|pig|1', '🐮|cow|1', '🐰|bunny|1', '🐻|bear|1', '🐭|mouse|1', '🐞|ladybug|1',
      '🐌|snail|1', '🦆|duck|1', '🐸|frog|1', '🐛|caterpillar|2', '🦒|giraffe|2',
      '🐘|elephant|2', '🦁|lion|2', '🐵|monkey|2', '🐧|penguin|2', '🦋|butterfly|2',
      '🐝|bee|2', '🕷️|spider|2', '🦀|crab|2', '🐙|octopus|2', '🦓|zebra|2', '🐴|horse|2',
      '🐑|sheep|2', '🦉|owl|2', '🐊|crocodile|3', '🦘|kangaroo|3', '🦔|hedgehog|3',
      '🦩|flamingo|3', '🦇|bat|3', '🦚|peacock|3', '🦦|otter|3', '🦥|sloth|3',
      '🐿️|squirrel|3', '🦨|skunk|3', '🦫|beaver|3', '🐪|camel|3', '🦏|rhino|3',
    ],
  },
  {
    id: 'food', name: 'Yummy Food', emoji: '🍕', color: '#FF5E7A',
    words: [
      '🍎|apple|1', '🍌|banana|1', '🍕|pizza|1', '🍦|ice cream|1', '🍪|cookie|1',
      '🎂|cake|1', '🥚|egg|1', '🍇|grapes|1', '🥕|carrot|1', '🍓|strawberry|1',
      '🍩|donut|1', '🧀|cheese|1', '🍔|hamburger|2', '🌭|hot dog|2', '🍉|watermelon|2',
      '🥞|pancakes|2', '🍭|lollipop|2', '🌽|corn|2', '🍝|spaghetti|2', '🥨|pretzel|2',
      '🍿|popcorn|2', '🧁|cupcake|2', '🍍|pineapple|2', '🌮|taco|2', '🍋|lemon|2',
      '🥪|sandwich|3', '🍣|sushi|3', '🥥|coconut|3', '🍗|chicken leg|3', '🥦|broccoli|3',
      '🧇|waffle|3', '🍫|chocolate bar|3', '🥜|peanut|3', '🍄|mushroom|3', '🥐|croissant|3',
      '🍜|noodle soup|3', '🥓|bacon|3',
    ],
  },
  {
    id: 'home', name: 'Around the House', emoji: '🏠', color: '#7C5CFF',
    words: [
      '🏠|house|1', '🛏️|bed|1', '🪑|chair|1', '🚪|door|1', '🧸|teddy bear|1', '⚽|ball|1',
      '📚|book|1', '🥄|spoon|1', '☂️|umbrella|1', '🔑|key|1', '🧦|sock|1', '👟|shoe|1',
      '🕰️|clock|2', '📺|TV|2', '🛁|bathtub|2', '🪥|toothbrush|2', '💡|light bulb|2',
      '🎈|balloon|2', '🧢|hat|2', '👓|glasses|2', '✂️|scissors|2', '🕯️|candle|2',
      '🎁|present|2', '🪞|mirror|3', '🛋️|couch|3', '🧺|laundry basket|3', '🚽|toilet|3',
      '📱|phone|3', '💻|laptop|3', '🧹|broom|3', '🪜|ladder|3', '🔦|flashlight|3',
      '⏰|alarm clock|3', '🎧|headphones|3', '🧽|sponge|3',
    ],
  },
  {
    id: 'nature', name: 'Outside & Nature', emoji: '🌳', color: '#2EBF6A',
    words: [
      '☀️|sun|1', '🌙|moon|1', '⭐|star|1', '🌳|tree|1', '🌸|flower|1', '☁️|cloud|1',
      '🌈|rainbow|1', '🍂|leaf|1', '🪨|rock|1', '💧|rain|1', '⛄|snowman|1',
      '🌵|cactus|2', '⛰️|mountain|2', '🌊|wave|2', '⚡|lightning|2', '🔥|fire|2',
      '❄️|snowflake|2', '🌻|sunflower|2', '🏝️|island|2', '🌋|volcano|3', '🌪️|tornado|3',
      '🏕️|camping|3', '🍁|maple leaf|3', '🌴|palm tree|3', '🪺|bird nest|3',
      '🌄|sunrise|3', '🏞️|waterfall|3', '🌱|sprout|3',
    ],
  },
  {
    id: 'vehicles', name: 'Things That Go', emoji: '🚗', color: '#2D9CFF',
    words: [
      '🚗|car|1', '🚌|bus|1', '🚂|train|1', '✈️|airplane|1', '⛵|boat|1', '🚲|bike|1',
      '🚀|rocket|1', '🚒|fire truck|2', '🚑|ambulance|2', '🚁|helicopter|2', '🚜|tractor|2',
      '🛴|scooter|2', '🏎️|race car|2', '🚓|police car|2', '🛸|UFO|2', '🛹|skateboard|2',
      '🚤|speedboat|3', '🚢|ship|3', '🛶|canoe|3', '🚠|cable car|3', '🎈|hot air balloon|3',
      '🚧|road work|3', '🛺|tuk tuk|3', '🚛|big truck|3', '🛞|wheel|3', '🚦|traffic light|3',
    ],
  },
  {
    id: 'ocean', name: 'Under the Sea', emoji: '🐳', color: '#16B8C8',
    words: [
      '🐟|fish|1', '🐳|whale|1', '🦀|crab|1', '🐙|octopus|1', '🐚|seashell|1',
      '⭐|starfish|1', '🦈|shark|2', '🐬|dolphin|2', '🐢|sea turtle|2', '🪼|jellyfish|2',
      '🦞|lobster|2', '🐡|pufferfish|2', '⚓|anchor|2', '🧜|mermaid|2', '🦭|seal|3',
      '🐠|clownfish|3', '🦑|squid|3', '🤿|scuba diver|3', '🏴‍☠️|pirate ship|3', '🪸|coral|3',
      '🗺️|treasure map|3', '🦐|shrimp|3',
    ],
  },
  {
    id: 'space', name: 'Outer Space', emoji: '🚀', color: '#5B4BDB',
    words: [
      '🚀|rocket|1', '🌙|moon|1', '⭐|star|1', '☀️|sun|1', '👽|alien|2', '🪐|planet|2',
      '🛸|flying saucer|2', '🧑‍🚀|astronaut|2', '☄️|comet|2', '🌍|earth|2', '🔭|telescope|3',
      '🛰️|satellite|3', '🌌|galaxy|3', '🌠|shooting star|3', '🌑|crater|3', '🧪|space lab|3',
    ],
  },
  {
    id: 'pretend', name: 'Make-Believe', emoji: '🦄', color: '#E94FD1',
    words: [
      '🦄|unicorn|1', '👻|ghost|1', '👑|crown|1', '🏰|castle|1', '🐉|dragon|2',
      '🧚|fairy|2', '🧙|wizard|2', '🤖|robot|2', '🧜|mermaid|2', '🪄|magic wand|2',
      '🦸|superhero|2', '🏴‍☠️|pirate|2', '🧌|troll|3', '🧛|vampire|3', '🧞|genie|3',
      '🔮|crystal ball|3', '🗡️|sword|3', '🛡️|shield|3', '🦖|dinosaur|1', '🧟|zombie|3',
      '🐲|baby dragon|3', '💎|treasure|2', '🎩|magic hat|3',
    ],
  },
  {
    id: 'play', name: 'Sports & Play', emoji: '⚽', color: '#FFB800',
    words: [
      '⚽|soccer ball|1', '🎈|balloon|1', '🪁|kite|1', '🏀|basketball|2', '🏈|football|2',
      '⚾|baseball|2', '🛝|slide|2', '🎾|tennis|2', '🏊|swimming|2', '🎳|bowling|2',
      '🪀|yo-yo|2', '🛼|roller skates|2', '🏓|ping pong|3', '⛸️|ice skating|3', '🏄|surfing|3',
      '🎯|target|3', '🥅|goal|3', '🏆|trophy|3', '⛳|golf|3', '🤸|cartwheel|3',
      '🎠|carousel|3', '🎢|roller coaster|3', '🏕️|tent|3', '🧩|puzzle|2',
    ],
  },
  {
    id: 'people', name: 'People & Jobs', emoji: '👩‍🚒', color: '#FF7043',
    words: [
      '👶|baby|1', '🤡|clown|2', '👩‍🍳|chef|2', '👨‍🚒|firefighter|2', '👮|police officer|2',
      '👩‍⚕️|doctor|2', '👑|king|2', '👸|princess|2', '🥷|ninja|2', '🤠|cowboy|2',
      '👷|builder|3', '👩‍🌾|farmer|3', '👩‍🎨|artist|3', '🧑‍🏫|teacher|3', '💂|guard|3',
      '🧑‍🔬|scientist|3', '🕵️|detective|3', '🎅|Santa|2', '🧑‍✈️|pilot|3', '💇|hairdresser|3',
    ],
  },
  {
    id: 'body', name: 'My Body', emoji: '🖐️', color: '#F26B9C',
    words: [
      '👁️|eye|1', '👃|nose|1', '👄|mouth|1', '🖐️|hand|1', '🦶|foot|1', '👂|ear|1',
      '🦷|tooth|2', '💪|muscle|2', '🧠|brain|3', '❤️|heart|1', '😊|smile|1', '🦴|bone|2',
      '👅|tongue|2', '😢|crying|2', '😴|sleeping|2', '🤧|sneeze|3', '🥱|yawn|3',
    ],
  },
  {
    id: 'actions', name: 'Act It Out', emoji: '🏃', color: '#00A88F',
    words: [
      '🏃|running|2', '😴|sleeping|1', '🦘|jumping|2', '🏊|swimming|2', '💃|dancing|2',
      '🎤|singing|2', '😂|laughing|2', '🍽️|eating|2', '🧗|climbing|3', '🎣|fishing|3',
      '🧹|sweeping|3', '🚿|taking a shower|3', '🎁|opening a present|3', '🛌|going to bed|3',
      '👋|waving|2', '🙌|high five|3', '🤗|hugging|2', '🫧|blowing bubbles|3',
      '🥾|hiking|3', '🧘|yoga|3', '🍳|cooking|3', '🎨|painting|3',
    ],
  },
  {
    id: 'weather', name: 'Weather & Seasons', emoji: '🌦️', color: '#4AA8FF',
    words: [
      '☀️|sunny|1', '🌧️|rainy|1', '⛄|snowman|1', '🌈|rainbow|1', '❄️|snow|1',
      '⛈️|thunderstorm|2', '🌬️|windy|2', '🌂|umbrella|2', '🧤|mittens|2', '🧣|scarf|2',
      '🏖️|beach day|3', '🍂|fall leaves|3', '🌡️|thermometer|3', '🌫️|foggy|3', '🌷|spring|3',
    ],
  },
  {
    id: 'holidays', name: 'Holidays & Parties', emoji: '🎉', color: '#FF4D4D',
    words: [
      '🎂|birthday cake|1', '🎈|balloon|1', '🎁|gift|1', '🎃|pumpkin|1', '🎄|Christmas tree|2',
      '🎅|Santa|2', '⛄|snowman|1', '🦃|turkey|2', '🐣|chick|2', '🥚|Easter egg|2',
      '🎆|fireworks|2', '🧦|stocking|3', '🔔|bell|2', '🦌|reindeer|3', '🕎|menorah|3',
      '💝|valentine|3', '🍀|four-leaf clover|3', '🧙‍♀️|witch|2', '🍬|candy|1', '🎉|party|3',
      '🪅|piñata|3', '🏮|lantern|3',
    ],
  },
  {
    id: 'music', name: 'Music & Art', emoji: '🎸', color: '#9C27B0',
    words: [
      '🥁|drum|1', '🎸|guitar|2', '🎹|piano|2', '🎺|trumpet|3', '🎻|violin|3', '🎤|microphone|2',
      '🖍️|crayon|1', '🎨|paint|2', '🖌️|paintbrush|2', '✏️|pencil|1', '🎵|music note|2',
      '🪇|maracas|3', '🎷|saxophone|3', '🪈|flute|3', '🖼️|picture frame|3', '📷|camera|3',
    ],
  },
  {
    id: 'places', name: 'Places to Go', emoji: '🏰', color: '#8D6E63',
    words: [
      '🏠|home|1', '🏫|school|2', '🏖️|beach|2', '🏥|hospital|3', '🏰|castle|1', '⛺|tent|2',
      '🎡|ferris wheel|3', '🗼|tower|3', '🌉|bridge|3', '🏟️|stadium|3', '⛪|church|3',
      '🏪|store|3', '🛝|playground|2', '🏙️|city|3', '🗽|Statue of Liberty|3', '🎪|circus|2',
      '|lighthouse|3', '🏛️|museum|3', '🐒|zoo|2', '🚏|bus stop|3',
    ],
  },
];

// Parse once into objects. Same word in two categories (fish, rocket) stays two
// entries on purpose: the category hint should match the card the drawer got.
window.CATEGORIES.forEach((cat) => {
  cat.words = cat.words.map((w) => {
    const [emoji, word, level] = w.split('|');
    return { emoji: emoji || cat.emoji, word, level: Number(level), cat: cat.id };
  });
});
