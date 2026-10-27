// Beat starter templates. Plain data, loaded before app.js as a classic script.
// (The global is still named window.BTS_TEMPLATES for backward compatibility.)
window.BTS_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank canvas',
    description: 'Start from nothing. Add beats as you think.',
    beats: []
  },
  {
    id: 'three-act',
    name: 'Three-act structure',
    description: '3 beats: Setup, Confrontation, Resolution.',
    beats: [
      { title: 'Setup',         body: 'Introduce world, characters, status quo, inciting incident.' },
      { title: 'Confrontation', body: 'Protagonist faces escalating obstacles. Stakes rise. Midpoint twist.' },
      { title: 'Resolution',    body: 'Climax. Aftermath. New equilibrium.' }
    ]
  },
  {
    id: 'heros-journey',
    name: "Hero's journey",
    description: "12 stages (Campbell / Vogler). Mythic stories, features, novels.",
    beats: [
      { title: 'Ordinary World',         body: 'Hero in their normal life. Establish what they lack.' },
      { title: 'Call to Adventure',      body: 'A call to leave the familiar. A problem or challenge appears.' },
      { title: 'Refusal of the Call',    body: 'Hesitation, fear, doubt. The hero resists.' },
      { title: 'Meeting the Mentor',     body: 'Wisdom or training from a guide.' },
      { title: 'Crossing the Threshold', body: 'Hero commits and enters the special world.' },
      { title: 'Tests, Allies, Enemies', body: 'New rules, new relationships, first challenges.' },
      { title: 'Approach to the Inmost Cave', body: 'Preparing for the central ordeal.' },
      { title: 'Ordeal',                 body: 'The biggest crisis so far. Death-and-rebirth moment.' },
      { title: 'Reward',                 body: 'Seize the prize. Celebration. New knowledge.' },
      { title: 'The Road Back',          body: 'Begin the return. New stakes, last temptations.' },
      { title: 'Resurrection',           body: 'Final climax. Hero is tested at their highest level.' },
      { title: 'Return with the Elixir', body: 'Hero returns home transformed, bringing something of value.' }
    ]
  },
  {
    id: 'fifteen-beats',
    name: 'Fifteen beats',
    description: '15 beats. The common commercial shape, from opening image to closing image.',
    beats: [
      { title: 'Opening image',      body: "The 'before' snapshot. Tone, mood, world." },
      { title: 'The question',       body: 'Someone names, out loud, what the story is really about.' },
      { title: 'Setup',              body: 'Introduce the hero and the world. Plant what needs fixing.' },
      { title: 'The disruption',     body: 'The thing that knocks the hero out of their world.' },
      { title: 'Hesitation',         body: 'Should I go? The last moment of refusing.' },
      { title: 'Commitment',         body: 'The hero decides and steps into the new world.' },
      { title: 'Second thread',      body: 'A relationship or subplot that carries the theme.' },
      { title: 'The promise kept',   body: 'The part the audience came for. The premise, delivered.' },
      { title: 'Midpoint',           body: 'A false win or a false loss. The stakes change shape.' },
      { title: 'Pressure builds',    body: 'Outside forces close in. Inside, the cracks show.' },
      { title: 'The low point',      body: 'The bottom. A death, literal or otherwise.' },
      { title: 'The reckoning',      body: 'The hero sits with the loss until something turns.' },
      { title: 'The new idea',       body: 'A way through appears, and the hero acts on it.' },
      { title: 'Climax',             body: 'Every thread converges. The question gets answered.' },
      { title: 'Closing image',      body: "The 'after' snapshot. Show how the world has changed." }
    ]
  },
  {
    id: 'pixar-spine',
    name: 'Pixar story spine',
    description: "6 beats. Friendly, accessible, works for any narrative.",
    beats: [
      { title: 'Once upon a time...',          body: 'Establish the ordinary.' },
      { title: 'Every day...',                 body: 'Show the normal rhythm.' },
      { title: 'Until one day...',             body: 'Something disrupts the normal.' },
      { title: 'Because of that...',           body: 'The first consequence.' },
      { title: 'Because of that...',           body: 'The second consequence — escalation.' },
      { title: 'Until finally...',             body: 'Climax and new equilibrium.' }
    ]
  },
  {
    id: 'story-circle',
    name: "Dan Harmon's story circle",
    description: "8 beats. A simplified hero's journey — great for episodes.",
    beats: [
      { title: 'You',     body: 'Establish the protagonist in their zone of comfort.' },
      { title: 'Need',    body: 'They want something.' },
      { title: 'Go',      body: 'They enter an unfamiliar situation.' },
      { title: 'Search',  body: 'They adapt and struggle.' },
      { title: 'Find',    body: 'They get what they wanted.' },
      { title: 'Take',    body: 'But they pay a heavy price for it.' },
      { title: 'Return',  body: 'They return to their familiar situation.' },
      { title: 'Change',  body: 'Having changed.' }
    ]
  },
  {
    id: 'treatment',
    name: 'Treatment (sections)',
    description: 'A documentary/brand treatment laid out as slides: Cover, Synopsis, Character, Story, Visual Language, References, Sound, Closing. Each section is a group.',
    context: 'A treatment for a film/brand piece. Each group is a slide/section of the final document.',
    groups: [
      { name: 'Cover',           role: 'cover' },
      { name: 'Synopsis',        role: 'section' },
      { name: 'The Character',   role: 'section' },
      { name: 'The Story',       role: 'section' },
      { name: 'Visual Language', role: 'section' },
      { name: 'References',      role: 'reference' },
      { name: 'Sound',          role: 'section' },
      { name: 'Closing',        role: 'section' }
    ],
    beats: [
      { type: 'title',   role: 'cover',   group: 0, title: 'Project title', body: 'A one-line statement of what this is.' },
      { type: 'thought', role: 'concept', group: 1, title: 'Synopsis', body: 'The piece in a paragraph — premise, tone, why now.' },
      { type: 'thought', role: 'concept', group: 2, title: 'Who they are', body: 'The character/subject. Bio, voice, what makes them magnetic.' },
      { type: 'thought', role: 'concept', group: 3, title: 'The story we tell', body: 'The arc. What we open on, where we land.' },
      { type: 'thought', role: 'concept', group: 4, title: 'Look & feel', body: 'Palette, lensing, light, texture, references for the image.' },
      { type: 'thought', role: 'mood',    group: 5, title: 'Reference board', body: 'Drop stills, frames, and inspiration here.' },
      { type: 'thought', role: 'concept', group: 6, title: 'Sound & music', body: 'Score direction, diegetic sound, voice-over approach.' },
      { type: 'thought', role: 'concept', group: 7, title: 'Closing thought', body: 'The line that leaves them wanting to make it.' }
    ]
  },
  {
    id: 'production',
    name: 'Production timeline',
    description: 'A single timeline group with ordered phases: Prep, Shoot, Edit, Finish.',
    context: 'A production plan laid out as an ordered timeline of phases.',
    groups: [ { name: 'Timeline', role: 'timeline' } ],
    beats: [
      { type: 'beat', role: 'step', group: 0, title: 'Pre-production', body: 'Scout, cast, schedule, gear, permits.' },
      { type: 'beat', role: 'step', group: 0, title: 'Shoot', body: 'Principal photography. Shot list, days, locations.' },
      { type: 'beat', role: 'step', group: 0, title: 'Edit', body: 'Assembly, rough cut, fine cut, picture lock.' },
      { type: 'beat', role: 'step', group: 0, title: 'Finish', body: 'Colour, sound mix, graphics, delivery.' }
    ]
  },
  {
    id: 'references',
    name: 'Reference board',
    description: 'Two reference groups ready for stills and inspiration — pure mood/visual research.',
    context: 'A visual reference board. Each group is a theme of references.',
    groups: [
      { name: 'Visual references', role: 'reference' },
      { name: 'Tone & mood',       role: 'mood' }
    ],
    beats: [
      { type: 'thought', role: 'caption', group: 0, title: 'Visual direction', body: 'Drop frames, photos, palettes here.' },
      { type: 'thought', role: 'caption', group: 1, title: 'Mood', body: 'The feeling we are chasing.' }
    ]
  }
];
