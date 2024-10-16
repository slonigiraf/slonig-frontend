# @slonigiraf/app-recommendations

## TutoringRequest data format
### Supported top level fields, shown in QR
| Key  | What is it for |
| - | - |
| i | Tutoring request identificator that remains the same for each day and the same skill set |
| q | Scan qr action type (constant numbers) |
| n | Student's name |
| p | Student's identity (hex) |
| t | Tutors's identity (hex) |
| d | Data JSON |
### Data JSON format
| Key  | What is it for |
| - | - |
| time | Time of the request creation |
| learn | Array of skills to learn |
| exam | Array of diplomas to re-examine |
### Skill JSON format
| Index  | What is it for |
| - | - |
| [0] | Skill CID |
| [1] | Public key derived from the student's identity for this specific skill |
###  Diploma format
| Index  | What is it for |
| - | - |
| [0] | Skill CID |
| [1] |  Genesis ID |
| [2] |  Nonce |
| [3] |  Block at which issued |
| [4] |  Block untill fine is allowed |
| [5] |  Tutor, that issued the diploma |
| [6] |  Public key derived from the student's identity for this specific skill |
| [7] |  Amount |
| [8] |  Sign over private data |
| [9] |  Sign over receipt |
| [10] |  Student sign |