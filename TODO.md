Usage scenario:
Book.pdf -> Course

What prevents?
- OCR issues
- Poor exercise generation
- Lack of exercise definition


TODO:

- Estimate token input consumption per each request
- Add BookExercise entity
- Identify exercises on the page
- Split exercise on subexercises (recursively ?)
- Recursive concept splitting
- For each concept define list of corresponding skills
- For each exercise define list of corresponding skills
- For each skill create skillTemplate - not for concept
- Add chapter db entity
- Make sure that skills generated for each chapter cover all exercises in the chapter
- Skills.tsx: allow to delete an SkillTemplate one by one
- Skills.tsx: allow to edit chapter name, and insert chapter name between concepts
- Add pane Skills/Course
- Add a component that allows to select the proper place to put new Course at - it should parse all current list items and allow to select them from dropdown
- At Skills/Course:
Left pane:
display on top - editable course name, 
below: editable chapter names and skillTemplates between them.

Right pane:
top: select where to place the course
below: fields to determine price of module insertion and skill inserton to blockchain, autocalculate the price of the course adding
