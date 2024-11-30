class AlgorithmStage {
    type: string;
    private name: string;
    private chatSimulation: React.ReactNode;
    private actionHint: string;
    private next: AlgorithmStage[];
    private previous: AlgorithmStage | null;

    constructor(type: string, name: string, chatSimulation: React.ReactNode, actionHint='') {
        this.type = type;
        this.name = name;
        this.chatSimulation = chatSimulation;
        this.actionHint = actionHint;
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

    getChatSimulation(): React.ReactNode {
        return this.chatSimulation;
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