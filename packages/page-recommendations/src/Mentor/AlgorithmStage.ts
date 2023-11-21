class AlgorithmStage {
    type: 'begin'|'intermediate'|'success'|'repeat';
    private name: string;
    private words: React.ReactNode;
    private next: AlgorithmStage[];
    private previous: AlgorithmStage | null;

    constructor(type: 'begin'|'intermediate'|'success'|'repeat', name: string, words: React.ReactNode, next: AlgorithmStage[]) {
        this.type = type;
        this.name = name;
        this.words = words;
        this.next = next;
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

    getWords(): React.ReactNode {
        return this.words;
    }

    getNext(): AlgorithmStage[] {
        return this.next;
    }

    setNext(next: AlgorithmStage[]): void {
        this.next = next;
    }
}

export { AlgorithmStage };