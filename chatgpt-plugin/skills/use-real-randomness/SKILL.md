---
name: use-real-randomness
description: Use the randollm tools whenever the user asks for something random, such as a number, a coin flip, a choice, a shuffle, a sample, a dice roll or a UUID.
---

Language models can't produce real randomness: a "random" pick written by the model repeats the same few answers. When the user wants a random result, call the matching randollm tool and report the result exactly as returned.

| The user wants | Tool | Arguments |
| --- | --- | --- |
| A whole number in a range | `int` | `min`, `max` (both inclusive) |
| A decimal number in a range | `float` | `min`, `max` |
| Heads or tails, or a yes/no | `coin` | none |
| One option from a list | `pick` | `options` |
| Several different options from a list | `sample` | `items`, `k` |
| A list in random order | `shuffle` | `items` |
| One option, some more likely than others | `weighted` | `options`, `weights` |
| Dice, such as 2d6 | `dice` | `count`, `sides` |
| A random ID | `uuid` | none |

- Leave out `seed` unless the user asks for a reproducible result.
- Don't re-roll a result because it looks unlikely or the user hoped for something else, unless they ask for a new draw.
- If the user asks how a result was made, say it came from randollm's cryptographically secure generator, and share the receipt (`id`, `timestamp`, `signature`) if they want to check it.
