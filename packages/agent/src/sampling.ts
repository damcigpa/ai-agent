// Sampling temperature per kind of model call, in one place so it can be tuned without
// hunting through the spokes.
//
// Low temperature = the same input gives (nearly) the same output. That is what we want for
// decisions and extraction (is it on topic? does the material cover the question? what does
// the page say?): a wobbling classifier or judge makes the whole agent unpredictable.
// Higher temperature is only worth it where variety helps the student: quiz questions.
//
// Only temperature is set, never top_p as well: the current Claude models do not accept both
// at once, and one knob is enough.

export const TEMPERATURE = {
  // decisions and extraction: as deterministic as possible
  classify: 0, // on topic / suspicious
  decide: 0, // is this answer good enough
  plan: 0, // subject and steps
  replan: 0,
  rewrite: 0, // follow-up → standalone question
  judge: 0, // does the material cover the question
  compare: 0, // do material and web disagree
  extract: 0, // text from files and photos
  // content that has to be correct, but is written in words
  search: 0.2, // facts from the web
  analyze: 0.3, // literary analysis
  explain: 0.4, // explanation for the student: accurate, still natural prose
  // content where variety is a plus
  quiz: 0.7,
} as const;