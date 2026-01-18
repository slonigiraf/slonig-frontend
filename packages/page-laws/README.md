# @slonigiraf/app-laws

## JSON types
From https://github.com/slonigiraf/whitepaper/blob/main/giraf/data-format.md

| Key | Description | Example |
| --- | ----------- | ------- |
| i | id at the blockchain, text | "0x88acc7a936797768868965af924321c7e90f916a445996f59b9c648f098f5e2b"
| t | type, numeric | "0" |
| h | header, text | "Math, 5th grade" |
| e | array of children jsons | ["0x91a00e045bfa0b392db90f94262caee5f1c6060768c225e8f6fcdecd4ff0c37d", "0x992990ef841c7a7e07c1968963290c6a2aa1252a6b61347c27ba7b2fe4f50c0f"] |


| Keys inside "q" (question array) | Description | Example |
| --- | ----------- | ------- |
| h | question, text | "How much is a 2+2?" |
| p | question image cid | "cid:"bafyreibhztz3aqsln2jcodul62af7ccfd2mjsehjzmual4rh3nedkqqvaq" |
| a | answer, text | "2+2 is 4" |
| i | answer image cid | "cid:"bafyreibhztz3aqsln2jcodul62af7ccfd2mjsehjzmual4rh3nedkqqvaq" |

| Id | Description | Example |
| -- | ----------- | ------- |
| 0  | List  | {"t" : 0, "h" : "USA school curriculum", "e": [...]} |
| 1  | Course  | {"t" : 1, "h" : "Math for 5th grade", "e": [...]} |
| 2  | Module  | {"t" : 2, "h" : "Working with fractions", "e": [...]} |
| 3  | Skill  | {"t" : 3, "h" : "Adding two fractions", "e": [...]} |
| 4  | Exercise  | {"t" : 4, "q" : {"h" : "What is a result of 1/3+1/3?", f: "answer optional file id"}, "a" : {"h": "2/3", f: "answer optional file id"}} |