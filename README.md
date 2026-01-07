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
| ✅ | AUTHENTICATION | SIGN_UP | N/A | N/A |
| ✅ | AUTHENTICATION | BACKUP | success | backup file size |
| ✅ | AUTHENTICATION | BACKUP | error | N/A |
| ✅ | AUTHENTICATION | RESTORE | success | backup file size |
| ✅ | LEARNING | AUTO_SHOW_QR | KnowledgeName | N/A |
| ✅ | LEARNING | CLICK_LEARN | KnowledgeName | N/A |
| ✅ | LEARNING | CLICK_REVISE | KnowledgeName | N/A |
| ✅ | LEARNING | CANCEL |  N/A | N/A |
| ✅ | SCAN | OPEN | N/A | N/A |
| ✅ | SCAN | SUCCESS | N/A | N/A |
| ✅ | SCAN | MANUAL_CLOSE | N/A | N/A |
| ✅ | LEARNING | LOAD_RESULTS | old | LessonPrice |
| ✅ | LEARNING | LOAD_RESULTS | price_changed | LessonPrice |
| ✅ | LEARNING | LOAD_RESULTS | new | LessonPrice |
| ✅ | TRANSACTIONS | SEND | tokens | amount |
| ✅ | TRANSACTIONS | RECEIVE | tokens | amount |
| ✅ | LEARNING | SAVE_BADGES | success | count |
| ✅ | LEARNING | SAVE_REEXAMINATIONS | success | count |
| ✅ | LEARNING_CLEANUP | SEND_PENALTIES | KnowledgeId (skill) | N/A |
| ✅ | TUTORING | RESTART_LESSON | KnowledgeName (module) | N/A |
| ✅ | TUTORING | GET_STUDENT_REQUEST | N/A | N/A |
| ❌ | TUTORING | REEXAMINE_START | KnowledgeName (skill) | KnowledgeId (skill) |
| ❌ | TUTORING | REEXAMINE_ALGO | create_similar_exercise | N/A |
| ❌ | TUTORING | REEXAMINE_ALGO | repeat_similar_exercise | N/A |
| ❌ | TUTORING | REEXAMINE_ALGO | correct_fake_solution | N/A |
| ❌ | TUTORING | REEXAMINE_ALGO | announce_cancelation | N/A |
| ❌ | TUTORING | REEXAMINE_ALGO | validated | N/A |
| ❌ | TUTORING | REEXAMINE_ALGO | invalidated | N/A |
| ❌ | TUTORING | REEXAMINE_ALGO | instant_validated | N/A |
| ❌ | TUTORING | REEXAMINE_ALGO | instant_invalidated | N/A |
| ❌ | TUTORING | TEACH_START | KnowledgeName (skill) | KnowledgeId (skill) |
| ❌ | TUTORING | TEACH_ALGO | solve_example | N/A |
| ❌ | TUTORING | TEACH_ALGO | repeat_example_answer | N/A |
| ❌ | TUTORING | TEACH_ALGO | create_similar_exercise | N/A |
| ❌ | TUTORING | TEACH_ALGO | repeat_similar_exercise | N/A |
| ❌ | TUTORING | TEACH_ALGO | correct_fake_solution | N/A |
| ❌ | TUTORING | TEACH_ALGO | repeat_proper_solution | N/A |
| ❌ | TUTORING | TEACH_ALGO | mastered | N/A |
| ❌ | TUTORING | TEACH_ALGO | marked_for_repeat | N/A |
| ❌ | TUTORING | TEACH_ALGO | instant_mastered | N/A |
| ❌ | TUTORING | TEACH_ALGO | instant_marked_for_repeat | N/A |
| ❌ | TUTORING | RESULTS | auto_send_opened | amount |
| ❌ | TUTORING | RESULTS | send_clicked_during_lesson | amount |
| ❌ | TUTORING | RESULTS | send_clicked_at_lesson_list | amount |
| ❌ | TUTORING | RESULTS | badges | count |
| ❌ | TUTORING | RESULTS | reexaminations | count |
| ❌ | TUTORING | RESULTS | data_sent | amount |
| ❌ | ASSESSMENT | SHOW_QR | N/A | N/A |
| ❌ | ASSESSMENT | RECEIVE | success | count |
| ❌ | ASSESSMENT | VIEW | KnowledgeName (skill) | KnowledgeId (skill) |
| ❌ | ASSESSMENT | SEND_PENALTIES | KnowledgeName (skill) | KnowledgeId (skill) |
| ❌ | QR | CLICK | send | N/A |
| ❌ | QR | CLICK | copy | N/A |
| ❌ | SETTINGS | DIPLOMA_PRICE | manually_changed | amount |
| ❌ | SETTINGS | DIPLOMA_WARRANTY | manually_changed | amount |
| ❌ | SETTINGS | DIPLOMA_VALIDITY | manually_changed | amount |
| ❌ | SETTINGS | INSURANCE_VALIDITY | manually_changed | amount |
| ❌ | SETTINGS | ECONOMY_INITIALIZED | success | amount |
| ❌ | SETTINGS | AIRDROP_COMPATIBLE | N/A | N/A |
| ❌ | SETTINGS | EXPECTED_AIRDROP | success | amount |
| ❌ | SETTINGS | RECEIVED_AIRDROP | success | amount |
| ❌ | SETTINGS | DEVELOPER_MODE | saved_value | true/false |
| ❌ | SETTINGS | LANGUAGE | auto_set | two-letter code |
| ❌ | SETTINGS | LANGUAGE | manually_changed | two-letter code |
| ❌ | TUTORIAL | tutee | N/A | N/A |
| ❌ | TUTORIAL | tutor | N/A | N/A |
| ❌ | TUTORIAL | viral | N/A | N/A |
| ❌ | TUTORIAL | scan | N/A | N/A |
| ❌ | EDITING | CLICK_EDIT | KnowledgeName | KnowledgeId |
| ❌ | EDITING | CLICK_SAVE | KnowledgeName | KnowledgeId |
| ❌ | EDITING | UPDATE | KnowledgeName | KnowledgeId |

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