// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const ABILITY_QUESTION_IMAGE_PROMPT = (imageDescription: string, question: string): string => {
  return imageDescription
    ? `${imageDescription}
Create the task-essential STARTING visual for this concrete Ability question: ${question}. Preserve the educational structure, vary only the concrete task parameters, and do not reveal the answer in the visual.`
    : '';
};

export const ABILITY_SOLUTION_IMAGE_PROMPT = (solutionImageDescription: string, question: string, answer: string, additionalSpecification = ''): string => {
  return solutionImageDescription
    ? `${solutionImageDescription}
Use the source description as the required visual structure, but adapt all concrete values, labels, geometry, plotted data, markings, and answer details to this Ability variation. The image must show the complete correct worked-solution result for the question below and must not retain source-Exercise values that conflict with it.

Ability question:
${question}

Correct answer / worked solution:
${answer}${additionalSpecification ? `

Additional solution-visual specification from the Ability generator:
${additionalSpecification}` : ''}`
    : '';
};

export const ABILITY_CHANGED_IMAGE_SOLUTION_PROMPT = (questionImagePrompt: string, question: string, answer: string, sourceSolutionDescription = '', additionalSpecification = ''): string => {
  return `Create the COMPLETE CORRECT UPDATED VERSION of the SAME visual used in the question. Recreate the same base objects, labels, coordinate system, dimensions, scale, layout, and all unchanged details, then apply only the modification requested by the Ability question. The final image must visibly contain the answer/result, not merely explain it.

Starting question visual specification:
${questionImagePrompt}

Ability question:
${question}

Correct answer / worked solution:
${answer}${sourceSolutionDescription ? `

Required solution-visual specification from the source Exercise:
${sourceSolutionDescription}` : ''}${additionalSpecification ? `

Additional solution-visual specification from the Ability generator:
${additionalSpecification}` : ''}`;
};

export const OPEN_ROUTER_VISUAL_SPEC_PROMPT = (visualPrompt: string, purpose: 'question' | 'solution', referenceScene = ''): string => {
  const vectorSchema = `Use a structured vector scene. Coordinates are ordinary SVG-like numbers, but DO NOT write SVG/XML. The application renders the scene deterministically and adds safe margins itself.

Supported element types:
- line: {"id":"...","type":"line","x1":0,"y1":0,"x2":100,"y2":100,"stroke":"black","strokeWidth":2,"dash":[6,4],"arrowStart":false,"arrowEnd":false}
- rect: {"id":"...","type":"rect","x":0,"y":0,"width":100,"height":50,"rx":0,"stroke":"black","strokeWidth":2,"fill":"none"}
- circle: {"id":"...","type":"circle","cx":50,"cy":50,"r":20,"stroke":"black","strokeWidth":2,"fill":"none"}
- ellipse: {"id":"...","type":"ellipse","cx":50,"cy":50,"rx":30,"ry":20,"stroke":"black","strokeWidth":2,"fill":"none"}
- polygon/polyline: {"id":"...","type":"polygon","points":[[0,0],[100,0],[50,80]],"stroke":"black","strokeWidth":2,"fill":"none"}
- arc: {"id":"...","type":"arc","cx":50,"cy":50,"r":20,"startAngle":0,"endAngle":90,"stroke":"black","strokeWidth":2}
- text: {"id":"...","type":"text","x":50,"y":50,"text":"A","fontSize":24,"anchor":"middle","fontWeight":"normal","fill":"black","rotate":0}

Every element needs a unique stable id. Keep labels as separate text elements. Use only black/white/gray/grey/red/blue/green/orange/purple/yellow/brown/transparent/none or hex colors. Prefer simple geometry and explicit labels. Do not put equations in paths; use text with ordinary Unicode mathematical symbols when practical. Scene width/height default to 960x640 and should normally be left at those values. Do not set viewBox unless a reference scene already supplies one.

STROKE STYLE RULE: omit "dash" by default and render ordinary boundaries, axes, partition dividers, grid lines, and measurement lines as SOLID. Use "dash" only when the VISUAL REQUEST explicitly requires a dashed, dotted, broken, hidden, auxiliary/construction, or otherwise non-solid line. Never invent dashed separators merely as a styling choice.`;

  if (referenceScene) {
    return `Modify an existing deterministic educational vector scene. Return ONLY a patch; do not redraw or restate unchanged objects. Preserve the existing dimensions, viewBox, coordinate system, positions, labels, styles, and all unchanged element ids. Add, remove, or update only what the requested worked solution requires. The application rejects patches that move content outside the preserved viewBox.

${vectorSchema}

Return only JSON in this exact shape:
{"format":"vector-patch","operations":[{"op":"add","element":{...}},{"op":"update","id":"existingId","element":{...complete replacement element with same id and type...}},{"op":"remove","id":"existingId"}]}
Include only operations actually needed. An update must contain the complete replacement element and keep the same id and type.

REFERENCE SCENE JSON:
${referenceScene}

VISUAL REQUEST:
${visualPrompt}`;
  }

  return `Decide whether this educational Ability visual genuinely requires photographic/natural imagery. Use raster ONLY when the task depends on photographic realism, natural texture, subtle material appearance, a real-world photo, or another property that geometric vector primitives cannot faithfully represent. Diagrams, geometry, graphs, charts, tables, symbols, number lines, coordinate planes, simple maps, layouts, and schematic objects MUST use the structured vector format. Never choose raster merely because vector construction is inconvenient.

${vectorSchema}

For vector output return only JSON:
{"format":"vector","scene":{"width":960,"height":640,"background":"white","elements":[...]}}
For genuinely photographic output return only:
{"format":"raster"}

${purpose === 'solution' ? 'This is a WORKED-SOLUTION visual. It must visibly show the complete correct result required by the prompt.' : 'This is a QUESTION visual. Do not reveal, highlight, pre-complete, or encode the answer unless the starting state itself explicitly requires it.'}

VISUAL REQUEST:
${visualPrompt}`;
};

// Kept as a compatibility alias for code outside this package that imported the
// older name. It now requests a structured scene rather than raw SVG markup.
export const OPEN_ROUTER_SVG_PROMPT = (visualPrompt: string, purpose: 'question' | 'solution'): string => OPEN_ROUTER_VISUAL_SPEC_PROMPT(visualPrompt, purpose);

export const OPEN_ROUTER_SOLUTION_RASTER_PROMPT = (visualPrompt: string): string => {
  return `Create the complete worked-solution visual. Show the correct constructed, drawn, labeled, shaded, plotted, graphed, marked, or modified result required by the solution. If this is an updated version of a question visual, preserve all unchanged base objects, labels, scale, coordinate system, and layout and apply only the requested change.

${visualPrompt}`;
};
