import { AlgorithmStage } from './AlgorithmStage.js';

abstract class Algorithm {
    protected begin: AlgorithmStage | undefined;
    public id: string;
    constructor(id: string) {
        this.id = id
    }
    public getBegin(): AlgorithmStage {
        if (!this.begin) {
            throw new Error("Begin stage is not initialized");
        }
        return this.begin;
    }
}

export { Algorithm };