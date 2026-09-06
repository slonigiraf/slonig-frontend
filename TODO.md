GENERATION

Db:
- Rename Skill entity to BookSkill
- Add entity ExerciseTemplate: bookSkillId, title, text, solution
- Reorganize the way Book processing works.

Currently it's:
Pdf->MMD via "Recognize" button ->BookConcepts+BookExercises via "Concepts" button->BookSkills via "Generate Skills" button->Deduplicated and sorted skills via "Deduplicate and skills" button->SkillTemplates via "Generate Exercises" button

Change it to:
Pdf->MMD via "Recognize" button ->BookConcepts+BookExercises via "Concepts" button->BookSkills via "Generate Skills" button->Deduplicated and sorted skills via "Deduplicate and skills" button->ExerciseTemplates via "Exercise templates" button->SkillTemplates via "Generate Exercises" button
Organize the mentioned buttons in a row or two with > simbols showing that they are sequential, don't allow to push next button before the previous done.
Thus, the tabs should start looking like:
1. Pdf/Text (more or less the same, but move page navigation inside the tab)
2. Text/Concepts (more or less the same, but move page navigation inside the tab)
3. Concepts/Skills (move navigation inside the tab)):
Separate view on left and right pane - left pane BookConcepts+BookExercises. Right corresponding BookSkills. Make navigation at this view by chapter not by page.
4. Add tab: Skills/PreExercises (navigation, scrolling by chapter)
Left pane - BookSkills, right pane - ExerciseTemplates
5. Add tab PreExercises/Exercises (navigation, scrolling by chapter)
Left pane - BookSkills, right pane - ExerciseTemplates

- Pushing "Exercise templates" should ask ai to generate simple exersices for each skill, with variations: for training Perceptual, Perceptual, Transformation, Reasoning, Generation abilities to utilize the skill, so each skill will result in 5 Exercise Templates, if possible.
- At entities mentioned above use KatexSpan for all text elements - so formulas will be displayed properly
- Make sure that we ask formula be generated in katex at all ai gen stages
- When generating BookExercises make sure the the exercise text was put into exerice completely
- When parsing BookExercise and BookConcepts - if there were no BookExercises the app doesn't show BookConcepts at Concepts/Skills - fix - it should show.
- Make sure BookExercises are visible - they don't sometimes for unknown reason
- Add button - fix errors in SkillTemplates that will do so with AI in batches per chapter.
- At Concepts/Skills Allow to delete generated Skills one by one
- When processing something how overflow with the pie chart progess bar (see the examples in the codebase of the pie chart)

At Upload:
- Don't allow uploaded books dropdown to overflow the book name to right when collapsed
- Add price calculation for mmd generation - and show confirmation dialogue with the price
- Also estimate output tokens count and total price in confirmation dialogues


PUBLISHING

Skills/Course
- Do batch sending transcations - not one by one
- Remember the location where the book was published to
- Along the publishing process save knowledge ids to skilltemplate, chapter,book - so the process can be resumed in a case of failure.
- If skilltemplate or chapter were already published - don't allow to republish them - just allow to republish the book itself - the internal references to chapter (modules) stay as previous.
- Make sure no typescript errors introduced, clean previous Typescipt errors in the edited files.

- Add button - fix Book and chapter names - that will do so by using SkillTemplates titles and ai
- Allow to delete an SkillTemplate one by one
- Allow to edit chapter name, and insert chapter name between SkillTemplates