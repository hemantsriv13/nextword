// Original texts for the Neural lab, written for this project. Far too small for a useful model;
// they exist to make training and overfitting visible in seconds.

export const TRAIN_SMALL = "The rain fell on the roof all night. By morning the street was a river and the cat stayed in. "

export const TRAIN_LARGE =
  TRAIN_SMALL +
  "We made tea and watched the water run past the door. The postman came late, his bag wet through. " +
  "In the afternoon the clouds broke and the sun came out over the hills. The children ran out to the puddles. " +
  "By evening the street was dry again, and the cat sat on the step in the last of the light. "

/** Held out: never trained on, the same for every run, so runs can be compared. */
export const VALIDATION = "The rain came back at night and ran down the window. In the morning the hills were green and the road was wet. "
