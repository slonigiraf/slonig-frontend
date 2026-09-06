Usage scenario:
Book.pdf -> Course

What prevents?
- OCR issues
- Poor exercise generation
- Lack of exercise definition

Generation:
- After populating mmd data from the book - grab first 2 pages, and determine the book language. Put the 2 letter language code to the Book entity.
- When transforming mmd to BookConcepts and BookExercises - run 'Split concepts' automatically twice, remove the button 'Split concepts'.
- To Skill add a field called rank - to allow ordering the skills inside the chapter
- Generate Skills one for each concept, and one for each exercise - not for chapter. Add the requirememnt to use specific language for skills - get the book language from the Book entity. 
- Add button that will deduplicate exercises and sort them: ask ai to return list of Skill ids to be deleted, and sorted list of ids - from the easiest skill to the toghest one - using Zone of proximal development idea.
- Estimate token input consumption per each request and estimated price - display at Confirmation Window.
- At "Concepts/Skills" allow: 1. to edit chapter name. 2. to delete specific concepts, exercises and SkillTemplates.

Publishing:
- At Skills/Course left pane - display SkillTemplates under Chapter names instead of Skills under Chapter names.
- For price inputs use crypto token number inputs as the project alreadt use
- Add button "Publis" that will send transactions to blockchain:
-- Make sure the user has enough Slon
-- Register Skills on blockchain first - see examples how it's done in the Editor.tsx.
-- After adding skills - add Modules to blockchain with already published SkillTemplates blockchain ids inside - makes sure we user the same scheme of Knowldedge JSON coding as the project already use.
-- After publishing Modules - publish the Course with references to modules inside
-- After Course is published - edit the List object, selected at the right pane - to inclide the course object inside in alphabetical order, and save this list object to blockchain - again see how Editor.tsx does such things.


TODO:
Upload
- Rename Skill entity to BookSkill
- Don't allow uploaded books dropdown to overflow the book name to right when collapsed
- Add price calculation for mmd generation - and show confirmation dioalogue with the price
- Also estimate output tokens count and total price in confirmation dialogues

Text/Concepts
- When generating Exercises make sure the the exercise text was put into exerice completely

Concepts/Skills
- Allow to delete generated Skills
- When parsing BookExercise and BookConcepts - if there were no BookExercises the app doesn't show BookConcepts at Concepts/Skills - fix - it should show.
- Add button - fix errors in SkillTemplates that will do so with AI in batches per chapter
- When processing something with AI show overflow with the pie chart progess bar (see the examples in the codebase of the pie chart)
- For each SkillTemplate - Generate a complete solution, Divide the Solution on steps - generate SkillTemplate for each step
- Make sure BookExercises are visible - they don't sometimes for unknown reason

Skills/Course
- Fix Chapter names with AI
- Create course name with AI
- Do batch sending transcations - not one by one
- Remember the location where the book was published to
- Along the publishing process save knowledge ids to skilltemplate, chapter,book - so the process can be resumed in a case of failure.
- If skilltemplate or chapter were already published - don't allow to republish them - just allow to republish the book itself - the internal references to chapter (modules) stay as previous.
- Fix typescript errors
- Skills.tsx: allow to delete an SkillTemplate one by one
- Skills.tsx: allow to edit chapter name, and insert chapter name between concepts

Concepts/Skills
- Skill name should use KatexSpan


- At Skills/Course:
Left pane:
display on top - editable course name, 
below: editable chapter names and skillTemplates between them.