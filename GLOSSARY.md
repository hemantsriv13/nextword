# Glossary

Evidence levels: **discussed** → **implemented** → **tested** → **explained independently** (by me, in my own words).

### Token
1. **Plain:** the unit of text the model reads and predicts.
2. **Technical:** an element of a fixed vocabulary; text is converted to a sequence of tokens before modelling.
3. **Here:** `tokenize()` in `nextword/bigram.py`. Here, one character = one token.
4. **Observed:** sample.txt has 1,167 tokens and a vocabulary of 39 distinct characters.
5. **Misconception:** "a token is a word." Tokens can be characters, words, or sub-word pieces.
6. **Evidence:** implemented.

### Bigram model
1. **Plain:** guesses the next token using only the one token before it.
2. **Technical:** models P(xₜ | xₜ₋₁), assuming each token depends only on the previous one (a first-order Markov assumption).
3. **Here:** `count_bigrams()` and `complete()` in `nextword/bigram.py`.
4. **Observed:** E0. Letter pairs look English-like, but words do not form.
5. **Misconception:** "it remembers the prompt." It only ever sees the last character.
6. **Evidence:** explained independently. "The rain", "A different start, rain" and "n" give identical output with seed 1 (2026-10-25).

### Conditional probability / normalization
1. **Plain:** "given this character, how likely is each next one?" Normalization turns counts into shares that add up to 1.
2. **Technical:** P(b | a) = count(a, b) / Σ_b′ count(a, b′).
3. **Here:** `next_token_probabilities()`.
4. **Observed:** after `'n'` (75 cases), a space comes next 25.3% of the time.
5. **Misconception:** "probability = how correct the model is." It is how often it happened in *this* training text.
6. **Evidence:** implemented.

### Sampling and seed
1. **Plain:** pick the next character at random, but weighted by its probability. A seed makes the "random" picks repeatable.
2. **Technical:** draw from a categorical distribution; the seed initialises the pseudo-random number generator.
3. **Here:** `rng.choices(...)` in `complete()`; `--seed` in `nextword/__main__.py`.
4. **Observed:** E0. Seed 1 gave the same output on two runs; seed 2 differed.
5. **Misconception:** "sampling picks the most likely character." That is greedy decoding (Stage 4).
   Also: "same seed = same output." Only with the same data, code and settings; the seed fixes the random numbers, not the table.
6. **Evidence:** explained independently (seed part).

### Unseen context
1. **Plain:** the model has never seen anything follow this character, so it has nothing to go on.
2. **Technical:** a context with zero total count, so P(· | context) is undefined (division by zero).
3. **Here:** `UnseenContextError`; the CLI exits with code 1.
4. **Observed:** `"Hello!"` is refused because `'!'` is absent from sample.txt.
5. **Misconception:** "the model should just guess." Silent guessing hides data gaps. Smoothing (later) is an explicit choice.
6. **Evidence:** tested.
