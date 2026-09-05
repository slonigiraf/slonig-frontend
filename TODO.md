Usage scenario:
Book.pdf -> Course

What prevents?
- OCR issues
- Poor exercise generation
- Lack of exercise definition



TODO:
- Estimate token input consumption per each request
- Split exercise on subexercises (recursively ?)
- Recursive concept splitting
- For each concept define list of corresponding skills
- For each exercise define list of corresponding skills
- For each skill create skillTemplate - not for concept

- Make sure that skills generated for each chapter cover all exercises in the chapter
- Skills.tsx: allow to delete an SkillTemplate one by one
- Skills.tsx: allow to edit chapter name, and insert chapter name between concepts

- At Skills/Course:
Left pane:
display on top - editable course name, 
below: editable chapter names and skillTemplates between them.