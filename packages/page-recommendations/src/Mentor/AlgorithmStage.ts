class AlgorithmStage {
    private name: string;
    private words: string;
    private next: AlgorithmStage[];
    private previous: AlgorithmStage | null;

    constructor(name: string, words: string, next: AlgorithmStage[]) {
        this.name = name;
        this.words = words;
        this.next = next;
        this.previous = null;
    }

    setPrevious(previous: AlgorithmStage | null): void {
        this.previous = previous;
    }

    getName(): string {
        return this.name;
    }

    getWords(): string {
        return this.words;
    }

    getNext(): AlgorithmStage[] {
        return this.next;
    }

    setNext(next: AlgorithmStage[]): void {
        this.next = next;
    }
}