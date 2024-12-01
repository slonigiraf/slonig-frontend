import { IMessage } from "@slonigiraf/app-slonig-components";

class AlgorithmStage {
    type: string;
    private name: string;
    private messages: IMessage[];
    private actionHint: string;
    private chatDecorator: React.ReactNode;
    private next: AlgorithmStage[];
    private previous: AlgorithmStage | null;

    constructor(type: string, name: string, messages: IMessage[], actionHint: string = '', chatDecorator: React.ReactNode = null) {
        this.type = type;
        this.name = name;
        this.messages = messages;
        this.actionHint = actionHint;
        this.chatDecorator = chatDecorator;
        this.next = [];
        this.previous = null;
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