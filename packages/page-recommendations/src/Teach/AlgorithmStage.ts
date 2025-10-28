import { IMessage } from "@slonigiraf/slonig-components";
import { stringToU8a } from '@polkadot/util';
import { blake2AsHex } from '@polkadot/util-crypto';

class AlgorithmStage {
    type: string;
    private name: string;
    private messages: IMessage[];
    private actionHint: string;
    private chatDecorator: React.ReactNode;
    private next: AlgorithmStage[];
    private previous: AlgorithmStage | null;
    private stageNumber: number;

    constructor(stageNumber: number, type: string, name: string, messages: IMessage[], actionHint: string = '', chatDecorator: React.ReactNode = null) {
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
        if(this.messages.length > 0){
            const joined = this.messages.map(m => m?.text ?? '').join('\u241F');
            id = blake2AsHex(stringToU8a(joined));
        }
        return id;
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