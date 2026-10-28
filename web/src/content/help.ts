// What every page and control in the Lab is for. One inventory, read by the hover hints, the
// "Learn this control" popovers, Help mode, the Toolkit Guide, its search and the toolkit tours.
//
// Each control is found on the page by its stable `data-help-id`, never by its visible text.
// Every description here was written against what the control actually does in the code: whether
// it only changes the view, changes a setting, reads stored data, or runs the Python engine or a
// browser simulation. Anything that sounds like more than that is a bug in this file.

import type { Route } from "./glossary"

export type Effect = "view" | "setting" | "engine" | "simulation" | "reads" | "saves" | "deletes" | "navigates"

export const EFFECT_LABEL: Record<Effect, string> = {
  view: "Only changes what you see",
  setting: "Changes a setting; nothing runs until you run it",
  engine: "Runs your Python engine",
  simulation: "Runs a browser simulation, not your engine",
  reads: "Reads stored data; nothing is generated or trained",
  saves: "Saves something in this browser or the Lab folder",
  deletes: "Removes something you saved",
  navigates: "Opens another page",
}

export type VisualId = "seed" | "nextStep" | "replay" | "run" | "temperature" | "accept" | "splits" | "context" | "draw" | "normalize" | "smoothing" | "update" | "mask" | "sources"

/** How to make a control visible: open its tab, its section or its lesson stage. */
export interface Reveal {
  tab?: string
  /** A page-specific section to open, such as the journey's input form. */
  section?: string
  stage?: number
  mode?: "guided" | "explore"
  flow?: boolean
}

export interface ControlHelp {
  id: string
  label: string
  route: Route | "any"
  /** Where it is, in words someone could follow. */
  where: string
  /** Regions are tour and "show me" targets only: no hover hint, no Help-mode marker. */
  region?: boolean
  does: string
  when: string
  effect: Effect
  learn?: {
    purpose: string
    input: string
    changes: string
    lookFor: string
    misconception?: string
    visual?: VisualId
  }
  /** Why it can be unavailable, and what makes it available. */
  disabled?: string
  /** Glossary entry with the full definition. */
  term?: string
  /** Plain-language questions this control answers, for search. */
  questions?: string[]
  reveal?: Reveal
}

const c = (x: ControlHelp) => x

// ----------------------------------------------------------------------------- controls

export const CONTROLS: ControlHelp[] = [
  // ---- shell
  c({ id: "shell.search", label: "Search", route: "any", where: "Top bar (Ctrl K or /)", does: "Finds workspaces, terms, controls, experiments and your notes.", when: "You know a word but not where it lives.", effect: "view", questions: ["where is", "find a page", "search"] }),
  c({ id: "shell.theme", label: "Light or dark theme", route: "any", where: "Top bar, sun or moon icon (D)", does: "Switches between the light and dark theme. Your choice is remembered.", when: "The screen is too bright or too dim.", effect: "setting" }),
  c({ id: "shell.focus", label: "Focus mode", route: "any", where: "Top bar, expand icon", does: "Hides the navigation and the explanation column so the experiment fills the screen. Esc leaves it.", when: "You want more room for one experiment.", effect: "view" }),
  c({ id: "shell.help-mode", label: "Help mode", route: "any", where: "Top bar, the Help switch", does: "Shows a small help marker beside every control that has help. Press a marker to learn that control. Turn it off to hide the markers; everything works the same either way.", when: "You want to find out what things do, especially on a touch screen where there is no hover.", effect: "view", questions: ["what does this button do", "help", "explain the controls"] }),
  c({ id: "shell.collapse", label: "Collapse sidebar", route: "any", where: "Bottom of the sidebar", does: "Narrows the sidebar to icons, or widens it again.", when: "You want more width for the page.", effect: "view" }),
  c({ id: "shell.menu", label: "Open navigation", route: "any", where: "Top left on narrow screens", does: "Opens the list of pages on a phone or narrow window.", when: "The sidebar is hidden because the window is narrow.", effect: "view" }),
  c({ id: "shell.engine", label: "Engine status", route: "any", where: "Top bar, the coloured dot", does: "Says whether the local Python engine is reachable. It checks every 15 seconds.", when: "Engine panels show errors.", effect: "reads", learn: { purpose: "Pages marked Your model need the Python backend; simulations do not.", input: "A small health request to the local server.", changes: "Nothing: it only reports.", lookFor: "Green: engine connected. A warning sign: start it with .venv\\Scripts\\python -m nextword.lab.", visual: "sources" } }),
  c({ id: "shell.nav", label: "Workspaces", route: "any", where: "Left sidebar (or the menu on phones)", region: true, does: "Every page of the Lab, grouped from first steps to reference.", when: "Moving between topics.", effect: "navigates" }),
  c({ id: "shell.nav.toolkit", label: "Toolkit Guide", route: "any", where: "Sidebar, Reference group", does: "Opens the guide to every page, control and tour.", when: "You want to know what something is for, or where to go next.", effect: "navigates", questions: ["where should I go next", "what is this page for"] }),
  c({ id: "layout.source", label: "Source label", route: "any", where: "Beside panel titles", region: true, does: "Says where the numbers come from: Your model (your Python engine), Interactive simulation (browser code) or Worked example (fixed, stated values).", when: "You need to know whether a result came from your engine.", effect: "view", term: "corpus", learn: { purpose: "Keeps real results apart from demonstrations.", input: "Nothing: it labels the panel.", changes: "Nothing.", lookFor: "Your model only on panels whose numbers come from nextword/bigram.py through the backend.", misconception: "A simulation is not your trained model; its curves and weights are computed in the browser.", visual: "sources" }, questions: ["is this my model", "is this real", "simulation or real"] }),
  c({ id: "layout.explanation", label: "Explanation panel", route: "any", where: "Right of the experiment on wide screens, below it on narrow ones", region: true, does: "Explains the experiment in plain words, with the calculation and the code one click away.", when: "You want to know why the numbers are what they are.", effect: "view" }),
  c({ id: "layout.hide-explanation", label: "Hide explanation", route: "any", where: "Top right of a workspace", does: "Hides or shows the explanation column on wide screens.", when: "You want the experiment wider.", effect: "view" }),

  // ---- shared teaching controls
  c({ id: "teach.read-and-watch", label: "Read and watch", route: "any", where: "How this workspace works, at the top of a workspace", does: "Starts a step-by-step walkthrough of this page's panels. It never advances on its own and changes no setting.", when: "You want to be shown the page in order.", effect: "view" }),
  c({ id: "teach.show-flow", label: "Show the flow", route: "any", where: "How this workspace works", does: "Opens the diagram of what goes in and what comes out at each step of this page.", when: "You want the big picture before the details.", effect: "view" }),
  c({ id: "teach.flow-node", label: "A box in the flow", route: "any", where: "Inside the opened flow", does: "Explains one step: what goes in, what happens, why, what comes out, and where it goes next. Show it in the workspace scrolls to its panel.", when: "One step of the flow is unclear.", effect: "view", reveal: { flow: true } }),
  c({ id: "teach.level", label: "Detail level", route: "any", where: "Top of an explanation", does: "Switches the explanation between plain words, the calculation with this run's numbers, and the code.", when: "The plain words are clear and you want the arithmetic, or the other way round.", effect: "view" }),
  c({ id: "teach.tour-controls", label: "Walkthrough controls", route: "any", where: "Inside a walkthrough card", does: "Back and Next move one step; Replay starts again from the first step; Exit closes the walkthrough. Esc also exits.", when: "During Read and watch.", effect: "view" }),
  c({ id: "explain.section", label: "Explanation sections", route: "any", where: "Explanation panel", does: "Opens or closes a deeper part of the explanation, such as the calculation or the relevant code.", when: "You want more detail than the plain words.", effect: "view" }),
  c({ id: "evidence.levels", label: "Your evidence", route: "any", where: "Bottom of the explanation panel", does: "Lets you record, yourself, that you explored, practised, implemented or tested a concept. Nothing ticks itself.", when: "You want to keep track of what you have done.", effect: "saves", learn: { purpose: "A record you keep, separate from simply having opened a page.", input: "Your ticks.", changes: "Saves the date in this browser.", lookFor: "The map on Home counts only what you recorded.", misconception: "Finishing a walkthrough or tour is not recorded here: following along is not the same as explaining it yourself." } }),
  c({ id: "cycle.predict", label: "Predict, then observe", route: "any", where: "Try it section", does: "An optional prediction before you run the experiment, checked against the actual result once it exists.", when: "You want to test your own expectation.", effect: "view" }),
  c({ id: "cycle.explain", label: "Save your explanation", route: "any", where: "Try it section", does: "Saves what you wrote to the Notebook. The Lab never grades it.", when: "You want to keep your reasoning.", effect: "saves" }),

  // ---- home
  c({ id: "home.start", label: "Open the Bigram journey", route: "home", where: "Home, Start here", does: "Opens the guided lesson that follows one real run of your engine.", when: "The words are new and you want one example from start to finish.", effect: "navigates" }),
  c({ id: "home.recommend", label: "Recommended next step", route: "home", where: "Home, top right", does: "Opens the experiment suggested from the evidence you recorded.", when: "You are not sure what to do next.", effect: "navigates" }),
  c({ id: "home.guide-step", label: "Guided session steps", route: "home", where: "Home, First guided session", does: "Ticks a step of the 30-minute session off. Only you tick them.", when: "You did a step.", effect: "saves" }),

  // ---- bigram journey
  c({ id: "journey.mode", label: "Guided lesson or Explore all", route: "journey", where: "Bigram journey, top right", does: "Guided shows one stage at a time; Explore all shows all six at once. Both explain the same run, and your selections stay when you switch.", when: "Guided for learning in order; Explore all to compare stages or look something up.", effect: "view" }),
  c({ id: "journey.change-inputs", label: "Change the inputs", route: "journey", where: "Bigram journey, under the title", does: "Shows the form for the training text, prompt, length and seed. Editing it changes nothing until you press Run the journey.", when: "You want the lesson to explain a different run.", effect: "view" }),
  c({ id: "journey.run", label: "Run the journey", route: "journey", where: "Bigram journey, inputs form", does: "Asks your engine for one new snapshot: the training text, its count table and a traced run, all read together.", when: "After changing the inputs.", effect: "engine", reveal: { section: "inputs" },
    learn: { purpose: "Produces the run the whole lesson explains.", input: "Training text, prompt, number of characters, seed.", changes: "Replaces the run on screen. Until you press it, the earlier run stays, marked stale if the inputs differ.", lookFor: "The run summary under the title names the run every stage explains.", visual: "run" } }),
  c({ id: "journey.seed", label: "Seed", route: "journey", where: "Bigram journey, inputs form", does: "Chooses which random numbers the engine draws. The same seed with the same text, prompt and length gives the same run.", when: "To repeat a run exactly, or to see a different one.", effect: "setting", term: "seed", reveal: { section: "inputs" },
    learn: { purpose: "Makes sampling repeatable.", input: "A whole number.", changes: "Nothing until you run; then the draws, and so possibly the characters, differ.", lookFor: "The first step's probabilities stay the same for the same prompt; only the draw changes.", misconception: "A seed does not pick the most likely character, and two seeds can still produce the same text by chance.", visual: "seed" }, questions: ["why did I get different text", "same output again"] }),
  c({ id: "journey.prompt", label: "Prompt", route: "journey", where: "Bigram journey, inputs form", does: "The text the run starts from. Only its last character matters to this model.", when: "To start the run from a different character.", effect: "setting", term: "context-window", reveal: { section: "inputs" } }),
  c({ id: "journey.details", label: "Run details and provenance", route: "journey", where: "Bigram journey, under the run summary", does: "Shows the text file, its fingerprint, the engine version and the functions behind every number.", when: "You want to check exactly which run you are looking at.", effect: "view" }),
  c({ id: "journey.stages", label: "Lesson stages", route: "journey", where: "Bigram journey, the numbered row (a chooser on narrow screens)", does: "Opens any of the six stages. The order is the order to learn them in.", when: "To jump back to a stage, or ahead.", effect: "view" }),
  c({ id: "journey.next", label: "Next stage", route: "journey", where: "Bigram journey, below the stage", does: "Moves the lesson to the next stage. It never moves by itself.", when: "You are done with this stage.", effect: "view" }),
  c({ id: "journey.back", label: "Back", route: "journey", where: "Bigram journey, below the stage", does: "Moves the lesson to the previous stage.", when: "You want to look again.", effect: "view" }),
  c({ id: "journey.replay", label: "Replay this step", route: "journey", where: "Bigram journey, below the stage", does: "Shows this stage's result again: counting replays place by place, sampling slides the draw in, repetition plays the same output from its first character.", when: "You want to watch it happen again.", effect: "view",
    learn: { purpose: "Watch the same result once more.", input: "The run already on screen.", changes: "Only the presentation restarts.", lookFor: "The same numbers and characters as before.", misconception: "Replay does not rerun the engine and draws no new random numbers; it shows the stored run again.", visual: "replay" } }),
  c({ id: "journey.pair", label: "Pair to highlight", route: "journey", where: "Training text and Count pairs stages", does: "Picks the pair of characters to find in the text. The count beside it is your engine's.", when: "To see where a pair comes from in the text.", effect: "view", reveal: { stage: 0 } }),
  c({ id: "journey.context", label: "Context character", route: "journey", where: "Calculate probabilities stage", does: "Picks which row of the count table to turn into probabilities.", when: "To compare a character with many followers and one with a single follower.", effect: "view", reveal: { stage: 3 },
    learn: { purpose: "One character selects one row: everything that followed it in the text.", input: "One character.", changes: "Which row is divided by its total.", lookFor: "The total (the denominator) and that the probabilities add up to one.", visual: "normalize" } }),
  c({ id: "journey.sample-step", label: "Which step to sample", route: "journey", where: "Sample a character stage, the arrows", does: "Shows the draw of an earlier or later generated step from the same run.", when: "To see how another character was picked.", effect: "view", reveal: { stage: 4 } }),
  c({ id: "journey.next-step", label: "Next step (append and repeat)", route: "journey", where: "Append and repeat stage", does: "Reveals the next character of the run that is already on screen, and moves the context forward by one.", when: "To follow generation one character at a time.", effect: "view", reveal: { stage: 5 },
    learn: { purpose: "Shows one generation step: context, row, draw, chosen character, new context.", input: "The stored trace of the run.", changes: "One more stored step becomes visible; nothing is computed.", lookFor: "The dashed underline: the context the next prediction reads.", misconception: "It does not ask the engine for a new character; the whole run was computed when it was requested, and this reveals it step by step.", visual: "nextStep" } }),
  c({ id: "journey.play", label: "Play", route: "journey", where: "Append and repeat stage", does: "Reveals the stored steps one after another until you pause.", when: "To watch the whole run unfold.", effect: "view", reveal: { stage: 5 } }),
  c({ id: "journey.diagram", label: "Process diagram", route: "journey", where: "Below the stage (Guided) or at the top (Explore all)", does: "The model's information flow. Each box opens the stage that explains it; the dashed loop is the chosen character becoming the next context.", when: "You want to see where the current step fits.", effect: "view", learn: { purpose: "Shows what feeds what, including the loop back to the context.", input: "Nothing: it is a map.", changes: "Pressing a box opens its stage.", lookFor: "The highlighted boxes are the current stage.", misconception: "The probabilities do not produce the prompt: the prompt's last character selects the row.", visual: "context" } }),

  // ---- playground
  c({ id: "playground.prompt", label: "Your text", route: "playground", where: "Writing playground, the editor", does: "The text the engine continues. Only its last character is used.", when: "Always: type anything.", effect: "setting", term: "context-window", questions: ["what does the model look at"] }),
  c({ id: "playground.suggest", label: "Suggest", route: "playground", where: "Writing playground, Your text", does: "Asks your engine for a continuation of your text, with a trace of every character.", when: "You want a suggestion.", effect: "engine", disabled: "Type at least one character first, and wait for a running request to finish.",
    learn: { purpose: "One real generation request.", input: "The last character of your text, the training text, the length and the seed.", changes: "Shows a new suggestion and trace; the earlier one is replaced.", lookFor: "The marked last character and the trace below.", visual: "run" } }),
  c({ id: "playground.accept", label: "Accept", route: "playground", where: "Writing playground, Your text (Tab also accepts)", does: "Appends the suggestion shown to your text, so it becomes the new prompt.", when: "You like the suggestion and want to continue from it.", effect: "setting", disabled: "There is no current suggestion: press Suggest, or press Suggest again after changing a setting.",
    learn: { purpose: "Turns generated text into your own editable text.", input: "The suggestion currently shown (only the steps revealed so far).", changes: "Your text grows; the old trace is cleared.", lookFor: "The new last character, which the next suggestion will start from.", visual: "accept" } }),
  c({ id: "playground.another", label: "Another suggestion", route: "playground", where: "Writing playground, Your text", does: "Picks a new random seed and asks your engine again.", when: "You want a different continuation of the same text.", effect: "engine", term: "seed", questions: ["why did I get different text"] }),
  c({ id: "playground.engine", label: "Engine", route: "playground", where: "Writing playground, settings", does: "Chooses the model. Only the character bigram is built; the others are listed as future stages.", when: "Not yet: there is one engine.", effect: "setting" }),
  c({ id: "playground.corpus", label: "Training text", route: "playground", where: "Writing playground, settings", does: "Chooses which text's counts the engine uses. The suggestion shown becomes stale until you suggest again.", when: "To see how the training text shapes the suggestion.", effect: "setting", term: "corpus" }),
  c({ id: "playground.length", label: "Length", route: "playground", where: "Writing playground, settings", does: "How many characters to generate.", when: "For a shorter or longer suggestion.", effect: "setting" }),
  c({ id: "playground.seed", label: "Seed", route: "playground", where: "Writing playground, settings", does: "Chooses which random numbers the engine draws. Same text, training text, length and seed: same suggestion.", when: "To repeat a suggestion exactly, or change it.", effect: "setting", term: "seed",
    learn: { purpose: "Makes generation repeatable.", input: "A whole number from 0 to 4,294,967,295.", changes: "Nothing until you press Suggest.", lookFor: "With the same prompt, the first step's probabilities never change; only the draws do.", misconception: "A seed does not choose the most likely character, and different seeds do not always give different text.", visual: "seed" }, questions: ["why did I get different text", "repeat the same result"] }),
  c({ id: "playground.random-seed", label: "Random seed", route: "playground", where: "Writing playground, beside Seed", does: "Fills in a random seed. Nothing runs until you press Suggest.", when: "You want a fresh run without thinking of a number.", effect: "setting" }),
  c({ id: "playground.step", label: "Step", route: "playground", where: "Writing playground, Generation trace", does: "Reveals the next character of the current trace. With no current suggestion it first asks your engine for one, then shows its first step.", when: "To watch one character at a time.", effect: "view", disabled: "Type some text first, or the whole trace is already shown.",
    learn: { purpose: "Follow generation step by step.", input: "The stored trace of the current suggestion.", changes: "One more step is revealed; the engine is only called if there was no current suggestion.", lookFor: "The selected row's context, probabilities and draw.", misconception: "Stepping draws no new random numbers, so it always matches the full suggestion.", visual: "nextStep" } }),
  c({ id: "playground.play", label: "Play", route: "playground", where: "Writing playground, Generation trace", does: "Reveals the current trace one step after another until you pause. With no current suggestion it first asks your engine for one.", when: "To watch the whole suggestion unfold.", effect: "view" }),
  c({ id: "playground.reset", label: "Reset", route: "playground", where: "Writing playground, Generation trace", does: "Clears the suggestion and trace from the screen.", when: "To start over from your text.", effect: "view", disabled: "There is nothing to reset yet." }),
  c({ id: "playground.trace-row", label: "A step of the trace", route: "playground", where: "Writing playground, Generation trace table", does: "Shows that step's probabilities and where its draw landed.", when: "To understand why this character was selected.", effect: "view", questions: ["why was this character chosen", "understand why this character was selected"] }),
  c({ id: "playground.compare-mode", label: "What differs", route: "playground", where: "Writing playground, Compare side by side", does: "Chooses what the comparison varies: the prompt or the seed. Earlier results keep the mode they were run in and are marked stale.", when: "Before Run both.", effect: "setting" }),
  c({ id: "playground.run-both", label: "Run both", route: "playground", where: "Writing playground, Compare side by side", does: "Asks your engine for A and B with exactly one difference.", when: "To test what the engine depends on.", effect: "engine" }),

  // ---- counts
  c({ id: "counts.corpus", label: "Training text", route: "counts", where: "Counts, top", does: "Chooses whose counts to show.", when: "To compare what two texts teach the engine.", effect: "reads", term: "corpus" }),
  c({ id: "counts.shade", label: "Shade cells by", route: "counts", where: "Counts, Count table", does: "Colours the table by raw count or by each row's probabilities.", when: "Counts show common pairs; row probabilities show what follows each character.", effect: "view" }),
  c({ id: "counts.row", label: "A row of the table", route: "counts", where: "Counts, the row buttons on the left of the table", does: "Selects a context character; the panels below divide its row by its total and draw from it.", when: "To inspect one character.", effect: "view", term: "conditional-probability" }),
  c({ id: "counts.draw", label: "Draw with your engine", route: "counts", where: "Counts, From a draw to a character", does: "Asks your engine for one character after the selected one, with the seed shown, and marks where the draw landed.", when: "To see one real draw.", effect: "engine", learn: { purpose: "The single step that generation repeats.", input: "The selected character, the training text and the seed.", changes: "Shows the draw on the strip.", lookFor: "Which stretch the red line falls in.", visual: "draw" } }),
  c({ id: "counts.draws-1000", label: "Run 1,000 draws", route: "counts", where: "Counts, From a draw to a character", does: "Draws 1,000 times in the browser with the same rule and these exact probabilities, and compares the shares with the probabilities.", when: "To see that frequent draws follow the probabilities.", effect: "simulation" }),
  c({ id: "counts.ask", label: "Ask the engine", route: "counts", where: "Counts, Ask about any character", does: "Asks your engine for the row of any character, including one it never saw.", when: "To see how the engine handles an unseen context.", effect: "engine", term: "unseen-context" }),
  c({ id: "counts.recount", label: "Recount with your engine", route: "counts", where: "Counts, Change the training text", does: "Counts your edited text with the engine and compares the selected row before and after. Nothing is saved.", when: "To see how adding text changes the counts.", effect: "engine" }),
  c({ id: "counts.smoothing", label: "Add-k strength", route: "counts", where: "Counts, Smoothing", does: "Adds k to every count before dividing, in the browser, to show the effect of smoothing.", when: "To see how unseen characters get a small probability.", effect: "simulation", term: "smoothing",
    learn: { purpose: "Avoid probability zero for unseen pairs.", input: "The selected row's counts and k.", changes: "The smoothed column; your engine itself never smooths.", lookFor: "The share given to characters that never followed this one.", misconception: "Smoothing adds no knowledge; it only moves probability from seen to unseen.", visual: "smoothing" } }),

  // ---- data and tokens
  c({ id: "data.tabs", label: "Data and tokens tabs", route: "data", where: "Data and tokens, top", does: "Switches between the training texts, tokenizers, context windows and data splits.", when: "To move between the four parts of data preparation.", effect: "view" }),
  c({ id: "data.corpus-pick", label: "A training text", route: "data", where: "Data and tokens, Corpus tab, Training texts", does: "Shows that text's preview, statistics and character frequency.", when: "To look inside a training text.", effect: "reads", reveal: { tab: "corpus" } }),
  c({ id: "data.corpus-delete", label: "Delete a training text", route: "data", where: "Data and tokens, Corpus tab, beside an uploaded text", does: "Deletes an uploaded text from the Lab folder after you confirm. The bundled texts cannot be deleted.", when: "You no longer need an uploaded text.", effect: "deletes", reveal: { tab: "corpus" } }),
  c({ id: "data.whitespace", label: "Show spaces and newlines", route: "data", where: "Data and tokens, Corpus tab, Preview", does: "Shows spaces as ␣ and line breaks as ↵, the way the engine counts them.", when: "To see that spaces are characters too.", effect: "view", reveal: { tab: "corpus" } }),
  c({ id: "data.add", label: "Save as a training text", route: "data", where: "Data and tokens, Corpus tab, Add your own text", does: "Saves your text to the Lab folder as a new training text with its own id. Nothing is uploaded anywhere.", when: "To train on your own text.", effect: "saves", reveal: { tab: "corpus" }, disabled: "Paste or type some text first; it must be under 2,000,000 characters." }),
  c({ id: "data.sentence", label: "Your sentence", route: "data", where: "Data and tokens, Tokenizers tab", does: "The sentence the three tokenizers cut up, live.", when: "To compare tokenizers on your own words.", effect: "simulation", reveal: { tab: "tokens" }, questions: ["how does text become tokens", "see how your text becomes tokens"] }),
  c({ id: "data.ids", label: "IDs back to tokens", route: "data", where: "Data and tokens, Tokenizers tab", does: "Turns ID numbers back into characters using this sentence's table.", when: "To see that an ID is a label for looking a token up.", effect: "view", term: "token-id", reveal: { tab: "tokens" } }),
  c({ id: "data.merges", label: "Merges learned", route: "data", where: "Data and tokens, Tokenizers tab, Byte-pair encoding", does: "How many merges the teaching BPE learns from the sample. More merges: fewer, longer tokens.", when: "To see how learned tokens form.", effect: "simulation", term: "bpe", reveal: { tab: "tokens" } }),
  c({ id: "data.window", label: "Context size and window position", route: "data", where: "Data and tokens, Windows and pairs tab", does: "Sets how many characters the context holds and which window to show.", when: "To see how training pairs are cut from text.", effect: "simulation", term: "context-window", reveal: { tab: "windows" } }),
  c({ id: "data.strategy", label: "Split strategy", route: "data", where: "Data and tokens, Splits and leakage tab", does: "Makes windows first and splits them at random, or cuts the text first. Red characters are read by both sides.", when: "To see where leakage happens.", effect: "simulation", term: "leakage", reveal: { tab: "splits" },
    learn: { purpose: "Keep validation text unseen.", input: "The first characters of the sample, a window size and a validation share.", changes: "Which characters each side reads.", lookFor: "Red, underlined characters: read by a training and a validation window.", visual: "splits" } }),
  c({ id: "data.record", label: "Record this result", route: "data", where: "Data and tokens, Splits and leakage tab", does: "Saves this split's leakage count to your history and fills in the Try it observation.", when: "After trying a strategy.", effect: "saves", reveal: { tab: "splits" } }),

  // ---- neural
  c({ id: "neural.scalar", label: "Gradient descent on one number", route: "neural", where: "Neural training, first panel", does: "Starting value, learning rate and step count for the one-number example; the path updates instantly.", when: "Before the full network: the same idea on one number.", effect: "simulation", term: "gradient" }),
  c({ id: "neural.example", label: "Context tokens and correct token", route: "neural", where: "Neural training, One training step", does: "The training example: two context IDs and the token that should come next.", when: "To change what the step learns from.", effect: "simulation" }),
  c({ id: "neural.apply", label: "Apply one update", route: "neural", where: "Neural training, One training step", does: "Moves every weight of the browser network by −learning rate × its gradient, and shows before and after.", when: "To watch one neural-network update.", effect: "simulation", questions: ["how does it learn", "watch one neural-network update"],
    learn: { purpose: "One training step, every number shown.", input: "The current weights, the example and the learning rate.", changes: "The browser network's weights. Your Python engine is not involved.", lookFor: "The before and after table, and whether the loss went down.", misconception: "This trains a small simulation in your browser, not your bigram engine.", visual: "update" } }),
  c({ id: "neural.reset", label: "Reset weights", route: "neural", where: "Neural training, One training step", does: "Puts the seeded starting weights back.", when: "To start the updates over.", effect: "simulation" }),
  c({ id: "neural.lr", label: "Learning rate", route: "neural", where: "Neural training, One training step and the training run", does: "How far each update moves the weights.", when: "Too small: slow. Too large: the loss can go up.", effect: "setting", term: "learning-rate" }),
  c({ id: "neural.train", label: "Train", route: "neural", where: "Neural training, A training run", does: "Trains the browser network for the chosen number of steps in a background worker and draws the loss curves.", when: "To see overfitting.", effect: "simulation", term: "overfitting" }),

  // ---- attention
  c({ id: "attention.tokens", label: "Tokens", route: "attention", where: "Attention explorer, Sequence", does: "The words to attend over; every matrix is recomputed from them.", when: "To try your own sequence.", effect: "simulation" }),
  c({ id: "attention.mask", label: "Causal mask", route: "attention", where: "Attention explorer, Sequence", does: "Stops each position from reading later positions.", when: "Turn it off to see how the future would leak.", effect: "simulation", term: "causal-mask",
    learn: { purpose: "Next-token training must not show the answer.", input: "The scores matrix.", changes: "Later positions get −∞ before softmax, so weight exactly 0.", lookFor: "The upper-right cells of the weights.", visual: "mask" } }),
  c({ id: "attention.positions", label: "Positional information", route: "attention", where: "Attention explorer, Sequence", does: "Adds a position vector to each token vector.", when: "Off: repeated words become identical rows.", effect: "simulation", term: "positional-encoding" }),
  c({ id: "attention.heads", label: "Heads", route: "attention", where: "Attention explorer, Sequence", does: "One head with 4 dimensions, or two heads with 2 each.", when: "To compare one and two heads.", effect: "view", term: "multi-head" }),
  c({ id: "attention.query", label: "Query position", route: "attention", where: "Attention explorer, Sequence", does: "Picks the position to follow through every matrix.", when: "To see one position's scores, weights and output.", effect: "view" }),

  // ---- decoding
  c({ id: "decoding.logits", label: "Logits", route: "decoding", where: "Decoding sandbox, Logits", does: "Scores you can edit; no trained model is involved.", when: "To set up a distribution to decode.", effect: "setting", term: "logits" }),
  c({ id: "decoding.temperature", label: "Temperature", route: "decoding", where: "Decoding sandbox, settings", does: "Divides the logits by T before softmax: above 1 flattens the distribution, below 1 sharpens it.", when: "To make choices more or less adventurous.", effect: "simulation", term: "temperature",
    learn: { purpose: "Controls how spread out the probabilities are.", input: "The logits and T.", changes: "The probabilities made from the scores.", lookFor: "The top token's share in the second column.", misconception: "Temperature changes no learned weight and no logit; it only reshapes the probabilities.", visual: "temperature" } }),
  c({ id: "decoding.filters", label: "Top-k and top-p", route: "decoding", where: "Decoding sandbox, settings", does: "Removes unlikely tokens before sampling: top-k keeps a fixed number, top-p keeps the smallest set reaching a share.", when: "To stop rare tokens from being drawn.", effect: "simulation", term: "top-p" }),
  c({ id: "decoding.greedy", label: "Greedy", route: "decoding", where: "Decoding sandbox, settings", does: "Always takes the most likely token; no randomness.", when: "For the same answer every time.", effect: "simulation", term: "greedy" }),
  c({ id: "decoding.draw", label: "Draw", route: "decoding", where: "Decoding sandbox, Repeated draws", does: "Draws many times from the final column with a browser random generator.", when: "To compare observed shares with the probabilities.", effect: "simulation" }),

  // ---- evaluation
  c({ id: "evaluation.split", label: "Training and validation share", route: "evaluation", where: "Evaluation bench, settings", does: "How the text is cut into training, validation and test parts.", when: "To change how much text is counted and how much is held out.", effect: "setting", term: "split" }),
  c({ id: "evaluation.on", label: "Measure on: validation or test", route: "evaluation", where: "Evaluation bench, settings", does: "Scores on the validation part (for trying settings) or the test part (one final check).", when: "Validation while choosing k; test once at the end.", effect: "setting", term: "split",
    learn: { purpose: "Keep one part of the text for an independent final score.", input: "Your choice.", changes: "Which held-out part is scored when you measure.", lookFor: "The result says which part it was measured on.", misconception: "Choosing settings by their test score makes the test part of tuning, so its score is no longer an independent check.", visual: "splits" }, questions: ["how do I know it improved", "compare results fairly"] }),
  c({ id: "evaluation.k", label: "Smoothing k", route: "evaluation", where: "Evaluation bench, settings", does: "k = 0 is your engine exactly; above 0 is a Lab-side add-k variant used only for scoring.", when: "To see why unsmoothed loss is infinite.", effect: "setting", term: "smoothing" }),
  c({ id: "evaluation.measure", label: "Measure", route: "evaluation", where: "Evaluation bench, settings", does: "Counts the training part with your engine and scores every held-out character. Nothing random is involved.", when: "After choosing the settings.", effect: "engine", disabled: "Fix the split first: each part needs at least 1% of the text.",
    learn: { purpose: "One number for how surprised the engine is by unseen text.", input: "The training text, the split, the part to score and k.", changes: "Shows a new result; earlier results keep their own settings and are marked stale.", lookFor: "Mean loss against the uniform baseline.", visual: "run" } }),
  c({ id: "evaluation.sweep", label: "Run the k sweep on validation", route: "evaluation", where: "Evaluation bench, Controlled ablation", does: "Measures eight values of k, changing nothing else, always on validation.", when: "To choose k fairly.", effect: "engine", term: "ablation" }),
  c({ id: "evaluation.save", label: "Save run", route: "evaluation", where: "Evaluation bench, result", does: "Saves the result with the exact settings that produced it, in this browser.", when: "To compare runs later.", effect: "saves" }),

  // ---- adaptation
  c({ id: "adapt.tabs", label: "Adaptation tabs", route: "adapt", where: "Adaptation and retrieval, top", does: "Switches between how models are adapted, continued training and retrieval.", when: "To move between the three routes.", effect: "view" }),
  c({ id: "adapt.continue", label: "Continue training", route: "adapt", where: "Adaptation and retrieval, Continued training tab", does: "Counts the new text and adds those counts to the base text's, for this request only, then compares a row and held-out losses.", when: "To see how new text shifts the engine.", effect: "engine", reveal: { tab: "continued" }, term: "continued-training",
    learn: { purpose: "Your engine's version of training on more data.", input: "A base training text, a new text and a character to watch.", changes: "Shows before and after; your stored texts and engine files are not modified.", lookFor: "Lower loss on the new text, often higher on the old.", visual: "run" } }),
  c({ id: "adapt.question", label: "Question", route: "adapt", where: "Adaptation and retrieval, Retrieval tab, Search", does: "The question passages are scored against, by shared words.", when: "To see what retrieval finds for a question.", effect: "simulation", reveal: { tab: "retrieval" }, term: "lexical-search", questions: ["how do I use my notes", "inspect which document passages were retrieved"] }),
  c({ id: "adapt.chunks", label: "Chunk size and overlap", route: "adapt", where: "Adaptation and retrieval, Retrieval tab, Chunks", does: "How documents are cut into passages.", when: "To see how chunking changes what can be found.", effect: "simulation", reveal: { tab: "retrieval" }, term: "chunking" }),
  c({ id: "adapt.copy", label: "Copy the prompt", route: "adapt", where: "Adaptation and retrieval, Retrieval tab, Assembled prompt", does: "Copies the assembled prompt to the clipboard. No model answers it here.", when: "To use the prompt elsewhere.", effect: "view", reveal: { tab: "retrieval" } }),

  // ---- serving
  c({ id: "serving.send", label: "Send a request", route: "serving", where: "Serving and performance, One request", does: "Sends one real generation request (40 characters, seed 1) and times its stages.", when: "To see where the time goes.", effect: "engine", term: "latency" }),
  c({ id: "serving.benchmark", label: "Run the benchmark", route: "serving", where: "Serving and performance, Latency and throughput", does: "Repeats real generations inside the backend and reports the spread of times.", when: "For typical and slow-case latency.", effect: "engine", term: "throughput" }),
  c({ id: "serving.stream", label: "Stream it / Send it whole", route: "serving", where: "Serving and performance, Streaming", does: "Replays a real trace at a fixed, made-up speed, either character by character or all at the end.", when: "To compare when the first character appears.", effect: "simulation", term: "streaming" }),

  // ---- glossary and notebook
  c({ id: "glossary.search", label: "Search terms", route: "glossary", where: "Glossary, top of the list", does: "Filters the 75 terms by name, alias or meaning.", when: "To look a word up.", effect: "view" }),
  c({ id: "glossary.bookmark", label: "Bookmark", route: "any", where: "A glossary entry", does: "Saves the term to your bookmarks in this browser.", when: "To come back to a term.", effect: "saves" }),
  c({ id: "notebook.add", label: "Save a note or question", route: "notebook", where: "Notebook, top", does: "Saves a note or a question in this browser.", when: "Something is unclear or worth remembering.", effect: "saves" }),
  c({ id: "notebook.export", label: "Export or import", route: "notebook", where: "Notebook, Your data", does: "Downloads all your Lab data as a file, or loads one back.", when: "To back up or move to another browser.", effect: "saves" }),
  c({ id: "notebook.reset", label: "Reset the Lab", route: "notebook", where: "Notebook, Your data", does: "Deletes all notes, evidence, bookmarks and saved runs in this browser after you confirm. Uploaded texts stay.", when: "Only to start completely fresh.", effect: "deletes" }),

  // ---- further controls, page by page
  c({ id: "home.resume", label: "Resume", route: "home", where: "Home, top right", does: "Opens the workspace you used last.", when: "To pick up where you left off.", effect: "navigates" }),
  c({ id: "counts.draw-seed", label: "Seed for the draw", route: "counts", where: "Counts, From a draw to a character", does: "Which random number your engine draws for the one-character draw.", when: "To repeat a draw, or try another.", effect: "setting", term: "seed" }),
  c({ id: "neural.weight-seed", label: "Weight seed", route: "neural", where: "Neural training, One training step", does: "Chooses the random starting weights of the browser network and starts over from them.", when: "To see the same step from a different starting point.", effect: "simulation", term: "seed" }),
  c({ id: "neural.run-settings", label: "Training run settings", route: "neural", where: "Neural training, A training run", does: "Hidden units, number of steps, batch size and seed for the next browser training run. Nothing trains until you press Train.", when: "Before Train, to change one thing between runs.", effect: "setting", term: "batch" }),
  c({ id: "attention.check", label: "Replace the last token", route: "attention", where: "Attention explorer, Check: can the future leak backwards?", does: "Swaps the last token and recomputes, to show which earlier outputs change.", when: "To prove the mask keeps the future out.", effect: "simulation", term: "causal-mask" }),
  c({ id: "decoding.presets", label: "Preset", route: "decoding", where: "Decoding sandbox, Logits", does: "Loads a ready-made set of scores: a sentence, a nearly flat set, or one clear winner.", when: "To compare decoding on different shapes of distribution.", effect: "setting" }),
  c({ id: "decoding.edit-rows", label: "Add, remove or reset tokens", route: "decoding", where: "Decoding sandbox, Logits", does: "Adds a token, removes one, or puts the sentence preset back.", when: "To build your own example.", effect: "setting" }),
  c({ id: "decoding.draw-settings", label: "Number of draws and seed", route: "decoding", where: "Decoding sandbox, Repeated draws", does: "How many browser draws to make, and which random numbers they use.", when: "More draws: observed shares closer to the probabilities.", effect: "setting" }),
  c({ id: "evaluation.corpus", label: "Training text", route: "evaluation", where: "Evaluation bench, settings", does: "Which text is split, counted and scored.", when: "To evaluate another text.", effect: "setting", term: "corpus" }),
  c({ id: "evaluation.sort", label: "Order of the examples", route: "evaluation", where: "Evaluation bench, Per-example loss", does: "Lists the scored characters worst first, or in text order.", when: "Worst first for error analysis.", effect: "view", term: "error-analysis" }),
  c({ id: "evaluation.export", label: "Export runs", route: "evaluation", where: "Evaluation bench, Saved runs", does: "Downloads your saved runs as a JSON file or a spreadsheet file.", when: "To keep or share your results.", effect: "saves" }),
  c({ id: "evaluation.compare", label: "Baseline and candidate", route: "evaluation", where: "Evaluation bench, Saved runs", does: "Picks two saved runs to compare side by side.", when: "To see whether a change helped.", effect: "view", term: "baseline" }),
  c({ id: "evaluation.rerun", label: "Rerun", route: "evaluation", where: "Evaluation bench, Saved runs", does: "Puts that run's settings back in the controls and measures them again with your engine, then says whether the result reproduced.", when: "To check a saved result still holds.", effect: "engine", term: "reproducibility" }),
  c({ id: "adapt.scenario", label: "Weights or prompt", route: "adapt", where: "Adaptation and retrieval, Where does the information live?", does: "Your answer for each scenario, checked at once.", when: "To test the difference between training and prompting.", effect: "view", reveal: { tab: "stages" }, term: "prompt-vs-weights" }),
  c({ id: "adapt.texts", label: "Base text, new text and watched character", route: "adapt", where: "Adaptation and retrieval, Continued training tab", does: "The inputs for Continue training. Nothing is counted until you press it.", when: "Before Continue training.", effect: "setting", reveal: { tab: "continued" } }),
  c({ id: "adapt.docs", label: "Add a document", route: "adapt", where: "Adaptation and retrieval, Retrieval tab, Documents", does: "Adds an empty document to search. Documents stay in this page only.", when: "To search your own notes.", effect: "setting", reveal: { tab: "retrieval" } }),
  c({ id: "adapt.passages", label: "Passages to include", route: "adapt", where: "Adaptation and retrieval, Retrieval tab, Search", does: "How many of the best-scoring passages go into the prompt.", when: "More context against more noise.", effect: "simulation", reveal: { tab: "retrieval" } }),
  c({ id: "serving.prompt", label: "Prompt for the timed request", route: "serving", where: "Serving and performance, One request", does: "The text the timed request sends.", when: "Before Send a request.", effect: "setting" }),
  c({ id: "serving.bench-settings", label: "Benchmark size", route: "serving", where: "Serving and performance, Latency and throughput", does: "How many requests the benchmark makes and how long each is.", when: "Before running the benchmark.", effect: "setting" }),
  c({ id: "serving.batch", label: "Batch size", route: "serving", where: "Serving and performance, Batching", does: "Groups requests in an illustration with stated, made-up costs. Your engine does not batch.", when: "To see the trade-off between waiting and sharing work.", effect: "simulation", term: "serving-batch" }),
  c({ id: "serving.kv", label: "Tokens generated", route: "serving", where: "Serving and performance, KV cache", does: "Changes the worked example's count of key and value computations, with and without a cache.", when: "To see how the saving grows with length.", effect: "view", term: "kv-cache" }),
  c({ id: "serving.quant", label: "Bits per weight", route: "serving", where: "Serving and performance, Quantization", does: "Rounds eight example weights to fewer bits and shows the error.", when: "To see what precision is lost.", effect: "view", term: "quantization" }),
  c({ id: "glossary.filter", label: "Filter by stage", route: "glossary", where: "Glossary, under the search", does: "Shows only the terms of one stage, or your bookmarks.", when: "To browse one topic.", effect: "view" }),
  c({ id: "notebook.filter", label: "Show", route: "notebook", where: "Notebook, your notes", does: "Shows all notes, or only questions, predictions or explanations.", when: "To review one kind.", effect: "view" }),
  c({ id: "notebook.resolve", label: "Mark resolved", route: "notebook", where: "Notebook, beside a question", does: "Marks a question as answered, or not.", when: "Once you found the answer.", effect: "saves" }),
  c({ id: "notebook.delete", label: "Delete this note", route: "notebook", where: "Notebook, beside a note", does: "Deletes one note from this browser.", when: "You no longer need it.", effect: "deletes" }),

  c({ id: "notebook.checkpoint-practice", label: "Practice mode", route: "notebook", where: "Notebook, Learning checkpoints", does: "Asks every lesson checkpoint again when you press Next, even ones you passed.", when: "To practise a section again.", effect: "setting" }),
  c({ id: "notebook.checkpoint-reset", label: "Reset checkpoint progress", route: "notebook", where: "Notebook, Learning checkpoints", does: "Removes every checkpoint outcome after you confirm. Notes, evidence and saved runs stay.", when: "To start the checkpoints fresh.", effect: "deletes" }),

  // ---- toolkit guide
  c({ id: "toolkit.tours", label: "Toolkit tours", route: "toolkit", where: "Toolkit Guide, Guided tours", region: true, does: "Three optional tours of the Lab, each step pointing at a real part of a page.", when: "You want to be shown around.", effect: "view" }),
]

export const CONTROL_BY_ID = new Map(CONTROLS.map((x) => [x.id, x]))

// ----------------------------------------------------------------------------- workspaces

export interface WorkspaceHelp {
  route: Route
  practical: string
  question: string
  when: string
  first: string
  canDo: string[]
  expect: string
  source: "Your model" | "Interactive simulation" | "Worked example" | "Your model and simulations" | "Reference"
  next: Route[]
}

export const WORKSPACE_HELP: WorkspaceHelp[] = [
  { route: "home", practical: "See your learning map and what to do next.", question: "Where am I, and what is a good next step?", when: "When you open the Lab.", first: "Nothing.", canDo: ["Open the Bigram journey", "Follow the recommended step", "Tick off the guided session"], expect: "A map of nine stages, counting only what you recorded.", source: "Reference", next: ["journey", "toolkit"] },
  { route: "journey", practical: "Follow one real prediction from training text to output.", question: "How does my engine turn a text and a prompt into the next character, and the one after?", when: "First, if the words are new.", first: "Nothing: it starts from a short example.", canDo: ["Step through six stages", "Highlight a pair in the text", "See the draw that picked each character", "Run it with your own inputs"], expect: "Every number from one snapshot of your engine.", source: "Your model", next: ["playground", "counts"] },
  { route: "playground", practical: "Understand why this character was selected.", question: "What does my engine suggest after my text, and why?", when: "After the journey, with your own text.", first: "The engine reads only the last character.", canDo: ["Get and accept suggestions", "Step through a trace", "Compare two prompts or two seeds"], expect: "Suggestions with a trace of every draw.", source: "Your model", next: ["counts", "decoding"] },
  { route: "data", practical: "See how your text becomes tokens.", question: "What does a model actually receive, and how is training data split fairly?", when: "Before neural models, or to add your own text.", first: "A token here is one character.", canDo: ["Preview and add training texts", "Compare three tokenizers", "Make context and target pairs", "See leakage between splits"], expect: "Live token, window and split views.", source: "Your model and simulations", next: ["counts", "neural"] },
  { route: "counts", practical: "See everything your engine learned: one table of counts.", question: "What has my engine learned, and how does that become a probability?", when: "To look under the hood of a prediction.", first: "A row is everything that followed one character.", canDo: ["Inspect any row", "Draw with your engine", "Ask about an unseen character", "Recount an edited text", "Try smoothing"], expect: "Your engine's real counts and draws.", source: "Your model and simulations", next: ["evaluation", "playground"] },
  { route: "neural", practical: "Watch one neural-network update.", question: "How does a neural network predict, and how does one training step change it?", when: "When counts are clear and you want what comes next (Stage 2).", first: "This is a browser simulation, not your engine.", canDo: ["Gradient descent on one number", "Apply one update with every number shown", "Train and watch overfitting"], expect: "Small arrays with their shapes and the loss.", source: "Interactive simulation", next: ["attention", "decoding"] },
  { route: "attention", practical: "See how one position mixes in the others.", question: "How does a position build its new vector from earlier ones, and why must it not see the future?", when: "After neural training (Stage 3).", first: "The vectors are toy numbers.", canDo: ["Follow one query", "Turn the causal mask off", "Prove the future can't leak"], expect: "Every matrix of one toy attention head.", source: "Interactive simulation", next: ["decoding"] },
  { route: "decoding", practical: "See how scores become one chosen token.", question: "What do temperature, top-k and top-p change?", when: "To understand sampling settings (Stage 4).", first: "The logits are values you set.", canDo: ["Edit logits", "Change temperature and filters", "Draw many times"], expect: "The distribution after each stage.", source: "Worked example", next: ["evaluation"] },
  { route: "evaluation", practical: "Compare results fairly.", question: "How good is my engine on unseen text, and when is one score really better?", when: "When you want to know if a change helped.", first: "Validation is for trying settings; test is for the final check.", canDo: ["Measure held-out loss", "Sweep smoothing k", "Save and compare runs"], expect: "Loss, perplexity and the worst predictions, from your engine.", source: "Your model", next: ["adapt", "serving"] },
  { route: "serving", practical: "See where the time goes in one request.", question: "What happens between pressing a button and seeing text?", when: "When you are curious about speed (Stage 5).", first: "Some panels are measured, some illustrated.", canDo: ["Time one real request", "Benchmark many", "Compare streaming"], expect: "Milliseconds on your machine.", source: "Your model and simulations", next: ["adapt"] },
  { route: "adapt", practical: "Inspect which document passages were retrieved.", question: "Does new information go into the weights or into the prompt?", when: "To compare continued training and retrieval (Stage 6).", first: "Retrieval here matches words, and ends at the prompt.", canDo: ["Add a text to the counts", "Chunk and search documents", "Read the assembled prompt"], expect: "Before and after counts; ranked passages.", source: "Your model and simulations", next: ["evaluation"] },
  { route: "glossary", practical: "Look up any term.", question: "What does this word mean, and where can I try it?", when: "Whenever a word is unclear.", first: "Nothing.", canDo: ["Search 75 terms", "Open each term's experiment", "Bookmark"], expect: "Plain and precise definitions, examples and misconceptions.", source: "Reference", next: ["toolkit"] },
  { route: "notebook", practical: "Keep your notes, questions and evidence.", question: "What have I noticed, asked and recorded?", when: "Any time; at the end of a session.", first: "Everything is stored in this browser.", canDo: ["Write notes and questions", "Review predictions and explanations", "Export your data"], expect: "Your own records, nothing graded.", source: "Reference", next: ["home"] },
  { route: "toolkit", practical: "Find the right page, control or tour.", question: "What is this for, and where should I go next?", when: "Whenever you are unsure.", first: "Nothing.", canDo: ["Search every page", "Find a control by a plain question", "Take a tour"], expect: "Answers that link to the real place.", source: "Reference", next: ["journey"] },
]

// ----------------------------------------------------------------------------- concepts

export interface ConceptHelp {
  id: string
  question: string
  also: string[]
  answer: string
  controls: string[]
  terms: string[]
}

export const CONCEPTS: ConceptHelp[] = [
  { id: "different-text", question: "Why did I get different text?", also: ["random", "different output", "seed", "sampling"], answer: "Your engine samples: it draws a random number for every character. The seed fixes those numbers, so the same model, prompt, length and seed give the same text. A different seed usually, but not always, gives different text.", controls: ["playground.seed", "playground.another", "journey.seed"], terms: ["seed", "sampling"] },
  { id: "looks-at", question: "What does the model look at?", also: ["context", "prompt", "last character", "input"], answer: "Your bigram engine looks at exactly one character: the last one of your text. Earlier words do not change its prediction. Neural models and transformers look at more (Stages 2 and 3).", controls: ["playground.prompt", "journey.prompt", "attention.query"], terms: ["context-window", "bigram"] },
  { id: "learn", question: "How does it learn?", also: ["training", "learning", "update", "weights"], answer: "Two different things in the Lab. Your bigram engine learns by counting pairs in its training text: that is all it stores. The Neural training page shows how a network learns instead, by nudging numbers with gradients; that page is a browser simulation, not your engine.", controls: ["counts.row", "neural.apply", "adapt.continue"], terms: ["bigram", "gradient", "continued-training"] },
  { id: "improved", question: "How do I know it improved?", also: ["better", "evaluate", "score", "loss", "compare"], answer: "Measure held-out loss on the Evaluation bench: text the engine never counted. Compare runs that differ in one setting, on the same text and split. Choose settings on validation and check once on test.", controls: ["evaluation.measure", "evaluation.on", "evaluation.sweep"], terms: ["loss", "perplexity", "split"] },
  { id: "notes", question: "How do I use my notes?", also: ["documents", "my own text", "retrieval", "rag", "search my notes"], answer: "Two ways. Add a text as a training text (Data and tokens) so your engine counts it. Or paste documents into Retrieval to see which passages a search would put into a prompt; no model answers that prompt here, and lexical search only matches shared words.", controls: ["data.add", "adapt.question", "adapt.chunks"], terms: ["rag", "lexical-search"] },
  { id: "chosen", question: "Why was this character chosen?", also: ["why this", "explain the choice", "probability", "draw"], answer: "Its context character selected a row of counts; each count divided by the row total is a probability; the random draw landed in this character's stretch. Select a step in the Playground trace or the journey to see all four.", controls: ["playground.trace-row", "journey.sample-step", "counts.draw"], terms: ["sampling", "distribution"] },
  { id: "confidence", question: "Is a high probability a confident fact?", also: ["confidence", "sure", "correct", "true"], answer: "No. A probability here says how often something followed in the training text, not whether it is true. A model can give high probability to something false.", controls: ["counts.row"], terms: ["confidence"] },
  { id: "real", question: "Is this my real model or a simulation?", also: ["real", "simulation", "my model", "fake"], answer: "Look at the label beside each panel title: Your model is your Python engine; Interactive simulation is browser code; Worked example is fixed values.", controls: ["layout.source"], terms: [] },
  { id: "temperature-q", question: "What does temperature change?", also: ["creative", "random", "sharper", "flatter"], answer: "Only how spread out the probabilities are: it divides the scores before softmax. It changes no learned weight.", controls: ["decoding.temperature"], terms: ["temperature"] },
  { id: "tokens-q", question: "How does text become tokens?", also: ["tokens", "tokenizer", "ids", "split text"], answer: "A tokenizer cuts text into units. Your engine uses single characters (Unicode code points); the Data and tokens page compares that with words and a toy byte-pair encoding.", controls: ["data.sentence", "data.ids", "data.merges"], terms: ["tokenization", "token-id", "bpe"] },
]

// ----------------------------------------------------------------------------- tours

export interface ToolkitStep {
  id: string
  route: Route
  /** A help id (data-help-id) or a teaching panel (data-teach), found on the page. */
  target: string
  title: string
  body: string
  more?: string
  /** One optional thing to do. Following it never runs an experiment. */
  action?: { label: string; open?: Route; help?: string }
  reveal?: Reveal
}

export interface ToolkitTour {
  id: "around" | "first-prediction" | "next-experiment"
  title: string
  minutes: string
  summary: string
  steps: ToolkitStep[]
}

export const TOURS: ToolkitTour[] = [
  {
    id: "around", title: "Find your way around", minutes: "about 5 minutes", summary: "Navigation, what each page is for, the source labels, the explanation panel, the glossary and the notebook.",
    steps: [
      { id: "nav", route: "home", target: "shell.nav", title: "Every page is here", body: "The sidebar lists every workspace, from first steps at the top to reference at the bottom. On a phone it is behind the menu button.", more: "The groups follow the learning order: write with your engine, look at text and counts, then neural models, then measuring and applying them." },
      { id: "start", route: "home", target: "home.start", title: "Start here", body: "The Bigram journey follows one real run of your engine, step by step. It is the gentlest first page.", action: { label: "What does this button open?", help: "home.start" } },
      { id: "source", route: "counts", target: "layout.source", title: "Where numbers come from", body: "Every panel carries a label. Your model means your Python engine computed it; Interactive simulation means browser code; Worked example means fixed values.", more: "Only Your model results come from nextword/bigram.py. The neural, attention and decoding pages are simulations: useful to see the mechanism, but not results of a model you trained." },
      { id: "explain", route: "counts", target: "layout.explanation", title: "The explanation beside the experiment", body: "The tinted panel explains the experiment in plain words, with the calculation and the code a click away.", more: "On narrow screens it is below the experiment. Hide explanation in the page header gives the experiment more room." },
      { id: "guide", route: "counts", target: "teach.read-and-watch", title: "Each page can walk you through itself", body: "Read and watch goes through this page's panels one at a time. Show the flow opens a diagram of what goes in and what comes out." },
      { id: "help", route: "counts", target: "shell.help-mode", title: "Help for any control", body: "Hover or focus a control for a short hint. Help mode puts a marker beside every control; press one to learn that control, with a small example." },
      { id: "glossary", route: "glossary", target: "glossary.search", title: "Every term, with an experiment", body: "The glossary explains 75 terms in plain words, with a precise definition, an example, a common misconception and a link to try it." },
      { id: "notebook", route: "notebook", target: "notebook.add", title: "Your notes and evidence", body: "Questions, notes, predictions and your own explanations are kept here, in this browser. Nothing is graded, and a finished tour is not counted as understanding." },
    ],
  },
  {
    id: "first-prediction", title: "Understand your first prediction", minutes: "about 10 to 15 minutes", summary: "Training text, pairs, context, probabilities, sampling and repetition, on the Bigram journey's example.",
    steps: [
      { id: "text", route: "journey", target: "journey.pair", title: "The training text supplies examples", body: "Your engine learns only which characters follow which in this text. Pick a pair to see where it occurs.", reveal: { mode: "guided", stage: 0 } },
      { id: "count", route: "journey", target: "journey.stages", title: "Pairs become counts", body: "Open Count pairs: each place a pair occurs adds one. The table of all those counts is the entire model.", reveal: { mode: "guided", stage: 1 } },
      { id: "context", route: "journey", target: "journey.diagram", title: "Only the last character is read", body: "The prompt's last character selects one row of the count table. In the diagram, follow Context into Selected row.", reveal: { mode: "guided", stage: 2 } },
      { id: "probs", route: "journey", target: "journey.context", title: "Counts become probabilities", body: "Each count in the row is divided by the row total, so the probabilities add up to one.", reveal: { mode: "guided", stage: 3 } },
      { id: "sample", route: "journey", target: "journey.sample-step", title: "A random draw picks a character", body: "The probabilities are laid end to end from 0 to 1; the engine's random number lands in one of them. The most likely character is not guaranteed.", more: "The seed fixes these random numbers. With the same model and prompt, the first distribution never changes; different draws can pick different characters and lead to different rows later.", reveal: { mode: "guided", stage: 4 }, action: { label: "Learn about the seed", help: "journey.seed" } },
      { id: "repeat", route: "journey", target: "journey.next-step", title: "Append and repeat", body: "The chosen character becomes the next context. Next step reveals the stored run one character at a time.", reveal: { mode: "guided", stage: 5 }, action: { label: "What does Next step do?", help: "journey.next-step" } },
      { id: "own", route: "playground", target: "playground.suggest", title: "Now with your own text", body: "The Writing playground runs the same loop on whatever you type. Suggest asks your engine; the trace below shows every draw." },
    ],
  },
  {
    id: "next-experiment", title: "Choose your next experiment", minutes: "about 5 to 10 minutes", summary: "What neural training, attention, decoding, evaluation, retrieval and serving are for. This tour shows the purpose of each page; it does not teach their mathematics.",
    steps: [
      { id: "neural", route: "neural", target: "neural.apply", title: "Neural training: learning by small corrections", body: "A browser simulation of a tiny network. Apply one update shows every number of one training step.", more: "It is not your engine. Your bigram engine learns by counting; this page shows how Stage 2 models learn instead." },
      { id: "attention", route: "attention", target: "attention.mask", title: "Attention: positions reading each other", body: "Toy numbers, real arithmetic. The causal mask is what stops a position from reading the future." },
      { id: "decoding", route: "decoding", target: "decoding.temperature", title: "Decoding: from scores to one token", body: "Temperature, top-k and top-p change how a token is chosen from the same scores. They change no learned weight." },
      { id: "evaluation", route: "evaluation", target: "evaluation.on", title: "Evaluation: is it better?", body: "Held-out loss from your engine. Validation is for choosing settings; test is for one final check." },
      { id: "retrieval", route: "adapt", target: "adapt.question", title: "Retrieval: putting documents into the prompt", body: "Documents are chunked and searched by shared words; the best passages are assembled into a prompt. No model answers it here.", reveal: { tab: "retrieval" } },
      { id: "serving", route: "serving", target: "serving.send", title: "Serving: where the time goes", body: "One real request, timed stage by stage on your machine." },
    ],
  },
]
