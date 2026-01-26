# Slonig (Frontend) - Helping Students Teach Each Other

[**Slonig**](https://app.slonig.org) is an open-source, free-to-use web platform that helps teachers make students talk more during lessons. The approach of having students talk and teach each other has been known for decades and has been shown to be one of the most powerful ways to improve educational outcomes ([Dietrichson et al., 2017](https://doi.org/10.3102/0034654316687036)). However, it’s challenging for teachers to organize this process: it involves complex logistics (deciding who works with whom), creating materials for such activities, and training students to effectively tutor their peers.

Slonig solves all these problems in one solution: it includes all learning materials (open for editing like Wikipedia), guides students on how to perform tutoring using a built-in algorithm, validates the quality of the process through game theory, and enables all this to happen while **students talk to each other face to face in the same classroom**!

<img alt="Image" src="https://github.com/slonigiraf/slonig/blob/main/tutoring-overview.png?raw=true" width="750">

## Other Slonig components

- [Frontend - this repo](https://github.com/slonigiraf/apps-slonigiraf)
- [Backend](https://github.com/slonigiraf/slonig-node-dev)
- [Auxiliary services](https://github.com/slonigiraf/economy.slonig.org)

## Pilot-tested in schools

We conducted pilot lessons with Slonig in several schools and observed remarkable efficiency in training students to teach their peers. In most cases, just one lesson was enough to start effective peer learning. You can read more in our [research paper](https://slonig.org/assets/pdf/site.Slonig-paper.pdf).

## For marketing

Slonig supports Matomo - free and open source web analytics that doesn't require setting cookies and is doesn't send user data to third parties.

Here is a list of user actions tracked by Slonig:

| Supported | Category | Action | Name | Value |
| --- | --- | --- | --- | --- |
| ✅ | INFO | INCOGNITO | N/A | N/A |
| ✅ | INFO | LANGUAGE | two_letter_code | N/A |
| ✅ | INFO | VERSION | N/A | N/A |
| ✅ | ONBOARDING | SIGN_UP_SUCCESS | N/A | N/A |
| ✅ | ONBOARDING | BACKUP_SUCCESS | backup_file_kb | backup file size |
| ✅ | ONBOARDING | BACKUP_ERROR | N/A | N/A |
| ✅ | ONBOARDING | RESTORE_SUCCESS | restore_success_kb | backup file size |
| ✅ | ONBOARDING | RESTORE_ERROR | restore_error_kb | backup file size |
| ✅ | ONBOARDING | TOO_SHORT_USING_HINT_TIME | too_short_using_hint_time_sec | sec |
| ✅ | ONBOARDING | TUTOR_TUTORIAL_COMPLETED | N/A | N/A |
| ✅ | ONBOARDING | TUTEE_TUTORIAL_COMPLETED | N/A | N/A |
| ✅ | ONBOARDING | ASSESSMENT_TUTORIAL_COMPLETED | N/A | N/A |
| ✅ | ONBOARDING | PRESSING_EXAMPLES_TUTORIAL_COMPLETED | N/A | N/A |
| ✅ | ONBOARDING | RECRUITED_OTHER_TUTOR | N/A | N/A |
| ✅ | ONBOARDING | ATTEMPT_TO_WARMUP_WRONG_TUTOR | N/A | N/A |
| ✅ | CLASSROOM | NEW_PARTNER_FOUND | N/A | N/A |
| ✅ | CLASSROOM | UNIQUE_PARTNERS_COUNT | unique_partners_count_# | N/A |
| ✅ | CLASSROOM | POSTPONE_PARTNER_CHANGE | N/A | N/A |
| ✅ | CLASSROOM | AGREE_PARTNER_CHANGE | N/A | N/A |
| ✅ | LEARNING | AUTO_SHOW_LESSON_REQUEST_QR | N/A | N/A |
| ✅ | LEARNING | CLICK_LEARN | N/A | N/A |
| ✅ | LEARNING | CLICK_EXAM | N/A | N/A |
| ✅ | LEARNING | LEARNING_REQUESTED | KnowledgeName | N/A |
| ✅ | LEARNING | EXAM_REQUESTED | KnowledgeName | N/A |
| ✅ | LEARNING | REDIRECT_TO_COURSE | N/A | N/A |
| ✅ | LEARNING | EXIT_LEARNING_CONFIRMED |  N/A | N/A |
| ✅ | BADGE | VIEW_BADGE |  KnowledgeName | N/A |
| ✅ | SCAN | SCAN_OPEN | N/A | N/A |
| ✅ | SCAN | SCAN_SUCCESS | N/A | N/A |
| ✅ | SCAN | SCAN_MANUAL_CLOSE | N/A | N/A |
| ✅ | LEARNING | LOAD_OLD_RESULTS | N/A | N/A |
| ✅ | LEARNING | RELOAD_RESULTS | agreement_price_slon | amount |
| ✅ | LEARNING | LOAD_RESULTS | agreement_price_slon | amount |
| ✅ | TRANSACTIONS | SEND_SLON | send_slon | amount |
| ✅ | TRANSACTIONS | RECEIVE_SLON | receive_slon | amount |
| ✅ | LEARNING | SAVE_REPETITIONS | saved_repetitions_count | count |
| ✅ | LEARNING | SAVE_BADGES | saved_badges_count | count |
| ✅ | LEARNING | SAVE_REEXAMINATIONS | saved_reexaminations_count | count |
| ✅ | SYNC | SUBMIT_PENALTY_EXTRINSIC | submitted_penalty_slon | N/A |
| ✅ | TUTORING | CLICK_RESTART_LESSON | N/A | N/A |
| ✅ | TUTORING | GET_STUDENT_REQUEST | N/A | N/A |
| ✅ | TUTORING | CLICK_EXAMPLES | N/A | N/A |
| ✅ | TUTORING | EXIT_TUTORING_CONFIRMED | N/A | N/A |
| ✅ | TUTORING | REEXAMINE_SKILL_TIME | reexamine_skill_time_sec | sec |
| ✅ | TUTORING | TOO_SHORT_REEXAMINE | too_short_reexamine_time_sec | sec |
| ✅ | TUTORING | REEXAMINE_START | KnowledgeName (skill) | N/A |
| ✅ | TUTORING | REEXAMINE_ALGO | begin_ask_to_create_similar_exercise | N/A |
| ✅ | TUTORING | REEXAMINE_ALGO | cycle_ask_to_create_similar_exercise | N/A |
| ✅ | TUTORING | REEXAMINE_ALGO | ask_to_repeat_similar_exercise | N/A |
| ✅ | TUTORING | REEXAMINE_ALGO | provide_fake_solution | N/A |
| ✅ | TUTORING | REEXAMINE_ALGO | validate | N/A |
| ✅ | TUTORING | REEXAMINE_ALGO | explain_reimburse | N/A |
| ✅ | TUTORING | REEXAMINE_ALGO | revoke | N/A |
| ✅ | TUTORING | REEXAMINE_ALGO | click_instant_validate | N/A |
| ✅ | TUTORING | REEXAMINE_ALGO | click_instant_revoke | N/A |
| ✅ | TUTORING | TOO_SHORT_TEACH | too_short_teach_time_sec | sec |
| ✅ | TUTORING | TEACH_SKILL_TIME | teach_skill_time_sec | sec |
| ✅ | TUTORING | SEVERAL_FAST_DISCUSSIONS_IN_ROW | N/A | N/A |
| ✅ | TUTORING | LESSON_START | KnowledgeName (course/module) | N/A |
| ✅ | TUTORING | TEACH_START | KnowledgeName (skill) | N/A |
| ✅ | TUTORING | TEACH_ALGO | begin_ask_to_solve_exercise | N/A |
| ✅ | TUTORING | TEACH_ALGO | ask_to_create_similar_exercise | N/A |
| ✅ | TUTORING | TEACH_ALGO | ask_to_repeat_example_solution | N/A |
| ✅ | TUTORING | TEACH_ALGO | begin_ask_to_create_similar_exercise | N/A |
| ✅ | TUTORING | TEACH_ALGO | cycle_ask_to_create_similar_exercise | N/A |
| ✅ | TUTORING | TEACH_ALGO | ask_to_repeat_similar_exercise | N/A |
| ✅ | TUTORING | TEACH_ALGO | provide_fake_solution | N/A |
| ✅ | TUTORING | TEACH_ALGO | correct_fake_solution | N/A |
| ✅ | TUTORING | TEACH_ALGO | decide_was_it_perfect_today | N/A |
| ✅ | TUTORING | TEACH_ALGO | mark_mastered | N/A |
| ✅ | TUTORING | TEACH_ALGO | mark_for_repeat | N/A |
| ✅ | TUTORING | TEACH_ALGO | click_instant_mark_mastered | N/A |
| ✅ | TUTORING | TEACH_ALGO | click_instant_mark_for_repeat | N/A |
| ✅ | TUTORING | LESSON_RESULTS | lesson_auto_send_opened | amount |
| ✅ | TUTORING | LESSON_RESULTS | click_send_during_lesson | N/A |
| ✅ | TUTORING | LESSON_RESULTS | click_send_at_list_of_lessons |  N/A |
| ✅ | TUTORING | LESSON_RESULTS | click_agree_to_send_results | N/A |
| ✅ | TUTORING | LESSON_RESULTS | lesson_badges | count |
| ✅ | TUTORING | LESSON_RESULTS | lesson_repetitions | count |
| ✅ | TUTORING | LESSON_RESULTS | lesson_reexaminations | count |
| ✅ | TUTORING | LESSON_RESULTS | lesson_price_slon | amount in tokens |
| ✅ | TUTORING | LESSON_RESULTS | lesson_warranty_slon | amount in tokens |
| ✅ | TUTORING | LESSON_RESULTS | lesson_days_valid | count |
| ✅ | TUTORING | LESSON_RESULTS | lesson_data_was_sent | N/A |
| ✅ | ASSESSMENT | SHOW_ASSESSMENT_QR | N/A | N/A |
| ✅ | ASSESSMENT | VIEW_STUDENT_INSURANCE_LIST | KnowledgeName (skill) | KnowledgeId (skill) |
| ✅ | ASSESSMENT | RECEIVE_INSURANCE_DATA | insurances | count |
| ✅ | ASSESSMENT | VIEW_INSURANCE | KnowledgeName (skill) | N/A |
| ✅ | ASSESSMENT | ASSESSMENT_PENALIZE | assessment_penalize_by_slon | amount |
| ✅ | QR | CLICK_SEND_QR | N/A | N/A |
| ✅ | QR | CLICK_COPY_QR | N/A | N/A |
| ✅ | SETTINGS | CLASS_ONBOARDING_OFF | N/A | N/A |
| ✅ | SETTINGS | CLASS_ONBOARDING_ON | N/A | N/A |
| ✅ | SETTINGS | DIPLOMA_PRICE_SET | diploma_price_set_to_slon | amount |
| ✅ | SETTINGS | DIPLOMA_WARRANTY_SET | diploma_warranty_set_to_slon | amount |
| ✅ | SETTINGS | DIPLOMA_VALIDITY_SET | diploma_validity_set_to_days | count |
| ✅ | SETTINGS | INSURANCE_VALIDITY_SET | insurance_validity_set_to_days | count |
| ✅ | SETTINGS | CLICK_RESET_TO_DEFAULT | N/A | N/A |
| ✅ | SETTINGS | ECONOMY_DIPLOMA_PRICE | economy_diploma_price_slon | amount |
| ✅ | SETTINGS | ECONOMY_DIPLOMA_WARRANTY | economy_diploma_warranty_slon | amount |
| ✅ | SETTINGS | ECONOMY_EXPECTED_AIRDROP | economy_expected_airdrop_slon | amount |
| ✅ | SETTINGS | ECONOMY_INITIALIZED | N/A | N/A |
| ✅ | SETTINGS | ECONOMY_DIPLOMA_VALIDITY | economy_diploma_validity_day | count |
| ✅ | SETTINGS | AIRDROP_COMPATIBLE | N/A | N/A |
| ✅ | SETTINGS | RECEIVED_AIRDROP | received_airdrop_slon | amount |
| ✅ | SETTINGS | CLICK_DEVELOPER_MODE_ON | N/A | N/A |
| ✅ | SETTINGS | CLICK_DEVELOPER_MODE_OFF | N/A | N/A |
| ✅ | EDITING | CLICK_EDIT_KNOWLEDGE | KnowledgeName | N/A |
| ✅ | EDITING | CLICK_SAVE_KNOWLEDGE | KnowledgeName | N/A |
| ✅ | EDITING | KNOWLEDGE_UPDATED | KnowledgeName | N/A |

## Technical details for developers

If you’re a developer or interested in contributing to the project’s design, you may want to explore our [technical draft white paper](https://github.com/slonigiraf/whitepaper/blob/main/slonigiraf/ENG.md). It’s a long read and still under development, so please keep that in mind when reviewing sections on tokenomics and the business model — these are early drafts and likely to be revised soon. You’re welcome to contribute by proposing improvements or changes.

## Contacts
- Try the Slonig App: https://app.slonig.org/
- Our Website: https://slonig.org/
- WhatsApp: [+382 67 887600](https://wa.me/38267887600)
- Email: [reshetovdenis@gmail.com](mailto:reshetovdenis@gmail.com)

## Development

Contributions are welcome!

To start off, this repo uses yarn workspaces to organize the code. As such, after cloning dependencies _should_ be installed via `yarn`, not via npm, the latter will result in broken dependencies.

**To get started**

1. Clone the repo locally, via `git clone https://github.com/slonigiraf/slonig.git <optional local path>`
2. Ensure that you have a recent LTS version of Node.js, for development purposes [Node >= 16](https://nodejs.org/en/) is recommended.
3. Ensure that you have a recent version of Yarn, for development purposes [Yarn >= 1.22](https://yarnpkg.com/docs/install) is required.
4. Install the dependencies by running `yarn`
5. Ensure that the [Backend](https://github.com/slonigiraf/slonig-node-dev), IPFS, PeerJS, Coturn, and [Auxiliary services](https://github.com/slonigiraf/economy.slonig.org) are running.
6. Specify system variables
```
export IPFS_SERVER=ipfs.some.org
export PEERJS_SERVER=peerjs.some.org
export COTURN_SERVER=coturn.some.org:3478
export COTURN_USER=some
export COTURN_PASSWORD=some
export AIRDROP_AUTH_TOKEN=some
export MATOMO_SITE_ID=some
```
7. Ready! Now you can launch the UI, via `yarn run start`
8. Access the UI via [http://localhost:3000](http://localhost:3000)


## Docker

Build a docker container

```
export $(cat .env | xargs) && \
docker build -t app-slonig-org -f docker/Dockerfile \
  --build-arg IPFS_SERVER=$IPFS_SERVER \
  --build-arg PEERJS_SERVER=$PEERJS_SERVER \
  --build-arg COTURN_SERVER=$COTURN_SERVER \
  --build-arg COTURN_USER=$COTURN_USER \
  --build-arg COTURN_PASSWORD=$COTURN_PASSWORD \
  --build-arg AIRDROP_AUTH_TOKEN=$AIRDROP_AUTH_TOKEN \
  .
```

Example docker-compose.yml
```
services:
  app-some-org:
    image: app-some-org
    container_name: app-some-org
    restart: unless-stopped
    environment:
      - WS_URL=wss://ws-parachain-1.slonigiraf.org
      - VIRTUAL_HOST=app.some.org  
      - VIRTUAL_PORT=80
      - LETSENCRYPT_HOST=app.some.org
      - LETSENCRYPT_EMAIL=some@gmail.com
    expose:
      - 80

networks:
  default:
    name: nginx-proxy
    external: true
```