// Content for the screen-light games: Quiz Quest questions, Story Spinner
// pieces, I Spy Bingo lists, and the Silly Mashup halves for Pictionary and
// Charades. Levels match the word bank: 1 = ages 4-5, 2 = 6-7, 3 = 8-10.
(function () {
  // ---------------- Silly Mashups ----------------
  // "koala" + "playing a trumpet". Every subject and action is drawable and
  // actable on its own, so any pair works.
  const SILLY_SUBJECTS = [
    '🐱|cat|1', '🐶|dog|1', '🐷|pig|1', '🐮|cow|1', '🦆|duck|1', '🐸|frog|1', '🐻|bear|1', '🐟|fish|1',
    '🐰|bunny|1', '🐍|snake|1', '🐵|monkey|1', '🦁|lion|1', '🤖|robot|1', '👻|ghost|1', '⛄|snowman|1',
    '🦖|dinosaur|1', '🦄|unicorn|1', '👶|baby|1', '🐧|penguin|1', '🐘|elephant|1',
    '🐨|koala|2', '🦒|giraffe|2', '🐙|octopus|2', '🦈|shark|2', '🏴‍☠️|pirate|2', '🧑‍🚀|astronaut|2',
    '🧙|wizard|2', '🐔|chicken|2', '🦀|crab|2', '🐢|turtle|2', '👽|alien|2', '🧜|mermaid|2', '🐉|dragon|2',
    '👵|grandma|2', '🍌|banana|2', '🦊|fox|2',
    '🦩|flamingo|3', '🦥|sloth|3', '🦔|hedgehog|3', '🦘|kangaroo|3', '🌵|cactus|3', '🦸|superhero|3',
    '🥷|ninja|3', '🧛|vampire|3', '🧑‍🍳|chef|3', '🦨|skunk|3', '🦙|llama|3', '🦭|seal|3', '🧟|zombie|3', '🦚|peacock|3',
  ];
  const SILLY_ACTIONS = [
    '🍦|eating ice cream|1', '🚲|riding a bike|1', '👑|wearing a crown|1', '🛏️|sleeping in a bed|1',
    '🎈|holding a balloon|1', '🍕|eating pizza|1', '🛁|taking a bath|1', '⚽|playing soccer|1',
    '📚|reading a book|1', '🕶️|wearing sunglasses|1', '🪁|flying a kite|1', '🪥|brushing its teeth|1',
    '🎺|playing a trumpet|2', '🛹|riding a skateboard|2', '🥁|playing the drums|2', '🚗|driving a car|2',
    '🏊|swimming in a pool|2', '🎂|baking a cake|2', '🩰|wearing a tutu|2', '🎸|playing guitar|2',
    '🏄|surfing a wave|2', '🤹|juggling|2', '🛼|roller skating|2', '🚀|flying a rocket|2', '🎣|fishing|2', '🎨|painting a picture|2',
    '🤸|doing a cartwheel|3', '🧗|climbing a mountain|3', '⛸️|ice skating|3', '🏋️|lifting weights|3',
    '🎾|playing tennis|3', '🎢|riding a roller coaster|3', '🧘|doing yoga|3', '⛺|camping in a tent|3',
    '🎻|playing the violin|3', '⛷️|skiing|3', '🤿|scuba diving|3', '🎳|bowling|3',
  ];
  const split = (s) => { const [emoji, word, level] = s.split('|'); return { emoji, word, level: Number(level) }; };
  const SUBJ = SILLY_SUBJECTS.map(split), ACT = SILLY_ACTIONS.map(split);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function sillyCard(level, avoid) {
    for (let tries = 0; tries < 40; tries++) {
      const s = pick(SUBJ.filter((x) => x.level <= level));
      const a = pick(ACT.filter((x) => x.level <= level));
      const word = s.word + ' ' + a.word;
      if (avoid && avoid.includes(word)) continue;
      return { emoji: s.emoji + a.emoji, word, level: Math.max(s.level, a.level), cat: 'silly', silly: true };
    }
    return null;
  }

  // ---------------- Quiz Quest ----------------
  const QUIZ_CATS = {
    an: ['🐾', 'Animals'], sc: ['🔬', 'Science'], wo: ['🌎', 'World'], wd: ['🔤', 'Words'], nu: ['🔢', 'Numbers'],
    pa: ['🧩', 'Patterns'], bo: ['🫀', 'My Body'], fo: ['🍎', 'Food'], sp: ['🚀', 'Space'], ri: ['🤔', 'Riddles'],
    co: ['🎨', 'Colors & Shapes'],
  };
  // "category|level|question|answer"
  const QUIZ = [
    // ----- Ages 4-5 -----
    'co|1|What color is a banana?|Yellow', 'co|1|What color is grass?|Green', 'co|1|What color is the sky on a sunny day?|Blue',
    'co|1|How many sides does a triangle have?|Three', 'co|1|What shape is a pizza?|A circle', 'co|1|What shape is a door?|A rectangle',
    'co|1|What shape has four sides that are all the same?|A square', 'co|1|What color is a fire truck?|Red',
    'an|1|What sound does a cow make?|Moo!', 'an|1|What sound does a duck make?|Quack!', 'an|1|What animal says "oink"?|A pig',
    'an|1|What animal has a really long neck?|A giraffe', 'an|1|What do bees make?|Honey', 'an|1|How many legs does a dog have?|Four',
    'an|1|Where does a fish live?|In the water', 'an|1|What animal hops and has long ears?|A bunny', 'an|1|What is a baby cat called?|A kitten',
    'an|1|What is a baby dog called?|A puppy', 'an|1|Which animal has a trunk?|An elephant', 'an|1|What does a caterpillar turn into?|A butterfly',
    'an|1|What animal says "baa"?|A sheep', 'an|1|What animal has black and white stripes?|A zebra', 'an|1|Which animal lays eggs and says "cluck"?|A chicken',
    'fo|1|What red fruit do people say keeps the doctor away?|An apple', 'fo|1|What do cows give us to drink?|Milk',
    'fo|1|Is a carrot a fruit or a vegetable?|A vegetable', 'fo|1|What yellow fruit do monkeys love?|A banana',
    'fo|1|What food do we put on top of a birthday cake?|Candles (and frosting!)', 'fo|1|What do we make toast from?|Bread',
    'bo|1|How many fingers are on one hand?|Five', 'bo|1|What do you use to smell?|Your nose', 'bo|1|What do you use to hear?|Your ears',
    'bo|1|How many eyes do you have?|Two', 'bo|1|What do you use to taste food?|Your tongue',
    'sc|1|What falls from the clouds when it storms?|Rain', 'sc|1|What is cold and white and falls in winter?|Snow',
    'sc|1|Name one thing a plant needs to grow.|Water, sunlight, or soil', 'sc|1|Is it dark outside in the day or at night?|At night',
    'sc|1|What do you wear on your feet when it rains?|Rain boots',
    'sp|1|What shines in the sky during the day?|The sun', 'sp|1|What do we see in the sky at night that changes shape?|The moon',
    'sp|1|What twinkles in the night sky?|Stars',
    'nu|1|How many wheels does a bike have?|Two', 'nu|1|How many wheels does a car have?|Four',
    'wd|1|What letter does "apple" start with?|A', 'wd|1|What letter does "ball" start with?|B', 'wd|1|What letter does "sun" start with?|S',
    'wd|1|What is the opposite of hot?|Cold', 'wd|1|What is the opposite of big?|Small', 'wd|1|What is the opposite of up?|Down',
    'wd|1|What is the opposite of happy?|Sad', 'wd|1|Say a word that rhymes with cat.|Hat, bat, mat, rat...',
    'wd|1|Say a word that rhymes with dog.|Log, frog, fog...', 'wd|1|Say a word that rhymes with bee.|Tree, see, key, me...',
    'ri|1|I have four legs and a tail and I say woof. What am I?|A dog', 'ri|1|I am round and you kick me in a game. What am I?|A ball',
    'ri|1|I am yellow, hot, and up in the sky. What am I?|The sun', 'ri|1|You sleep in me every night. What am I?|A bed',
    'wo|1|What do you call a really, really big hill?|A mountain', 'wo|1|Where do airplanes take off from?|An airport',
    'wo|1|Where do we go to borrow books?|The library',
    // ----- Ages 6-7 -----
    'an|2|What is the biggest animal in the world?|The blue whale', 'an|2|How many legs does a spider have?|Eight',
    'an|2|How many legs does an insect have?|Six', 'an|2|What do you call an animal that only eats plants?|A herbivore',
    'an|2|Which bird can’t fly but swims really well in cold places?|A penguin', 'an|2|What is a baby frog called?|A tadpole',
    'an|2|What is the fastest land animal?|The cheetah', 'an|2|Which animal is called the king of the jungle?|The lion',
    'an|2|What do pandas mostly eat?|Bamboo', 'an|2|Which animal carries its baby in a pouch?|A kangaroo',
    'an|2|Is a whale a fish or a mammal?|A mammal', 'an|2|What do you call a baby cow?|A calf',
    'sc|2|What do we call water when it freezes?|Ice', 'sc|2|What do we breathe in to stay alive?|Air (oxygen)',
    'sc|2|What do you see in the sky when the sun comes out after rain?|A rainbow', 'sc|2|What pulls things to the ground when you drop them?|Gravity',
    'sc|2|What season comes after winter?|Spring', 'sc|2|What season do leaves fall off trees?|Fall (autumn)',
    'sc|2|What happens to ice when it gets warm?|It melts into water',
    'sp|2|What planet do we live on?|Earth', 'sp|2|What is the closest star to Earth?|The sun',
    'sp|2|What do you call a person who travels to space?|An astronaut', 'sp|2|Which planet is called the Red Planet?|Mars',
    'wo|2|What is the biggest ocean on Earth?|The Pacific Ocean', 'wo|2|Which country has the Eiffel Tower?|France',
    'wo|2|What are the colors of the American flag?|Red, white, and blue', 'wo|2|What is a hot, dry, sandy place called?|A desert',
    'wo|2|How many continents are there?|Seven', 'wo|2|What do you call land with water all around it?|An island',
    'bo|2|What organ pumps blood around your body?|Your heart', 'bo|2|What part of your body helps you think?|Your brain',
    'bo|2|What holds your body up and is made of bones?|Your skeleton',
    'fo|2|What fruit has its seeds on the outside?|A strawberry', 'fo|2|What is a dried grape called?|A raisin',
    'fo|2|What do bees collect from flowers to make honey?|Nectar', 'fo|2|What is the main ingredient in french fries?|Potatoes',
    'nu|2|How many days are in a week?|Seven', 'nu|2|How many months are in a year?|Twelve', 'nu|2|How many sides does a hexagon have?|Six',
    'nu|2|How many legs do three dogs have altogether?|Twelve',
    'wd|2|What is the opposite of brave?|Scared', 'wd|2|Spell the word CAT.|C, A, T', 'wd|2|Spell the word DOG.|D, O, G',
    'wd|2|Say a word that means very big.|Huge, giant, enormous...', 'wd|2|What do you call a word that names a person, place, or thing?|A noun',
    'wd|2|What is the opposite of "noisy"?|Quiet',
    'ri|2|What has hands but can’t clap?|A clock', 'ri|2|What gets wetter the more it dries?|A towel',
    'ri|2|What has keys but can’t open locks?|A piano', 'ri|2|What goes up but never comes down?|Your age',
    'ri|2|What has legs but can’t walk?|A table', 'ri|2|What can you catch but not throw?|A cold',
    'co|2|What color do you get when you mix blue and yellow?|Green', 'co|2|What color do you get when you mix red and yellow?|Orange',
    'co|2|What color do you get when you mix red and blue?|Purple', 'co|2|What color do you get when you mix red and white?|Pink',
    // ----- Ages 8-10 -----
    'an|3|What is the largest land animal?|The African elephant', 'an|3|What do you call animals that are awake at night?|Nocturnal',
    'an|3|How many hearts does an octopus have?|Three', 'an|3|What is a group of lions called?|A pride',
    'an|3|What is a group of wolves called?|A pack', 'an|3|Which mammal can really fly?|The bat',
    'an|3|What is the tallest animal in the world?|The giraffe', 'an|3|Which lizard can change color to blend in?|A chameleon',
    'an|3|What does a caterpillar make before it becomes a butterfly?|A chrysalis', 'an|3|Do sharks have bones?|No, their skeletons are cartilage',
    'sc|3|At what temperature does water boil, in Fahrenheit?|212°F (100°C)', 'sc|3|What gas do plants take in from the air?|Carbon dioxide',
    'sc|3|What is it called when plants make food from sunlight?|Photosynthesis', 'sc|3|What is the hardest natural material?|Diamond',
    'sc|3|What part of a plant soaks up water from the soil?|The roots', 'sc|3|What are the three states of matter?|Solid, liquid, and gas',
    'sc|3|What tool do scientists use to see tiny things?|A microscope',
    'sp|3|What is the largest planet in our solar system?|Jupiter', 'sp|3|How many planets are in our solar system?|Eight',
    'sp|3|Which planet has big beautiful rings?|Saturn', 'sp|3|What is the name of our galaxy?|The Milky Way',
    'sp|3|Who was the first person to walk on the moon?|Neil Armstrong', 'sp|3|Which planet is closest to the sun?|Mercury',
    'wo|3|What is the longest river in Africa?|The Nile', 'wo|3|What is the capital of the United States?|Washington, D.C.',
    'wo|3|What is the capital of Mexico?|Mexico City', 'wo|3|Which continent is the biggest?|Asia',
    'wo|3|What is the tallest mountain in the world?|Mount Everest', 'wo|3|In which country are the pyramids of Giza?|Egypt',
    'wo|3|What language do most people speak in Brazil?|Portuguese', 'wo|3|Which ocean is between the U.S. and Europe?|The Atlantic Ocean',
    'wo|3|How many states are in the United States?|Fifty', 'wo|3|What is the capital of Japan?|Tokyo',
    'bo|3|What is the largest organ of the human body?|Your skin', 'bo|3|How many bones are in a grown-up’s body?|206',
    'bo|3|What do your lungs help you do?|Breathe', 'bo|3|How many teeth do most grown-ups have?|Thirty-two',
    'nu|3|How many minutes are in an hour?|Sixty', 'nu|3|How many sides does an octagon have?|Eight',
    'nu|3|What is a quarter of 100?|Twenty-five', 'nu|3|How many years are in a century?|One hundred',
    'nu|3|How many seconds are in a minute?|Sixty',
    'wd|3|What do you call words that sound the same but mean different things, like "flower" and "flour"?|Homophones',
    'wd|3|What is the plural of mouse?|Mice', 'wd|3|What is the opposite of ancient?|Modern', 'wd|3|What do you call a person who writes books?|An author',
    'wd|3|Spell the word FRIEND.|F, R, I, E, N, D', 'wd|3|What is the plural of child?|Children',
    'ri|3|The more you take, the more you leave behind. What am I?|Footsteps', 'ri|3|What has a neck but no head?|A bottle',
    'ri|3|What has many teeth but can’t bite?|A comb', 'ri|3|What can travel around the world while staying in a corner?|A stamp',
    'ri|3|I’m tall when I’m young and short when I’m old. What am I?|A candle',
    'ri|3|What has cities but no houses, forests but no trees, and water but no fish?|A map',
    'co|3|What are the three primary colors?|Red, yellow, and blue',
    'fo|3|Which country did pizza come from?|Italy', 'fo|3|What is guacamole mostly made from?|Avocado',
    'fo|3|Which "nut" grows underground?|The peanut',
  ].map((s) => { const [c, l, q, a] = s.split('|'); return { c, l: Number(l), q, a }; });

  // Endless number and pattern questions, sized to the player.
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const NUMWORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  function generated(level) {
    const kind = Math.random();
    if (level === 1) {
      if (kind < 0.35) { const a = rnd(1, 4), b = rnd(1, 5 - a); return { c: 'nu', q: 'If you have ' + a + ' apples and get ' + b + ' more, how many do you have?', a: String(a + b) }; }
      if (kind < 0.6) { const n = rnd(2, 9); return { c: 'nu', q: 'What number comes after ' + n + '?', a: String(n + 1) }; }
      if (kind < 0.8) { const n = rnd(3, 10); return { c: 'nu', q: 'What number comes before ' + n + '?', a: String(n - 1) }; }
      const seqs = [['red', 'blue', 'red', 'blue'], ['circle', 'square', 'circle', 'square'], ['clap', 'stomp', 'clap', 'stomp']];
      const s = pick(seqs); return { c: 'pa', q: 'What comes next? ' + s.join(', ') + '...', a: s[0] };
    }
    if (level === 2) {
      if (kind < 0.3) { const a = rnd(3, 12), b = rnd(2, 8); return { c: 'nu', q: 'What is ' + a + ' plus ' + b + '?', a: String(a + b) }; }
      if (kind < 0.55) { const a = rnd(8, 20), b = rnd(1, 7); return { c: 'nu', q: 'What is ' + a + ' minus ' + b + '?', a: String(a - b) }; }
      if (kind < 0.8) { const step = pick([2, 5, 10]), st = step * rnd(0, 3); return { c: 'pa', q: 'What comes next? ' + [st, st + step, st + 2 * step, st + 3 * step].join(', ') + '...', a: String(st + 4 * step) }; }
      const n = rnd(2, 10); return { c: 'nu', q: 'What is double ' + n + '?', a: String(n * 2) };
    }
    if (kind < 0.4) { const a = rnd(2, 10), b = rnd(2, 10); return { c: 'nu', q: 'What is ' + a + ' times ' + b + '?', a: String(a * b) }; }
    if (kind < 0.6) { const a = rnd(25, 99), b = rnd(11, 24); return { c: 'nu', q: 'What is ' + a + ' minus ' + b + '?', a: String(a - b) }; }
    if (kind < 0.8) { const step = rnd(3, 9), st = rnd(1, 10); return { c: 'pa', q: 'What comes next? ' + [st, st + step, st + 2 * step, st + 3 * step].join(', ') + '...', a: String(st + 4 * step) }; }
    const n = rnd(2, 9) * 10; return { c: 'nu', q: 'What is half of ' + n + '?', a: String(n / 2) };
  }
  // Mostly the player's own level, sometimes one easier, plus number games.
  function quizQuestion(level, used) {
    if (Math.random() < 0.28) return Object.assign({ l: level, gen: true }, generated(level));
    const fits = (x) => !used.has(x.q) && (x.l === level || (x.l === level - 1 && Math.random() < 0.35));
    let pool = QUIZ.filter(fits);
    if (!pool.length) pool = QUIZ.filter((x) => x.l <= level && !used.has(x.q));
    if (!pool.length) { used.clear(); pool = QUIZ.filter((x) => x.l <= level); }
    return pick(pool);
  }

  // ---------------- Story Spinner ----------------
  const ADJ = ['brave', 'sleepy', 'tiny', 'giant', 'grumpy', 'silly', 'shy', 'sparkly', 'hungry', 'curious', 'clumsy', 'polite', 'bouncy', 'fancy'];
  const HEROES = ['🐨|koala', '🐉|dragon', '🤖|robot', '👸|princess', '🏴‍☠️|pirate', '🧑‍🚀|astronaut', '🦄|unicorn', '🐧|penguin',
    '🧙|wizard', '🦖|dinosaur', '🧜|mermaid', '🐵|monkey', '🦸|superhero', '👻|ghost', '🐱|cat', '🐶|dog', '👽|alien', '🐸|frog',
    '🐻|bear', '🐙|octopus', '🦊|fox', '🐢|turtle'].map((s) => s.split('|'));
  const PLACES = ['🏴‍☠️|on a pirate ship', '🍭|in a candy forest', '🌙|on the moon', '🌊|under the sea', '🏰|in a giant castle',
    '✈️|at a busy airport', '🌴|in the jungle', '🌋|next to a volcano', '🏔️|on a snowy mountain', '👟|in a tiny house shaped like a shoe',
    '🏙️|in a big city', '🏖️|at the beach', '🪐|in outer space', '🪄|at a school for magic', '🎈|in a hot air balloon',
    '🍽️|above a fancy restaurant', '🎮|inside a video game', '🚜|on a farm', '🦓|at the zoo', '☁️|in a kingdom on the clouds'].map((s) => s.split('|'));
  const PROBLEMS = ['🎩|they lost their favorite hat.', '🥚|they found a mysterious egg.', '🤧|they could not stop sneezing.',
    '🗺️|they found half of a treasure map.', '🐜|they shrank to the size of an ant.', '🪽|they woke up and could fly.',
    '🥪|a sandwich started talking to them.', '🐱|they had to rescue a kitten stuck up high.', '🌙|the moon fell into the ocean.',
    '💜|everything in the world turned purple.', '🌪️|a windstorm blew away everybody’s shoes.', '🎂|they had to bake a cake for a giant.',
    '🚪|they found a door that was not there yesterday.', '🐶|their dog started to talk.', '🏁|they had to win a race against a cheetah.',
    '🍦|the ice cream machine would not stop.', '📚|a dragon asked them for homework help.', '🎵|every word they said came out as a song.',
    '🗝️|they found a key that could open anything.', '☀️|the sun forgot to come up.'].map((s) => s.split('|'));
  const TWISTS = ['Suddenly, it started raining jellybeans!', 'Then a giant sneezed!', 'But wait. It was all inside a snow globe!',
    'Out of nowhere, a marching band appeared.', 'Everybody’s shoes started to talk.', 'Then the floor turned into a bouncy castle.',
    'A tiny dragon popped out of a teacup.', 'Suddenly, everyone could only walk backward.', 'A wise old turtle whispered a clue.',
    'Just then, all the lights went out!', 'A friendly ghost offered to help.', 'They discovered a secret tunnel.',
    'The ground started to wiggle like jelly.', 'A parade of penguins marched by.', 'Their shadow ran away on its own!',
    'It turned out the villain just wanted a hug.'];

  // ---------------- I Spy Bingo ----------------
  const SPY = {
    car: { name: 'Car', emoji: '🚗', items: ['🚗|red car', '🚚|big truck', '🚌|bus', '🏍️|motorcycle', '🚲|bicycle', '🐄|cow', '🐴|horse',
      '🐕|dog', '🌉|bridge', '🚦|traffic light', '🛑|stop sign', '⛽|gas station', '🌳|big tree', '🚓|police car', '🚑|ambulance',
      '🚜|tractor', '🚂|train', '✈️|airplane in the sky', '🐦|bird', '🌊|lake or river', '⛰️|mountain', '🌻|flowers', '🪧|billboard',
      '🚧|orange cone', '🏪|store', '7️⃣|the number 7', '🅿️|parking sign', '🚛|18-wheeler', '🟡|yellow car', '🏳️|a flag'] },
    dinner: { name: 'Restaurant', emoji: '🍽️', items: ['👓|someone in glasses', '🧢|someone in a hat', '🍋|a lemon', '🧂|salt shaker',
      '🥤|a straw', '🎂|a birthday', '👶|a baby', '🕯️|a candle', '🖼️|picture on the wall', '🌿|a plant', '🍟|french fries', '🍕|pizza',
      '🧊|ice cubes', '🔴|something red', '😂|someone laughing', '🧑‍🍳|a cook', '🍰|a dessert', '🥢|chopsticks', '🍴|a fork',
      '🪑|a high chair', '💡|a lamp', '⏰|a clock', '🌮|a taco', '🧃|a juice', '🦓|someone in stripes', '🎵|music playing',
      '🚪|a door opening', '🧻|a napkin', '🥗|a salad', '🪟|a window'] },
    plane: { name: 'Plane', emoji: '✈️', items: ['✈️|an airplane', '🧳|a suitcase', '🎒|a backpack', '🛂|a passport', '🪟|a window seat',
      '☁️|clouds below you', '👩‍✈️|a pilot', '🛒|the snack cart', '🔢|a gate number', '🕐|a clock', '😴|someone sleeping',
      '🎧|headphones', '🛄|baggage belt', '🚶|moving walkway', '☕|a coffee cup', '🧸|a stuffed animal', '👶|a baby', '🗺️|a map',
      '🌙|the moon', '🏙️|a city from above', '🌊|water from above', '🍪|a cookie', '🥨|pretzels', '📖|someone reading',
      '🧢|a cap', '🛬|a plane landing', '🚐|a shuttle bus', '🧃|a juice box', '🪪|a name tag', '🔔|a ding sound'] },
    outside: { name: 'Outside', emoji: '🌳', items: ['🐿️|squirrel', '🐦|bird', '🐕|dog on a walk', '🌸|flower', '🍃|green leaf', '🪨|a rock',
      '🐜|an ant', '☁️|cloud shaped like something', '🌳|tall tree', '🚲|bike', '🛝|a slide', '⚽|a ball', '🦋|butterfly', '🐝|a bee',
      '🚪|a red door', '📬|mailbox', '🪵|a stick', '🐈|a cat', '🏃|someone running', '👤|your shadow', '💧|a puddle',
      '🌈|something rainbow', '🪺|a bird nest', '🍂|brown leaf', '🛹|skateboard', '🐌|a snail', '🌼|yellow flower', '🏠|a house',
      '🚗|a car', '⛲|a fountain'] },
  };
  Object.values(SPY).forEach((p) => { p.items = p.items.map((s) => { const [e, t] = s.split('|'); return { e, t }; }); });

  window.Extras = { sillyCard, SILLY_CAT: { id: 'silly', name: 'Silly Mashup', emoji: '🤪', color: '#E3B23C', desc: 'Two things at once' },
    QUIZ_CATS, quizQuestion, ADJ, HEROES, PLACES, PROBLEMS, TWISTS, SPY };
})();
