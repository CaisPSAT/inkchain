const classic = [
  "accordion", "acorn", "ai", "airplane", "alarm", "alligator", "anchor", "angel", "ant", "apartment",
  "apple", "apron", "aquarium", "armadillo", "arrow", "astronaut", "avocado", "axe", "backpack", "badge",
  "bagel", "balloon", "banana", "bandage", "banjo", "barn", "barrel", "basketball", "bat", "bathtub",
  "battery", "beach", "bear", "beaver", "bed", "beehive", "bell", "bicycle", "binoculars", "bird",
  "blender", "blimp", "book", "boomerang", "boot", "bottle", "bowtie", "bracelet", "bread", "bridge",
  "broccoli", "broom", "bubble", "bucket", "buffalo", "bulldozer", "butt", "butterfly", "cactus", "cage",
  "calculator", "camel", "camera", "candle", "cannon", "canoe", "cape", "carrot", "castle", "cat",
  "caterpillar", "cave", "celery", "cellphone", "chair", "chameleon", "cheese", "cheetah", "cherry",
  "chessboard", "chicken", "chimney", "clock", "cloud", "clown", "coconut", "compass", "computer",
  "cookie", "couch", "cowboy", "crab", "crown", "cupcake", "dinosaur", "dolphin", "domino", "dragon",
  "drum", "duck", "eagle", "ear", "earmuffs", "egg", "elephant", "elevator", "envelope", "eraser",
  "escalator", "eye", "feather", "fence", "firetruck", "fish", "flamingo", "flashlight", "flower", "flute",
  "football", "fork", "fountain", "fox", "frog", "frying pan", "garage", "giraffe", "glasses", "glove",
  "goat", "gorilla", "grape", "guitar", "hamburger", "hammer", "hamster", "handcuffs", "harp", "hat",
  "helicopter", "helmet", "hippo", "hockey", "horse", "hose", "hot dog", "house", "ice cream", "igloo",
  "jellyfish", "kangaroo", "kettle", "key", "kite", "koala", "ladder", "ladybug", "lamp", "lantern",
  "laptop", "leaf", "lemon", "lemonade", "lighthouse", "lion", "lobster", "mailbox", "microphone",
  "microscope", "monkey", "moon", "motorcycle", "mountain", "mouse", "mushroom", "necklace", "newspaper",
  "octopus", "onion", "orange", "ostrich", "owl", "paint brush", "panda", "parachute", "parrot", "peanut",
  "pear", "penguin", "pencil", "pepper", "piano", "pickle", "pig", "pineapple", "pirate", "pizza",
  "planet", "platypus", "poop", "popcorn", "potato", "pumpkin", "pyramid", "rabbit", "rainbow",
  "refrigerator", "robot", "rocket", "rooster", "sailboat", "sandwich", "saxophone", "scarecrow",
  "scissors", "scooter", "seahorse", "shark", "sheep", "shoe", "skateboard", "snail", "snake",
  "snowman", "sock", "spaceship", "spider", "spoon", "squirrel", "starfish", "submarine", "suitcase",
  "sunflower", "sunglasses", "swan", "sword", "taco", "telescope", "tiger", "toaster", "tomato",
  "toothbrush", "tornado", "tractor", "train", "tree", "trombone", "truck", "turtle", "umbrella",
  "underwear", "unicorn", "vacuum", "volcano", "wagon", "watermelon", "whale", "wheelbarrow", "windmill",
  "window", "wizard", "zebra", "zipper"
] as const;

export const PROMPT_PACKS = {
  classic,
  animals: classic.filter((word) => [
    "alligator", "ant", "armadillo", "bear", "beaver", "bird", "buffalo", "butterfly", "camel", "cat",
    "caterpillar", "chameleon", "cheetah", "chicken", "crab", "dinosaur", "dolphin", "dragon", "duck",
    "eagle", "elephant", "fish", "flamingo", "fox", "frog", "giraffe", "goat", "gorilla", "hamster",
    "hippo", "horse", "jellyfish", "kangaroo", "koala", "ladybug", "lion", "lobster", "monkey", "mouse",
    "octopus", "ostrich", "owl", "panda", "parrot", "penguin", "pig", "platypus", "rabbit", "rooster",
    "seahorse", "shark", "sheep", "snail", "snake", "spider", "squirrel", "starfish", "swan", "tiger",
    "turtle", "unicorn", "whale", "zebra"
  ].includes(word)),
  objects: classic.filter((word) => [
    "accordion", "alarm", "anchor", "apartment", "apron", "aquarium", "arrow", "axe", "backpack", "badge",
    "bagel", "balloon", "bandage", "banjo", "barn", "barrel", "basketball", "bat", "bathtub", "battery",
    "bed", "beehive", "bell", "bicycle", "binoculars", "blender", "blimp", "book", "boomerang", "boot",
    "bottle", "bowtie", "bracelet", "bread", "bridge", "broom", "bubble", "bucket", "bulldozer", "cage",
    "calculator", "camera", "candle", "cannon", "canoe", "cape", "castle", "cellphone", "chair", "cheese",
    "chessboard", "chimney", "clock", "cloud", "coconut", "compass", "computer", "cookie", "couch", "crown",
    "drum", "elevator", "envelope", "eraser", "escalator", "feather", "fence", "firetruck", "flashlight",
    "flower", "flute", "football", "fork", "fountain", "frying pan", "garage", "glasses", "glove", "grape",
    "guitar", "hamburger", "hammer", "handcuffs", "harp", "hat", "helicopter", "helmet", "hockey", "hose",
    "hot dog", "house", "ice cream", "igloo", "kettle", "key", "kite", "ladder", "lamp", "lantern", "laptop",
    "leaf", "lemon", "lemonade", "lighthouse", "mailbox", "microphone", "microscope", "moon", "motorcycle",
    "mountain", "mushroom", "necklace", "newspaper", "paint brush", "parachute", "peanut", "pear", "pencil",
    "pepper", "piano", "pickle", "pineapple", "pirate", "pizza", "planet", "popcorn", "potato", "pumpkin",
    "pyramid", "rainbow", "refrigerator", "robot", "rocket", "sailboat", "sandwich", "saxophone", "scarecrow",
    "scissors", "scooter", "shoe", "skateboard", "snowman", "sock", "spaceship", "spoon", "submarine",
    "suitcase", "sunflower", "sunglasses", "sword", "taco", "telescope", "toaster", "tomato", "toothbrush",
    "tornado", "tractor", "train", "tree", "trombone", "truck", "umbrella", "underwear", "vacuum", "volcano",
    "wagon", "watermelon", "wheelbarrow", "windmill", "window", "wizard", "zipper"
  ].includes(word)),
  hard: [
    "accordion", "ai", "armadillo", "astronaut", "binoculars", "boomerang", "chameleon", "chessboard",
    "escalator", "flamingo", "frying pan", "handcuffs", "helicopter", "jellyfish", "lighthouse", "microscope",
    "motorcycle", "paint brush", "parachute", "platypus", "refrigerator", "saxophone", "scarecrow", "seahorse",
    "spaceship", "submarine", "telescope", "tornado", "trombone", "wheelbarrow", "windmill"
  ],
  silly: [
    "avocado", "banana", "broccoli", "bubble", "butt", "clown", "coconut", "cowboy", "cupcake", "dragon",
    "earmuffs", "hamburger", "hot dog", "ice cream", "pickle", "pirate", "pizza", "poop", "popcorn", "pumpkin",
    "rainbow", "robot", "rocket", "snowman", "taco", "underwear", "unicorn", "wizard", "zipper"
  ]
} as const;

export type PromptPack = keyof typeof PROMPT_PACKS;

export const PROMPTS = PROMPT_PACKS.classic;
