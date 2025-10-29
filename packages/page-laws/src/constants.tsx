// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const QR_CODE_SIZE = 300;
export const sessionPrefix = 'knowledge';

export const skillListPrompt = `Definitions:
A mental function is a precisely stated claim about a person’s ability, where I am prepared to bet money on its truth. Because financial stakes are involved, the statement of the mental function must be both succinct and unambiguous, reducing the risk of disagreements about what the mental function entails. Formally, this mental function is validated by a set of related exercises that all derive from the same exercise template, modified through parameterization to generate multiple, equivalent task instances.
Speaking more specifically a mental function is a function that maps an input to the output. So the input should be very strictly defined as well as an output.

Below are a few illustrative examples of how to define such mental functions with parameterized tasks:
WRONG:
Mental function: Convert Metric Length (km, m, cm, mm)
RIGHT:
Mental function 1: Convert km to m
Mental function 2: Convert m to km
Mental function 3: Convert m to cm
Mental function 4: Convert cm to m
Mental function 5: Convert mm to cm
Mental function 6: Convert cm to mm
 
Context:
You have access to a set of images, each containing exercises designed to train specific mental functions.
Multiple exercises may correspond to the same mental function.
Your task is to identify (or infer) each distinct mental function from the exercises shown in the images.
After identification mental functions try to divide them into subfunctions and use these sub functions as mental functions, as shown in example:
Splitting too vague mental function to smaller mental functions:
Too vague mental function: Convert Metric Length (km, m, cm, mm)
Mental functions after splitting too vague mental function:
Mental function 1: Convert km to m
Mental function 2: Convert m to km
Mental function 3: Convert m to cm
Mental function 4: Convert cm to m
Mental function 5: Convert mm to cm
Mental function 6: Convert cm to mm
Sort the mental functions from the easiest to the toughest in a logical progression for students.
Output Requirements:
For each identified mental function, generate two exercises that closely resemble the style or difficulty of the exercises from the images without copying the text verbatim.
Provide a solution for each exercise.
Present the final output in the following JSON format (repeated for each mental function):
[
{
  "i": "",
  "t": 3,
  "h": "Mental function 1 name",
  "q": [
        	{
        	"h": "Exercise 1 text.",
        	"a": "Exercise 1 answer",
        	"p": "",
        	"i": ""
        	},
        	{
        	"h": "Exercise 1 text.",
        	"a": "Exercise 1 answer.",
        	"p": "",
        	"i": ""
        	}
    ]
},
{
  "i": "",
  "t": 3,
  "h": "Mental function 2 name",
  "q": [
        	{
        	"h": "Exercise 1 text.",
        	"a": "Exercise 1 answer.",
        	"p": "",
        	"i": ""
        	},
        	{
        	"h": "Exercise 2 text.",
        	"a": "Exercise 2 answer.",
        	"p": "",
        	"i": ""
        	}
      ]
},
…
]
 
Do not copy and paste the exercises or text from the images; use your own words to create similar exercises.
Ensure the mental functions are ordered from the most basic/easiest to the most advanced/toughest.
Detailed Instructions:
Identify Mental functions: Read or interpret each exercise in the images to decide which mental function(s) it targets (e.g., reading comprehension, basic algebra, geometry, grammar, vocabulary building, etc.).
Organize Mental functions by Difficulty: Use logical reasoning about the exercises to arrange the mental functions from easiest to hardest. You might consider:
The conceptual complexity of the mental function.
The level of knowledge or mastery typically required.
The nature of the tasks (e.g., simple recall vs. complex problem-solving).
Generate Exercises:
Each mental function should have two exercises in your output.
You should use KaTeX where it’s usable. KaTeX expressions should be written inside <kx></kx> tags.
The exercises must be original but can be inspired by the format, complexity, or style in the images.
The exercises should look very similar to each other which means they are just parameterized versions of some exercises.
Avoid introducing extra steps or concepts not directly related to the mental function.
Require that each mental function’s solution only references techniques taught for that specific mental function (or prior prerequisite mental functions if it’s a known progression).
Provide Solutions: After each exercise, include a concise solution or answer. This may be:
A brief explanation of the steps.
A final numeric or written answer.
Format Strictly: Follow the outlined format exactly to maintain clarity and organization.
Example (for illustration only, not drawn from the images):
[
{
  "i": "",
  "t": 3,
  "h": "Add 1 digit numbers",
  "q": [
        	{
        	"h": "Calculate: 1+2.",
        	"a": "1+2=3.",
        	"p": "",
        	"i": ""
        	},
        	{
        	"h": "Calculate: 3+4.",
        	"a": "3+4=7.",
        	"p": "",
        	"i": ""
        	}
    ]
},
{
  "i": "",
  "t": 3,
  "h": "Add fractions with like denominators",
  "q": [
        	{
        	"h": "Calculate: <kx>\frac{2}/{4}+\frac{1}/{4}</kx>.",
        	"a": "<kx>\frac{2}/{4}+\frac{1}/{4}=\frac{2+1}/{4}=\frac{3}/{4}</kx>.",
        	"p": "",
        	"i": ""
        	},
        	{
        	"h": "Calculate: <kx>\frac{3}/{7}+\frac{2}/{7}</kx>.",
        	"a": "<kx>\frac{3}/{7}+\frac{2}/{7}=\frac{3+2}/{7}=\frac{5}/{7}</kx>.",
        	"p": "",
        	"i": ""
        	}
      ]
},
…
]
 
Final Check:
Remember to avoid copying any text or numerical content directly from the images.
Provide new, yet comparable exercises to demonstrate each mental function effectively.
If 2 exercises for the same mental function are not completely similar in terms of methods used to solve the problem, divide such a mental function into 2 different mental functions.
Present all output in ascending order of difficulty for the mental functions.
`;