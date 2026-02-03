import { IMessage } from "@slonigiraf/slonig-components";
import { stringToU8a } from '@polkadot/util';
import { blake2AsHex } from '@polkadot/util-crypto';

export enum StageType {
  decide_about_badge = 'decide_about_badge',
  repeat_tomorrow = 'repeat_tomorrow',
  correct_fake_solution = 'correct_fake_solution',
  ask_to_repeat_example_solution = 'ask_to_repeat_example_solution',
  provide_fake_solution = 'provide_fake_solution',
  ask_to_repeat_similar_exercise = 'ask_to_repeat_similar_exercise',
  skip = 'skip',
  begin_ask_to_create_similar_exercise = 'begin_ask_to_create_similar_exercise',
  first_time_intro = 'first_time_intro',
  see_statistics = 'see_statistics',
  ask_to_create_similar_exercise = 'ask_to_create_similar_exercise',
  begin_ask_to_solve_exercise = 'begin_ask_to_solve_exercise',
  cycle_ask_to_create_similar_exercise = 'cycle_ask_to_create_similar_exercise',
  next_skill = 'next_skill',
  too_fast_warning = 'too_fast_warning',
  validate = 'validate',
  revoke = 'revoke',
  success = 'success',
  reimburse = 'reimburse',
  encourage_penalization = 'encourage_penalization',
}

class AlgorithmStage {
    private type: StageType;
    private name: string;
    private messages: IMessage[];
    private actionHint: string;
    private chatDecorator: React.ReactNode;
    private next: AlgorithmStage[];
    private previous: AlgorithmStage | null;
    private stageNumber: number;

    constructor(stageNumber: number, type: StageType, name: string, messages: IMessage[], actionHint: string = '', chatDecorator: React.ReactNode = null) {
        this.type = type;
        this.name = name;
        this.messages = messages;
        this.actionHint = actionHint;
        this.stageNumber = stageNumber;
        this.chatDecorator = chatDecorator;
        this.next = [];
        this.previous = null;
    }

    getId(): string {
        let id = 'algorithmStage';
        if (this.messages.length > 0) {
            const joined = this.messages.map(m => m?.text ?? '').join('\u241F');
            id = blake2AsHex(stringToU8a(joined));
        }
        return id;
    }

    getType(): StageType {
        return this.type;
    }

    getPrevious(): AlgorithmStage | null {
        return this.previous;
    }

    setPrevious(previous: AlgorithmStage | null): void {
        this.previous = previous;
    }

    getName(): string {
        return this.name;
    }

    getStageNumber(): number {
        return this.stageNumber;
    }

    getChatDecorator(): React.ReactNode {
        return this.chatDecorator;
    }

    getMessages(): IMessage[] {
        return this.messages;
    }

    getActionHint(): string {
        return this.actionHint;
    }

    getNext(): AlgorithmStage[] {
        return this.next;
    }

    setNext(next: AlgorithmStage[]): void {
        this.next = next;
    }
}

export { AlgorithmStage };